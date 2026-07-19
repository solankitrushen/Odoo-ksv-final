"use client";

import { PageHeader } from "@/components/features/data-table/page-header";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePageTitle } from "@/contexts/page-title-context";
import { actionsForStatus, useRentalAction, type RentalLifecycleAction } from "@/hooks/rental/use-rental-actions";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { API_URL } from "@/lib/backend-url";
import {
  createIntentKey,
  isJpegFile,
  rentalCommand,
  rentalGet,
  rentalUploadInspectionPhoto,
  rentalUrl,
  type InspectionAngle,
} from "@/lib/rental-api";
import { formatRentalMoney } from "@/lib/rental-money";
import { labelAction, labelRentalStatus, labelShipmentStatus } from "@/lib/rental-labels";
import type { RentalDetailResponse, RentalOrder } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type PhotoUploadStatus = "idle" | "queued" | "uploading" | "done" | "error";

type PhotoSlot = {
  fileName: string | null;
  url: string | null;
  status: PhotoUploadStatus;
  error: string | null;
};

const EMPTY_SLOT: PhotoSlot = { fileName: null, url: null, status: "idle", error: null };

function photoStatusLabel(s: PhotoUploadStatus): string {
  if (s === "queued") return "Queued…";
  if (s === "uploading") return "Uploading…";
  if (s === "done") return "Uploaded";
  if (s === "error") return "Upload failed";
  return "";
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

async function fetchInvoicePdfBlob(invoiceId: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${rentalUrl(`/admin/invoices/${invoiceId}/download`)}`, {
    credentials: "include",
    headers: { "X-Auth-Scope": "admin" },
  });
  if (!res.ok) throw new Error("Could not load invoice PDF");
  return res.blob();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();
  const action = useRentalAction();

  const [inspectOpen, setInspectOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    url: string;
  } | null>(null);
  const [invoicePreviewLoadingId, setInvoicePreviewLoadingId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<InspectionAngle, PhotoSlot>>({
    front: EMPTY_SLOT,
    side: EMPTY_SLOT,
    back: EMPTY_SLOT,
  });
  const [damageRupees, setDamageRupees] = useState("0");
  const [damageGstRupees, setDamageGstRupees] = useState("0");
  const [inspectNotes, setInspectNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const invoiceBlobRef = useRef<Blob | null>(null);

  const uploadQueue = useRef<Array<{ angle: InspectionAngle; file: File; gen: number }>>([]);
  const uploadRunning = useRef(false);
  const uploadGen = useRef<Record<InspectionAngle, number>>({ front: 0, side: 0, back: 0 });
  const rentalIdRef = useRef<string | null>(null);

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: rentalKeys.rental(scope, id),
    queryFn: () => rentalGet<RentalDetailResponse>(`/admin/rentals/${id}`),
    enabled: Boolean(id),
  });

  const rental = data?.rental;
  const ops = data?.ops;
  const actions = rental ? actionsForStatus(rental.status, rental.fulfillment?.method) : [];
  const tracking = useMemo(() => ops?.shipment?.metadata?.tracking || [], [ops?.shipment]);
  // Master invoice can be (re)generated once there's something billable.
  // Clear: inspection → close+settle, or already-closed with leftover balance → settle only.
  const canGenerateInvoice = rental
    ? !["draft", "reserved", "cancelled", "cancelled_exception", "expired"].includes(rental.status)
    : false;
  // Settlement = Clear & close only (after inspection photos → status inspection).
  // No separate "Record payment" on the overdue/return path — Clear records cash.
  const canClear = rental
    ? rental.status === "inspection" ||
      (rental.status === "closed" && (rental.balanceDuePaise || 0) > 0)
    : false;
  const canRecordPayment = rental
    ? (rental.balanceDuePaise || 0) > 0 &&
      ["confirmed", "dispatch_pending", "dispatched", "active"].includes(rental.status)
    : false;
  rentalIdRef.current = rental?._id ?? null;

  const photosUploading =
    photos.front.status === "queued" ||
    photos.front.status === "uploading" ||
    photos.side.status === "queued" ||
    photos.side.status === "uploading" ||
    photos.back.status === "queued" ||
    photos.back.status === "uploading";
  const photosReady =
    photos.front.status === "done" &&
    photos.side.status === "done" &&
    photos.back.status === "done" &&
    Boolean(photos.front.url && photos.side.url && photos.back.url);

  const resetInspectionPhotos = useCallback(() => {
    uploadQueue.current = [];
    uploadGen.current = { front: 0, side: 0, back: 0 };
    setPhotos({ front: EMPTY_SLOT, side: EMPTY_SLOT, back: EMPTY_SLOT });
  }, []);

  const pumpUploadQueue = useCallback(async () => {
    if (uploadRunning.current) return;
    uploadRunning.current = true;
    while (uploadQueue.current.length) {
      const job = uploadQueue.current.shift();
      if (!job) break;
      const rentalId = rentalIdRef.current;
      if (!rentalId) {
        setPhotos((prev) => ({
          ...prev,
          [job.angle]: {
            ...prev[job.angle],
            status: "error",
            error: "Rental not loaded",
          },
        }));
        continue;
      }
      if (uploadGen.current[job.angle] !== job.gen) continue;

      setPhotos((prev) => ({
        ...prev,
        [job.angle]: { ...prev[job.angle], status: "uploading", error: null },
      }));

      try {
        const url = await rentalUploadInspectionPhoto(rentalId, job.angle, job.file);
        if (uploadGen.current[job.angle] !== job.gen) continue;
        setPhotos((prev) => ({
          ...prev,
          [job.angle]: {
            fileName: job.file.name,
            url,
            status: "done",
            error: null,
          },
        }));
      } catch (err) {
        if (uploadGen.current[job.angle] !== job.gen) continue;
        const message = err instanceof Error ? err.message : "Upload failed";
        setPhotos((prev) => ({
          ...prev,
          [job.angle]: {
            fileName: job.file.name,
            url: null,
            status: "error",
            error: message,
          },
        }));
        toast.error(`${job.angle}: ${message}`);
      }
    }
    uploadRunning.current = false;
  }, []);

  const enqueuePhoto = useCallback(
    (angle: InspectionAngle, file: File) => {
      const gen = uploadGen.current[angle] + 1;
      uploadGen.current[angle] = gen;
      uploadQueue.current = uploadQueue.current.filter((j) => j.angle !== angle);
      uploadQueue.current.push({ angle, file, gen });
      setPhotos((prev) => ({
        ...prev,
        [angle]: { fileName: file.name, url: null, status: "queued", error: null },
      }));
      void pumpUploadQueue();
    },
    [pumpUploadQueue]
  );

  useEffect(() => {
    setPageTitle({
      backHref: "/rentals",
      title: rental?.rentalNumber || "Rental",
      description: "Booking details and next steps",
    });
    return () => setPageTitle(null);
  }, [setPageTitle, rental?.rentalNumber]);

  useEffect(() => {
    if (!rental) return;
    if (rental.balanceDuePaise && rental.balanceDuePaise > 0) {
      setPayAmount(String(Math.round(rental.balanceDuePaise / 100)));
    }
  }, [rental]);

  function runLifecycle(a: RentalLifecycleAction) {
    if (!rental) return;
    if (a === "inspection") {
      resetInspectionPhotos();
      setDamageRupees(String(Math.round((rental.damagePreTaxPaise || 0) / 100)));
      setDamageGstRupees(String(Math.round((rental.damageGstPaise || 0) / 100)));
      setInspectNotes(rental.inspection?.notes || "");
      setInspectOpen(true);
      return;
    }
    let body: Record<string, unknown> | undefined;
    if (a === "cancel") {
      const reason = window.prompt("Cancel reason?", "Customer requested")?.trim();
      if (!reason) return;
      body = { reason };
    }
    action.mutate({ rentalId: rental._id, action: a, version: rental.version, body });
  }

  async function generateInvoice() {
    if (!rental) return;
    try {
      setBusy(true);
      const out = await rentalCommand<{ invoiceId?: string; invoice?: { invoiceNumber?: string } }>(
        `/admin/rentals/${rental._id}/invoice/generate`,
        "POST",
        {},
      );
      toast.success("Master invoice generated");
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
      if (out?.invoiceId) void openInvoicePreview(out.invoiceId, out.invoice?.invoiceNumber || "invoice");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate invoice");
    } finally {
      setBusy(false);
    }
  }

  async function clearAndClose() {
    if (!rental) return;
    try {
      setBusy(true);
      await rentalCommand(
        `/admin/rentals/${rental._id}/clear`,
        "POST",
        {},
        { idempotencyKey: createIntentKey() },
      );
      toast.success(
        rental.status === "closed" ? "Outstanding settled" : "Rental cleared and closed",
      );
      setClearOpen(false);
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear rental");
    } finally {
      setBusy(false);
    }
  }

  async function submitInspection() {
    if (!rental) return;
    if (photosUploading) {
      toast.error("Wait for photo uploads to finish");
      return;
    }
    if (!photosReady) {
      toast.error("Front, side, and back photos must finish uploading first");
      return;
    }
    try {
      setBusy(true);
      const toPaise = (rupees: string) => Math.max(0, Math.round(Number(rupees) * 100) || 0);
      await rentalCommand<{ rental: RentalOrder }>(
        `/admin/rentals/${rental._id}/inspection`,
        "POST",
        {
          photos: {
            front: photos.front.url,
            side: photos.side.url,
            back: photos.back.url,
          },
          damagePreTaxPaise: toPaise(damageRupees),
          damageGstPaise: toPaise(damageGstRupees),
          notes: inspectNotes.trim() || undefined,
        },
        { idempotencyKey: createIntentKey() }
      );
      toast.success("Inspection recorded");
      setInspectOpen(false);
      resetInspectionPhotos();
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (!rental) return;
    const rupees = Number(payAmount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    const due = rental.balanceDuePaise || 0;
    const chargePaise = Math.min(amountPaise, due);
    const depositPaise = Math.max(0, amountPaise - chargePaise);
    try {
      setBusy(true);
      await rentalCommand(
        `/admin/rentals/${rental._id}/payments/manual`,
        "POST",
        {
          amountPaise,
          allocation: { chargePaise, depositPaise },
          method: "cash",
          reference: `ADMIN-${rental.rentalNumber}`,
        },
        { idempotencyKey: createIntentKey() }
      );
      toast.success("Payment recorded");
      setPayOpen(false);
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => void refetch()} title="Could not load rental" />;
  }

  if (isLoading || !rental) {
    return <Skeleton className="h-48 w-full" />;
  }

  const penalty = ops?.penalty;
  const isOverdueLike = rental.status === "overdue" || (penalty?.overdueMinutes || 0) > 0;
  const email = ops?.emailDelivery || ops?.invoices?.[0]?.emailDelivery;
  const latestInvoice = ops?.invoices?.[0];
  const paymentLines = latestInvoice?.paymentLines || [];
  const rentalId = rental._id;

  async function resendInvoice() {
    try {
      setBusy(true);
      const out = await rentalCommand<{ sent?: boolean; skipped?: boolean; reason?: string; error?: string }>(
        `/admin/rentals/${rentalId}/invoices/resend`,
        "POST",
        {},
        { idempotencyKey: createIntentKey() }
      );
      if (out?.sent) toast.success("Invoice emailed to customer");
      else if (out?.skipped) toast.message(out.reason === "no_email" ? "Customer has no email" : "Email skipped");
      else toast.error(out?.error || "Could not send invoice email");
      void qc.invalidateQueries({ queryKey: rentalKeys.rental(scope, id) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  }

  function closeInvoicePreview() {
    if (invoicePreview?.url) URL.revokeObjectURL(invoicePreview.url);
    invoiceBlobRef.current = null;
    setInvoicePreview(null);
  }

  async function openInvoicePreview(invoiceId: string, invoiceNumber: string) {
    try {
      setInvoicePreviewLoadingId(invoiceId);
      if (invoicePreview?.url) URL.revokeObjectURL(invoicePreview.url);
      const blob = await fetchInvoicePdfBlob(invoiceId);
      invoiceBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setInvoicePreview({ invoiceId, invoiceNumber, url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open invoice");
    } finally {
      setInvoicePreviewLoadingId(null);
    }
  }

  function downloadOpenInvoice() {
    if (!invoicePreview || !invoiceBlobRef.current) return;
    triggerBlobDownload(invoiceBlobRef.current, `${invoicePreview.invoiceNumber || invoicePreview.invoiceId}.pdf`);
  }

  return (
    <div className="space-y-5">
      <PageHeader title={rental.rentalNumber} description={labelRentalStatus(rental.status)}>
        <StatusChip kind="rental" status={rental.status} />
        {canGenerateInvoice ? (
          <Button disabled={busy} onClick={() => void generateInvoice()} type="button">
            Generate invoice
          </Button>
        ) : null}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            disabled={action.isPending || busy}
            key={a}
            onClick={() => runLifecycle(a)}
            variant={a === "cancel" ? "outline" : "default"}
          >
            {labelAction(a)}
          </Button>
        ))}
        {canClear ? (
          <Button disabled={busy} onClick={() => setClearOpen(true)} type="button">
            {rental.status === "closed" ? "Settle balance" : "Clear & close"}
          </Button>
        ) : null}
        {canRecordPayment ? (
          <Button disabled={busy} onClick={() => setPayOpen(true)} type="button" variant="secondary">
            Record payment
          </Button>
        ) : null}
        {ops?.invoices?.length ? (
          <Button disabled={busy} onClick={() => void resendInvoice()} type="button" variant="outline">
            Resend invoice email
          </Button>
        ) : null}
      </div>

      <div
        className={
          email?.status === "sent"
            ? "rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
            : email?.status === "failed"
              ? "rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
              : "rounded-md border border-border px-4 py-3 text-sm text-muted-foreground"
        }
      >
        <p className="font-medium text-foreground">
          Invoice email:{" "}
          {email?.status === "sent"
            ? "Sent"
            : email?.status === "failed"
              ? "Failed"
              : email?.status === "skipped"
                ? "Skipped"
                : "Not sent yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {email?.to ? `To ${email.to}. ` : ""}
          {email?.sentAt ? `Sent ${fmt(email.sentAt)}. ` : ""}
          {email?.lastError ? email.lastError : "Record return or resend to email the PDF to the customer."}
        </p>
      </div>

      {isOverdueLike && penalty ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">
            {penalty.overdueLabel || "Overdue"}
            {(penalty.damagePreTaxPaise || 0) + (penalty.damageGstPaise || 0) > 0
              ? ` — damage ${formatRentalMoney((penalty.damagePreTaxPaise || 0) + (penalty.damageGstPaise || 0))}`
              : ""}
          </p>
          <p className="mt-1 text-muted-foreground">
            Due back was {fmt(penalty.plannedEndAt)}. Total payable{" "}
            {(penalty.dueBillPaise ?? penalty.balanceDuePaise ?? 0) > 0
              ? formatRentalMoney(penalty.dueBillPaise ?? penalty.balanceDuePaise)
              : "—"}.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Customer" value={rental.customerSnapshot?.displayName || "—"} />
          <Field label="Status" value={labelRentalStatus(rental.status)} />
          <Field
            label="Fulfillment"
            value={
              rental.fulfillment?.method
                ? `${rental.fulfillment.method}${rental.fulfillment.paymentStatus ? ` · ${rental.fulfillment.paymentStatus}` : ""}`
                : "—"
            }
          />
          <Field label="Start" value={fmt(rental.startAt)} />
          <Field label="Due back" value={fmt(rental.plannedEndAt || rental.endAt)} />
          <Field label="Issued" value={fmt(rental.actualIssuedAt)} />
          <Field label="Returned" value={fmt(rental.actualReturnedAt)} />
          <Field label="Amount paid" value={formatRentalMoney(rental.paymentsPaise)} />
          <Field
            label="Total payable"
            value={
              (rental.balanceDuePaise || 0) > 0
                ? formatRentalMoney(rental.balanceDuePaise)
                : formatRentalMoney(0)
            }
          />
          <Field label="Deposit held" value={formatRentalMoney(rental.depositLiabilityPaise)} />
          <Field label="Refundable deposit" value={formatRentalMoney(rental.refundableDepositPaise)} />
          <Field
            label="Settlement shortfall"
            value={
              (rental.settlementShortfallPaise || 0) > 0
                ? `-${formatRentalMoney(rental.settlementShortfallPaise)}`
                : "—"
            }
          />
        </CardContent>
      </Card>

      {(ops?.shipment || rental.fulfillment?.method === "delivery") && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Delivery</h2>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Shipment status"
                  value={labelShipmentStatus(ops?.shipment?.status || rental.fulfillment?.deliveryPromise?.status)}
                />
                <Field
                  label="Promise"
                  value={
                    ops?.shipment?.deliveryPromise?.message ||
                    rental.fulfillment?.deliveryPromise?.message ||
                    "—"
                  }
                />
                <Field label="Delivered at" value={fmt(rental.fulfillment?.deliveredAt || ops?.shipment?.metadata?.deliveredAt)} />
                <Field
                  label="Address"
                  value={
                    [rental.addresses?.delivery?.line1, rental.addresses?.delivery?.city]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
              </div>
              {tracking.length > 0 ? (
                <ol className="space-y-2 border-t border-border pt-3">
                  {tracking.map((step) => (
                    <li className="flex items-start gap-3 text-sm" key={step.code}>
                      <span
                        aria-hidden
                        className={
                          step.done
                            ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground"
                            : "mt-1.5 h-2 w-2 shrink-0 rounded-full border border-muted-foreground"
                        }
                      />
                      <div className="min-w-0">
                        <p className={step.done ? "font-medium text-foreground" : "text-muted-foreground"}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.at ? fmt(step.at) : "Pending"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {rental.status === "confirmed"
                    ? "Schedule delivery when payment is collected."
                    : "No tracking events yet."}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {penalty ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Penalties</h2>
          <Card>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Overdue" value={penalty.overdueLabel || "On time"} />
              <Field label="Damage / penalty" value={formatRentalMoney(penalty.damagePreTaxPaise)} />
              <Field label="Damage GST" value={formatRentalMoney(penalty.damageGstPaise)} />
              <Field label="Penalty total" value={formatRentalMoney(penalty.penaltyTotalPaise)} />
              <Field
                label="Total payable"
                value={
                  (penalty.dueBillPaise ?? penalty.balanceDuePaise ?? 0) > 0
                    ? formatRentalMoney(penalty.dueBillPaise ?? penalty.balanceDuePaise)
                    : formatRentalMoney(0)
                }
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Items</h2>
        <ul className="space-y-1 text-sm">
          {(rental.lines ?? []).map((line) => (
            <li className="rounded-md border px-3 py-2" key={line.lineId || `${line.variantId}-${line.quantity}`}>
              <span className="font-medium">{line.nameSnapshot || "Item"}</span>
              <span className="ml-2 text-muted-foreground">× {line.quantity}</span>
              {line.ratePaise != null ? (
                <span className="ml-2 text-muted-foreground">{formatRentalMoney(line.ratePaise)} / period</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Invoices</h2>
        {!ops?.invoices?.length ? (
          <p className="text-sm text-muted-foreground">No invoices yet (created on confirm).</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {ops.invoices.map((inv) => (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2" key={inv._id}>
                <span>
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span className="ml-2 text-muted-foreground">{inv.type || "invoice"}</span>
                  <span className="ml-2 text-muted-foreground">{fmt(inv.issuedAt)}</span>
                  {inv.emailDelivery?.status ? (
                    <span className="ml-2 text-muted-foreground">· email {inv.emailDelivery.status}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {formatRentalMoney(inv.totals?.chargeGrossPaise ?? inv.chargeGrossPaise)}
                  </span>
                  <Button
                    disabled={invoicePreviewLoadingId === inv._id}
                    onClick={() => void openInvoicePreview(inv._id, inv.invoiceNumber)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {invoicePreviewLoadingId === inv._id ? "…" : "PDF"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {paymentLines.length > 0 ? (
          <div className="rounded-md border px-3 py-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Payment & deposit lines (same PDF)</p>
            <ul className="space-y-1 text-sm">
              {paymentLines.map((pl, i) => (
                <li className="flex justify-between gap-3" key={`${pl.kind}-${pl.at}-${i}`}>
                  <span className="text-muted-foreground">
                    {(pl.kind || "payment").replace(/_/g, " ")}
                    {pl.reference ? ` · ${pl.reference}` : ""}
                    {pl.reason ? ` · ${pl.reason}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatRentalMoney(pl.amountPaise)}
                    {pl.depositPaise ? ` (dep ${formatRentalMoney(pl.depositPaise)})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {rental.notes ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notes: </span>
          {rental.notes}
        </p>
      ) : null}

      {rental.customerId ? (
        <Button asChild className="px-0" variant="link">
          <Link href={`/customers/${rental.customerId}`}>Open customer history</Link>
        </Button>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          setInspectOpen(open);
          if (!open) resetInspectionPhotos();
        }}
        open={inspectOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish check</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              JPEG only (.jpg / .jpeg). Each photo uploads as soon as you select it.
            </p>
            {(
              [
                ["p-front", "Front", "front"],
                ["p-side", "Side", "side"],
                ["p-back", "Back", "back"],
              ] as const
            ).map(([id, label, angle]) => {
              const slot = photos[angle];
              const inFlight = slot.status === "queued" || slot.status === "uploading";
              return (
                <div className="space-y-2" key={id}>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={id}>{label}</Label>
                    {slot.status !== "idle" ? (
                      <span
                        className={
                          slot.status === "done"
                            ? "inline-flex items-center gap-1 text-xs text-emerald-500"
                            : slot.status === "error"
                              ? "text-xs text-destructive"
                              : "inline-flex items-center gap-1 text-xs text-muted-foreground"
                        }
                      >
                        {inFlight ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                        {photoStatusLabel(slot.status)}
                      </span>
                    ) : null}
                  </div>
                  <div className="relative overflow-hidden rounded-md">
                    <Input
                      accept=".jpg,.jpeg,image/jpeg"
                      aria-busy={inFlight || undefined}
                      className="cursor-pointer"
                      disabled={busy || slot.status === "uploading"}
                      id={id}
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        if (!f) return;
                        if (!isJpegFile(f)) {
                          toast.error(`${label} photo must be a JPEG (.jpg / .jpeg)`);
                          e.target.value = "";
                          return;
                        }
                        enqueuePhoto(angle, f);
                      }}
                      type="file"
                    />
                    {inFlight ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border"
                      >
                        <div
                          className={
                            slot.status === "uploading"
                              ? "h-full w-1/3 bg-foreground animate-inspect-upload-line"
                              : "h-full w-full animate-pulse bg-muted-foreground/50"
                          }
                        />
                      </div>
                    ) : null}
                    {slot.status === "done" ? (
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500" />
                    ) : null}
                  </div>
                  {slot.fileName ? (
                    <p className="truncate text-xs text-muted-foreground">{slot.fileName}</p>
                  ) : null}
                  {slot.status === "error" && slot.error ? (
                    <p className="text-xs text-destructive">{slot.error}</p>
                  ) : null}
                </div>
              );
            })}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="damage">Damage (₹)</Label>
                <Input
                  id="damage"
                  min={0}
                  onChange={(e) => setDamageRupees(e.target.value)}
                  step="0.01"
                  type="number"
                  value={damageRupees}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="damage-gst">Damage GST (₹)</Label>
                <Input
                  id="damage-gst"
                  min={0}
                  onChange={(e) => setDamageGstRupees(e.target.value)}
                  step="0.01"
                  type="number"
                  value={damageGstRupees}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Total payable on the invoice = charges (rent + damage) − rent already paid − deposit held. Any deposit
              left over is refundable.
            </p>
            <div className="space-y-2">
              <Label htmlFor="insp-notes">Notes</Label>
              <Input id="insp-notes" onChange={(e) => setInspectNotes(e.target.value)} value={inspectNotes} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setInspectOpen(false);
                resetInspectionPhotos();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || photosUploading || !photosReady}
              onClick={() => void submitInspection()}
              type="button"
            >
              {busy ? "Saving…" : photosUploading ? "Uploading photos…" : "Save inspection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setClearOpen} open={clearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rental.status === "closed" ? "Settle total payable?" : "Clear and close this rental?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rental.status === "closed"
                ? `Record cash for the remaining payable ${formatRentalMoney(rental.balanceDuePaise || 0)}. The rental stays closed.`
                : `Deposit and rent already paid are credited first, then cash is recorded for the remaining payable ${formatRentalMoney(rental.balanceDuePaise || 0)}, and the rental is closed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void clearAndClose();
              }}
            >
              {busy ? "Working…" : rental.status === "closed" ? "Settle" : "Clear & close"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setPayOpen} open={payOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Log a cash receipt against this rental. Total payable{" "}
              {formatRentalMoney(rental.balanceDuePaise)}. Amount applies to charges first, then
              deposit. Does not close the rental — use Clear &amp; close for full settlement.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pay-amt">Amount (₹)</Label>
              <Input id="pay-amt" min={1} onChange={(e) => setPayAmount(e.target.value)} type="number" value={payAmount} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPayOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submitPayment()} type="button">
              {busy ? "Saving…" : "Record cash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) closeInvoicePreview();
        }}
        open={Boolean(invoicePreview)}
      >
        <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              Invoice {invoicePreview?.invoiceNumber || ""}
            </DialogTitle>
          </DialogHeader>
          {invoicePreview?.url ? (
            <iframe
              className="min-h-[60vh] w-full flex-1 rounded-md border bg-white"
              src={invoicePreview.url}
              title={`Invoice ${invoicePreview.invoiceNumber}`}
            />
          ) : null}
          <DialogFooter>
            <Button onClick={closeInvoicePreview} type="button" variant="outline">
              Close
            </Button>
            <Button onClick={downloadOpenInvoice} type="button">
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}
