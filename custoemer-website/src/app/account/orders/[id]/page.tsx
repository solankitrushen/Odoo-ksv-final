"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Package,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  CreditCard,
  FileText,
  Download,
} from "lucide-react";
import {
  downloadRentalInvoice,
  fetchRental,
  fetchRentalDepositEntries,
  fetchRentalInvoice,
  fetchRentalPayments,
  fetchRentalPenalty,
} from "@/lib/rental-api";
import { useAuth } from "@/lib/auth-store";
import { formatINR } from "@/lib/money";
import { fmtDate, rentalStatusMeta } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAuthenticated } = useAuth();
  const [dlBusy, setDlBusy] = useState(false);
  const [dlErr, setDlErr] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["rental", id],
    queryFn: () => fetchRental(id),
    enabled: isAuthenticated,
  });
  const { data: paymentsData } = useQuery({
    queryKey: ["rental-payments", id],
    queryFn: () => fetchRentalPayments(id),
    enabled: isAuthenticated,
  });
  const { data: depositsData } = useQuery({
    queryKey: ["rental-deposits", id],
    queryFn: () => fetchRentalDepositEntries(id),
    enabled: isAuthenticated,
  });
  const showPenalty =
    data?.rental?.status === "overdue" ||
    data?.rental?.status === "closed" ||
    (data?.rental?.lateFeePaise ?? 0) > 0 ||
    (data?.rental?.balanceDuePaise ?? 0) > 0;
  const { data: penalty } = useQuery({
    queryKey: ["rental-penalty", id],
    queryFn: () => fetchRentalPenalty(id),
    enabled: isAuthenticated && Boolean(showPenalty),
  });
  const { data: invoiceData } = useQuery({
    queryKey: ["rental-invoice", id],
    queryFn: () => fetchRentalInvoice(id),
    enabled: isAuthenticated && Boolean(showPenalty || data?.rental?.status === "confirmed"),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const order = data?.rental;
  if (!order) {
    return (
      <div className="rounded-xl border border-dashed border-line py-16 text-center">
        <p className="text-sm font-medium text-ink">Order not found</p>
        <Link href="/account/orders" className="mt-3 inline-block text-sm text-ink underline">
          Back to rentals
        </Link>
      </div>
    );
  }

  const meta = rentalStatusMeta(order.status);
  const deposit = order.depositSnapshot?.depositPaise ?? 0;
  const lateFeeShown = penalty?.lateFeePaise ?? order.lateFeePaise ?? 0;
  const lateGstShown = penalty?.lateGstPaise ?? order.lateGstPaise ?? 0;
  const total =
    order.preTaxSubtotalPaise +
    order.bookedGstPaise +
    lateFeeShown +
    lateGstShown +
    (penalty?.damagePreTaxPaise ?? 0) +
    (penalty?.damageGstPaise ?? 0);
  const hasPricing = order.preTaxSubtotalPaise > 0 || order.bookedGstPaise > 0;
  const fulfillment = order.fulfillment as Record<string, unknown> | null | undefined;
  const paymentStatus =
    typeof fulfillment?.paymentStatus === "string" ? fulfillment.paymentStatus : null;
  const pendingPayment = fulfillment?.pendingPayment as
    | { orderId?: string; amountPaise?: number; chargePaise?: number; depositPaise?: number; createdAt?: string }
    | undefined;
  const payments = paymentsData?.items ?? [];
  const depositEntries = depositsData?.items ?? [];
  const dueBill = penalty?.dueBillPaise ?? order.balanceDuePaise ?? 0;
  const invoice = invoiceData?.invoice;
  const hasPenaltyCharges =
    lateFeeShown > 0 ||
    lateGstShown > 0 ||
    (penalty?.damagePreTaxPaise ?? 0) > 0 ||
    (penalty?.overdueMinutes ?? 0) > 0 ||
    dueBill > 0;

  async function onDownloadInvoice() {
    setDlBusy(true);
    setDlErr(null);
    try {
      await downloadRentalInvoice(id);
    } catch (e) {
      setDlErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDlBusy(false);
    }
  }

  return (
    <div>
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> My rentals
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="tnum text-2xl font-semibold text-ink">{order.rentalNumber}</h1>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">Placed {fmtDate(order.createdAt)}</p>
        </div>
        {order.notes && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink">
            <Package className="h-4 w-4 text-ink-soft" />
            {order.notes}
          </div>
        )}
      </div>

      {/* Overdue / due bill banner */}
      {(order.status === "overdue" || dueBill > 0 || hasPenaltyCharges) && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/8 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger">
              {order.status === "overdue"
                ? "This rental is overdue"
                : dueBill > 0
                  ? "Outstanding balance"
                  : "Penalty charges applied"}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {penalty?.overdueMinutes
                ? `Overdue ${penalty.overdueLabel}. `
                : ""}
              {lateFeeShown > 0
                ? `Late fee ${formatINR(lateFeeShown)}${lateGstShown > 0 ? ` + GST ${formatINR(lateGstShown)}` : ""}. `
                : ""}
              {dueBill > 0
                ? `Due bill ${formatINR(dueBill)}.`
                : order.status === "overdue"
                  ? "Return the gear to stop further charges."
                  : ""}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Lines + timeline */}
        <div>
          <h2 className="text-base font-medium text-ink">Items</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
            {order.lines.map((line) => (
              <li key={line.lineId} className="flex gap-4 p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-muted">
                  <Package className="h-6 w-6 text-ink-soft" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {line.nameSnapshot ?? "Rental item"}
                  </p>
                  <p className="tnum mt-1 text-xs text-ink-soft">
                    {line.ratePaise != null
                      ? `${formatINR(line.ratePaise)}/${line.periodCode} × ${line.quantity}`
                      : `Qty ${line.quantity} · billed per ${line.periodCode}`}
                  </p>
                </div>
                <span className="tnum text-sm font-medium text-ink">
                  {line.linePreTaxPaise > 0 ? formatINR(line.linePreTaxPaise) : "—"}
                </span>
              </li>
            ))}
          </ul>

          {/* Rental window timeline */}
          <h2 className="mt-8 text-base font-medium text-ink">Rental window</h2>
          <div className="mt-3 rounded-xl border border-line bg-card p-5">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-2xs uppercase tracking-wide text-ink-soft">Start</p>
                <p className="tnum mt-0.5 font-medium text-ink">{fmtDate(order.startAt)}</p>
              </div>
              <div className="mx-4 h-px flex-1 bg-line" />
              <div className="text-right">
                <p className="text-2xs uppercase tracking-wide text-ink-soft">Due back</p>
                <p className="tnum mt-0.5 font-medium text-ink">{fmtDate(order.endAt)}</p>
              </div>
            </div>
            {order.actualReturnedAt && (
              <p className="tnum mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-success">
                <ShieldCheck className="h-4 w-4" /> Returned {fmtDate(order.actualReturnedAt)}
              </p>
            )}
          </div>

          <FulfilmentBlock fulfillment={order.fulfillment} addresses={order.addresses} />

          {hasPenaltyCharges && (
            <>
              <h2 className="mt-8 text-base font-medium text-ink">Penalties &amp; due bill</h2>
              <div className="mt-3 rounded-xl border border-danger/25 bg-card p-5">
                <dl className="space-y-2.5 text-sm">
                  <Row
                    label="Overdue time"
                    value={penalty?.overdueLabel ?? (order.status === "overdue" ? "Accruing…" : "—")}
                    tone={penalty?.overdueMinutes ? "danger" : undefined}
                  />
                  {penalty?.plannedEndAt && (
                    <Row label="Planned return" value={fmtDate(penalty.plannedEndAt)} />
                  )}
                  {penalty?.actualReturnedAt && (
                    <Row label="Actual return" value={fmtDate(penalty.actualReturnedAt)} />
                  )}
                  <Separator className="my-1" />
                  <Row label="Late fee" value={formatINR(lateFeeShown)} tone={lateFeeShown > 0 ? "danger" : undefined} />
                  {lateGstShown > 0 && (
                    <Row label="Late fee GST" value={formatINR(lateGstShown)} tone="danger" />
                  )}
                  {(penalty?.damagePreTaxPaise ?? 0) > 0 && (
                    <Row
                      label="Damage"
                      value={formatINR(penalty!.damagePreTaxPaise + (penalty!.damageGstPaise || 0))}
                      tone="danger"
                    />
                  )}
                  <Separator className="my-1" />
                  <Row
                    label="Penalty total"
                    value={formatINR(penalty?.penaltyTotalPaise ?? lateFeeShown + lateGstShown)}
                    strong
                    tone="danger"
                  />
                  <Row
                    label="Due bill"
                    value={formatINR(dueBill)}
                    strong
                    tone={dueBill > 0 ? "danger" : undefined}
                  />
                </dl>
                <p className="mt-3 text-xs text-ink-soft">
                  Late fees and damage may be settled from your deposit. Any shortfall stays as due bill.
                </p>
              </div>
            </>
          )}

          {(invoice || showPenalty || order.status === "confirmed") && (
            <>
              <h2 className="mt-8 text-base font-medium text-ink">Invoice</h2>
              <div className="mt-3 rounded-xl border border-line bg-card p-5">
                {invoice ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 text-ink-soft" />
                      <div>
                        <p className="tnum text-sm font-medium text-ink">{invoice.invoiceNumber}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {invoice.type?.replaceAll("_", " ") ?? "invoice"}
                          {invoice.issuedAt ? ` · ${fmtDate(invoice.issuedAt)}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Also emailed to your account address when issued.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={dlBusy}
                      onClick={onDownloadInvoice}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {dlBusy ? "Downloading…" : "Download PDF"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">
                    Invoice appears here once your rental is confirmed or closed. A copy is emailed to you.
                  </p>
                )}
                {dlErr && <p className="mt-2 text-xs text-danger">{dlErr}</p>}
              </div>
            </>
          )}
        </div>

        {/* Money column */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-card p-6">
            <h2 className="text-base font-medium text-ink">Payment</h2>
            {paymentStatus && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="text-sm text-ink-soft">Payment status</span>
                <PaymentStatusBadge status={paymentStatus} />
              </div>
            )}
            {hasPricing ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row label="Subtotal" value={formatINR(order.preTaxSubtotalPaise)} />
                <Row label="GST" value={formatINR(order.bookedGstPaise)} />
                {lateFeeShown > 0 && (
                  <Row label="Late fee" value={formatINR(lateFeeShown)} tone="danger" />
                )}
                {lateGstShown > 0 && (
                  <Row label="Late GST" value={formatINR(lateGstShown)} tone="danger" />
                )}
                {(penalty?.damagePreTaxPaise ?? 0) > 0 && (
                  <Row
                    label="Damage"
                    value={formatINR((penalty?.damagePreTaxPaise ?? 0) + (penalty?.damageGstPaise ?? 0))}
                    tone="danger"
                  />
                )}
                <Separator className="my-1" />
                <Row label="Total" value={formatINR(total)} strong />
                {dueBill > 0 && (
                  <Row label="Due bill" value={formatINR(dueBill)} strong tone="danger" />
                )}
                {deposit > 0 && (
                  <Row label="Security deposit" value={formatINR(deposit)} />
                )}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                Pricing is confirmed when your request is reviewed.
              </p>
            )}

            {pendingPayment?.orderId && paymentStatus !== "paid" && (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2.5 text-sm">
                <p className="font-medium text-ink">Checkout pending</p>
                <p className="mt-0.5 text-ink-soft">
                  {formatINR(pendingPayment.amountPaise ?? 0)} due (
                  {formatINR(pendingPayment.chargePaise ?? 0)} rental +{" "}
                  {formatINR(pendingPayment.depositPaise ?? 0)} deposit)
                </p>
              </div>
            )}

            {payments.length > 0 && (
              <>
                <Separator className="my-5" />
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <CreditCard className="h-4 w-4" /> Transactions
                </h3>
                <ul className="mt-3 space-y-3">
                  {payments.map((p) => (
                    <li key={p._id} className="rounded-lg border border-line px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="capitalize text-ink">{p.direction}</span>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      <p className="tnum mt-1 font-medium text-ink">{formatINR(p.amountPaise)}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {p.method.replaceAll("_", " ")}
                        {(p.allocation?.chargePaise ?? 0) > 0 || (p.allocation?.depositPaise ?? 0) > 0
                          ? ` · ${formatINR(p.allocation?.chargePaise ?? 0)} rental / ${formatINR(p.allocation?.depositPaise ?? 0)} deposit`
                          : ""}
                      </p>
                      <p className="tnum mt-1 text-2xs text-ink-soft">
                        {fmtDate(p.createdAt)}
                        {(p.providerPaymentId || p.reference) &&
                          ` · ${p.providerPaymentId ?? p.reference}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Separator className="my-5" />

            <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <ShieldCheck className="h-4 w-4" /> Deposit
            </h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Deposit amount" value={formatINR(deposit)} />
              {(order.depositCollectedPaise ?? 0) > 0 && (
                <Row label="Collected" value={formatINR(order.depositCollectedPaise ?? 0)} />
              )}
              {(order.depositRefundsCompletedPaise ?? 0) > 0 && (
                <Row label="Refunded" value={formatINR(order.depositRefundsCompletedPaise ?? 0)} />
              )}
            </dl>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm text-ink-soft">
                {(order.depositRefundsCompletedPaise ?? 0) > 0 ? "Refunded" : "Refundable"}
              </span>
              <span className="tnum text-sm font-semibold text-ink">
                {formatINR(
                  (order.depositRefundsCompletedPaise ?? 0) > 0
                    ? (order.depositRefundsCompletedPaise ?? 0)
                    : deposit,
                )}
              </span>
            </div>

            {depositEntries.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {depositEntries.map((d) => (
                  <li key={d._id} className="flex items-center justify-between text-xs">
                    <span className="text-ink-soft">
                      {d.eventType.replaceAll("_", " ")}
                      {d.category ? ` · ${d.category}` : ""}
                    </span>
                    <span className="tnum font-medium text-ink">{formatINR(d.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const good = new Set(["paid", "captured", "processed"]);
  const bad = new Set(["failed", "cancelled", "voided"]);
  const variant = good.has(status) ? "success" : bad.has(status) ? "danger" : "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function FulfilmentBlock({
  fulfillment,
  addresses,
}: {
  fulfillment?: Record<string, unknown> | null;
  addresses?: Record<string, unknown> | null;
}) {
  const method = typeof fulfillment?.method === "string" ? fulfillment.method : null;
  const delivery = addresses?.delivery as
    | { fullName?: string; phone?: string; line1?: string; city?: string; pincode?: string }
    | undefined;
  const isPickup = method === "pickup" || method === "store_pickup";

  if (!method && !delivery) return null;

  return (
    <>
      <h2 className="mt-8 text-base font-medium text-ink">Fulfilment</h2>
      <div className="mt-3 rounded-xl border border-line bg-card p-5">
        {isPickup ? (
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <MapPin className="h-4 w-4" /> Store pickup
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Pickup depot and timing are confirmed by our team and emailed to you.
            </p>
          </div>
        ) : delivery ? (
          <div>
            <p className="text-sm font-medium text-ink">Delivery</p>
            <p className="mt-1 text-sm text-ink-soft">
              {delivery.fullName}
              {delivery.phone ? ` · ${delivery.phone}` : ""}
              <br />
              {[delivery.line1, delivery.city, delivery.pincode].filter(Boolean).join(", ")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{method ?? "Fulfilment details on file"}</p>
        )}
      </div>
    </>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-medium text-ink" : "text-ink-soft"}>{label}</dt>
      <dd
        className={cn(
          "tnum",
          strong ? "font-semibold text-ink" : "text-ink",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
