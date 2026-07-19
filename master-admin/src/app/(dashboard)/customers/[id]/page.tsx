"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { actionsForStatus, useRentalAction, type RentalLifecycleAction } from "@/hooks/rental/use-rental-actions";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import { labelAction, labelCustomerStatus } from "@/lib/rental-labels";
import { formatRentalMoney } from "@/lib/rental-money";
import type {
  Customer,
  CustomerActivity,
  CustomerAddress,
  PageResult,
  RentalOrder,
} from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const OPEN: Set<string> = new Set([
  "draft",
  "reserved",
  "confirmed",
  "dispatch_pending",
  "dispatched",
  "active",
  "overdue",
  "return_pending",
  "returned",
  "inspection",
  "exception",
]);

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatAddress(a: CustomerAddress) {
  const parts = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean);
  return parts.join(", ") || "—";
}

/** Zero / missing money → "—"; keeps metric cards scannable. */
function moneyOrDash(paise?: number | null) {
  if (paise == null || paise === 0) return "—";
  return formatRentalMoney(paise);
}

function countOrDash(n?: number | null) {
  if (n == null || n === 0) return "—";
  return String(n);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const customerQ = useQuery({
    queryKey: rentalKeys.customer(scope, id),
    queryFn: () =>
      rentalGet<{ customer: Customer; activity: CustomerActivity }>(`/admin/customers/${id}`),
    enabled: Boolean(id),
  });

  const rentalsQ = useQuery({
    queryKey: rentalKeys.rentals(scope, { customerId: id, limit: 100 }),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<RentalOrder>>("/admin/rentals", { customerId: id, limit: 100 }),
      ),
    enabled: Boolean(id),
  });

  const customer = customerQ.data?.customer;
  const activity = customerQ.data?.activity;
  const rentals = rentalsQ.data?.items ?? [];

  const { current, past } = useMemo(() => {
    const current = rentals.filter((r) => OPEN.has(r.status));
    const past = rentals.filter((r) => !OPEN.has(r.status));
    return { current, past };
  }, [rentals]);

  useEffect(() => {
    setPageTitle({
      backHref: "/customers",
      title: customer?.displayName || "Customer",
      description: "Customer account",
    });
    return () => setPageTitle(null);
  }, [setPageTitle, customer?.displayName]);

  // Legacy ?edit=1 → dedicated edit page
  useEffect(() => {
    if (search.get("edit") === "1" && id) {
      router.replace(`/customers/${id}/edit`);
    }
  }, [search, id, router]);

  async function runStatus(next: "blocked" | "active" | "archived") {
    if (!customer) return;
    const reason = window.prompt(
      next === "blocked"
        ? "Why block this customer? (overdues, unpaid penalties…)"
        : next === "archived"
          ? "Why deactivate this customer?"
          : "Reason for unblocking (optional):",
      customer.statusReason || "",
    );
    if (reason === null) return;
    if (next !== "active" && !reason.trim()) {
      toast.error("Add a short reason");
      return;
    }
    setBusy(true);
    try {
      const path =
        next === "archived"
          ? `/admin/customers/${customer._id}`
          : next === "blocked"
            ? `/admin/customers/${customer._id}/block`
            : `/admin/customers/${customer._id}/unblock`;
      await rentalCommand(
        path,
        next === "archived" ? "DELETE" : "POST",
        { reason: reason.trim() || undefined },
        { version: customer.version ?? 0 },
      );
      toast.success(
        next === "blocked" ? "Customer blocked" : next === "archived" ? "Customer deactivated" : "Customer unblocked",
      );
      await qc.invalidateQueries({ queryKey: rentalKeys.customer(scope, id) });
      await qc.invalidateQueries({ queryKey: ["rental", scope, "customers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  if (customerQ.isError) {
    return (
      <ErrorState
        message={customerQ.error?.message}
        onRetry={() => void customerQ.refetch()}
        title="Could not load customer"
      />
    );
  }

  if (customerQ.isLoading || !customer) {
    return <Skeleton className="h-48 w-full" />;
  }

  const addresses = (customer.addresses || []) as CustomerAddress[];
  const blocked = customer.status === "blocked";
  const inactive = customer.status === "archived";

  return (
    <div className="space-y-5">
      <PageHeader title={customer.displayName} description={customer.customerNumber || undefined}>
        <Button
          disabled={busy || inactive}
          onClick={() => router.push(`/customers/${customer._id}/edit`)}
        >
          Edit
        </Button>
        {blocked ? (
          <Button disabled={busy} onClick={() => void runStatus("active")} variant="outline">
            Unblock
          </Button>
        ) : (
          <Button
            disabled={busy || inactive}
            onClick={() => void runStatus("blocked")}
            variant="destructiveSoft"
          >
            Block
          </Button>
        )}
        <RowActionsMenu
          label={`More actions for ${customer.displayName}`}
          actions={[
            {
              label: "Deactivate",
              onSelect: () => void runStatus("archived"),
              disabled: busy || inactive,
            },
            {
              label: "Delete",
              onSelect: () => void runStatus("archived"),
              disabled: busy || inactive,
            },
          ]}
        />
      </PageHeader>

      {blocked ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Blocked</p>
            <p className="mt-1 text-sm text-foreground">
              {customer.statusReason || "No reason recorded. Check overdue rentals and unpaid penalties below."}
            </p>
            {activity &&
            (activity.overdueCount > 0 ||
              activity.openBalancePaise > 0 ||
              (activity.depositHeldPaise ?? 0) > 0 ||
              activity.lateFeeTotalPaise > 0) ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {activity.overdueCount > 0 ? `${activity.overdueCount} overdue rental(s). ` : ""}
                {activity.openBalancePaise > 0
                  ? `Still owes ${formatRentalMoney(activity.openBalancePaise)}. `
                  : ""}
                {(activity.depositHeldPaise ?? 0) > 0
                  ? `Deposit held ${formatRentalMoney(activity.depositHeldPaise)}. `
                  : ""}
                {activity.lateFeeTotalPaise > 0
                  ? `Late fees charged ${formatRentalMoney(activity.lateFeeTotalPaise)}.`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Rentals" value={countOrDash(activity?.rentalCount ?? rentals.length)} />
        <Metric
          label="Overdue"
          value={countOrDash(activity?.overdueCount)}
          danger={(activity?.overdueCount ?? 0) > 0}
        />
        <Metric label="Rent" value={moneyOrDash(activity?.rentCollectedPaise)} />
        <Metric label="Deposit held" value={moneyOrDash(activity?.depositHeldPaise)} />
        <Metric label="Late fees" value={moneyOrDash(activity?.lateFeeTotalPaise)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={customer.displayName} />
          <Field label="Customer number" value={customer.customerNumber || "—"} />
          <Field label="Account status" value={labelCustomerStatus(customer.status)} />
          <Field label="Type" value={customer.type === "business" ? "Business" : "Person"} />
          <Field label="Email" value={customer.email || "—"} />
          <Field label="Phone" value={customer.phone || "—"} />
          <Field label="GSTIN" value={customer.gstin || "—"} />
          <Field label="Portal login" value={customer.portalAccess ? "Yes" : "No"} />
          <Field label="Legal name" value={customer.legalName || "—"} />
          <Field label="Notes" value={customer.notes || "—"} />
          <Field label="Status reason" value={customer.statusReason || "—"} />
          <Field label="Created" value={fmt(customer.createdAt)} />
        </CardContent>
      </Card>

      {activity?.lastInvoice ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Last invoice</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium tabular-nums text-foreground">{activity.lastInvoice.invoiceNumber}</p>
              <p className="mt-0.5 text-muted-foreground">
                {activity.lastInvoice.type?.replaceAll("_", " ") || "invoice"}
                {activity.lastInvoice.issuedAt ? ` · ${fmt(activity.lastInvoice.issuedAt)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular-nums font-medium">
                {formatRentalMoney(activity.lastInvoice.chargeGrossPaise ?? 0)}
              </p>
              {(activity.lastInvoice.balanceDuePaise ?? 0) > 0 ? (
                <p className="text-xs text-destructive">
                  Due -{formatRentalMoney(activity.lastInvoice.balanceDuePaise)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No amount due</p>
              )}
            </div>
            {activity.lastInvoice.rentalId ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/rentals/${activity.lastInvoice.rentalId}`}>Open rental</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Product history</CardTitle>
        </CardHeader>
        <CardContent>
          {!activity?.productHistory?.length ? (
            <EmptyState message="No rental product history yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Rentals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.productHistory.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.rentalCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <EmptyState message="No addresses on file." />
          ) : (
            <ul className="space-y-3">
              {addresses.map((a, i) => (
                <li className="rounded-md border px-3 py-2.5 text-sm" key={a.id || i}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.label || "Address"}</span>
                    {a.isDefault ? <span className="text-xs text-muted-foreground">Default</span> : null}
                  </div>
                  {a.fullName ? <p className="mt-1 text-muted-foreground">{a.fullName}</p> : null}
                  <p className="mt-0.5 text-foreground">{formatAddress(a)}</p>
                  {a.phone ? <p className="mt-0.5 text-muted-foreground">{a.phone}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RentalSection
        empty="No open rentals for this customer."
        items={current}
        loading={rentalsQ.isLoading}
        title="Current rentals"
      />
      <RentalSection
        empty="No past rentals yet."
        items={past}
        loading={rentalsQ.isLoading}
        title="Past rentals"
      />
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function RentalSection({
  title,
  items,
  empty,
  loading,
}: {
  title: string;
  items: RentalOrder[];
  empty: string;
  loading: boolean;
}) {
  const router = useRouter();
  const action = useRentalAction();
  const paged = useClientPagination(items, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${title}|${items.length}`,
  });

  function runAction(r: RentalOrder, a: RentalLifecycleAction) {
    let body: Record<string, unknown> | undefined;
    if (a === "cancel") {
      const reason = window.prompt("Cancel reason?", "Customer requested")?.trim();
      if (!reason) return;
      body = { reason };
    }
    if (a === "inspection") {
      router.push(`/rentals/${r._id}`);
      return;
    }
    action.mutate({ rentalId: r._id, action: a, version: r.version, body });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <Table
          footer={
            <TablePagination
              limit={paged.pageSize}
              onPageChange={paged.setPage}
              page={paged.page}
              total={paged.total}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Rental</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Due back</TableHead>
              <TableHead className="text-right">Late fee</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((r) => {
              const next = actionsForStatus(r.status, r.fulfillment?.method);
              return (
                <ClickableRow href={`/rentals/${r._id}`} key={r._id} label={`Open ${r.rentalNumber}`}>
                  <TableCell className="font-medium">{r.rentalNumber}</TableCell>
                  <TableCell>
                    <StatusChip kind="rental" status={r.status} />
                  </TableCell>
                  <TableCell>{fmt(r.startAt)}</TableCell>
                  <TableCell>{fmt(r.plannedEndAt || r.endAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{moneyOrDash(r.lateFeePaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{moneyOrDash(r.balanceDuePaise)}</TableCell>
                  <TableCell className="text-right">
                    <RowActionsMenu
                      actions={
                        next.length
                          ? next.map((a) => ({
                              label: labelAction(a),
                              onSelect: () => runAction(r, a),
                            }))
                          : [
                              {
                                label: "Manage",
                                onSelect: () => router.push(`/rentals/${r._id}`),
                              },
                            ]
                      }
                    />
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}
