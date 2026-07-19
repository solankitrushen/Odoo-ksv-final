"use client";

import {
  AnalyticsRangeControl,
  analyticsGroupBy,
  analyticsRangeBounds,
  toYmd,
  type AnalyticsRangePreset,
} from "@/components/features/dashboard/analytics-range-control";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { KpiCard } from "@/components/features/dashboard/kpi-card";
import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { PaymentAnalyticsCharts } from "@/components/features/payments/payment-analytics-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { downloadTextFile, paymentsToCsv } from "@/lib/payment-csv";
import { normalizePage, rentalGet } from "@/lib/rental-api";
import { labelStatus } from "@/lib/rental-labels";
import { formatRentalMoney } from "@/lib/rental-money";
import type {
  Customer,
  PageResult,
  PaymentAnalytics,
  PaymentExportResult,
  RentalPayment,
} from "@/lib/rental-types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Download,
  Loader2,
  Receipt,
  Search,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const METHOD_FILTERS = [
  { value: "all", label: "All methods" },
  { value: "razorpay", label: "Razorpay" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi_manual", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other_manual", label: "Other" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "captured", label: "Captured" },
  { value: "pending", label: "Pending" },
  { value: "authorized", label: "Authorized" },
  { value: "failed", label: "Failed" },
  { value: "processed", label: "Processed" },
  { value: "voided", label: "Voided" },
] as const;

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function PaymentsPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const [page, setPage] = useState(1);
  const [preset, setPreset] = useState<AnalyticsRangePreset>("month");
  const [customFrom, setCustomFrom] = useState(() => toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => toYmd(new Date()));
  const [customerId, setCustomerId] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [logQ, setLogQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(logQ.trim()), 250);
    return () => window.clearTimeout(t);
  }, [logQ]);

  const bounds = useMemo(
    () => analyticsRangeBounds(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const groupBy = useMemo(
    () => analyticsGroupBy(bounds.from, bounds.to),
    [bounds.from, bounds.to],
  );

  const listFilters = useMemo(
    () => ({
      page,
      limit: LIST_PAGE_SIZE,
      from: bounds.from,
      to: bounds.to,
      customerId: customerId === "all" ? undefined : customerId,
      method: method === "all" ? undefined : method,
      status: status === "all" ? undefined : status,
      q: debouncedQ || undefined,
    }),
    [page, bounds.from, bounds.to, customerId, method, status, debouncedQ],
  );

  const analyticsFilters = useMemo(
    () => ({
      from: bounds.from,
      to: bounds.to,
      customerId: customerId === "all" ? undefined : customerId,
      groupBy,
    }),
    [bounds.from, bounds.to, customerId, groupBy],
  );

  const customersQ = useQuery({
    queryKey: rentalKeys.customers(scope, { limit: 100, status: "active" }),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<Customer>>("/admin/customers", {
          limit: 100,
          status: "active",
        }),
      ),
  });

  const analyticsQ = useQuery({
    queryKey: rentalKeys.analyticsPayments(scope, analyticsFilters),
    queryFn: () => rentalGet<PaymentAnalytics>("/admin/analytics/payments", analyticsFilters),
  });

  const listQ = useQuery({
    queryKey: rentalKeys.payments(scope, listFilters),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<RentalPayment>>("/admin/payments", listFilters)),
  });

  useEffect(() => {
    setPageTitle({ title: "Payments", description: "Analytics, logs, and CSV export" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  useEffect(() => {
    setPage(1);
  }, [bounds.from, bounds.to, customerId, method, status, debouncedQ]);

  async function exportCsv() {
    setExporting(true);
    try {
      const out = await rentalGet<PaymentExportResult>("/admin/payments/export", {
        from: bounds.from,
        to: bounds.to,
        customerId: customerId === "all" ? undefined : customerId,
        method: method === "all" ? undefined : method,
        status: status === "all" ? undefined : status,
        q: debouncedQ || undefined,
      });
      if (!out.items?.length) {
        toast.message("Nothing to export for this filter");
        return;
      }
      const stamp = toYmd(new Date());
      downloadTextFile(`payments-${stamp}.csv`, paymentsToCsv(out.items));
      toast.success(
        out.truncated
          ? `Exported first ${out.exportMax} rows (cap reached)`
          : `Exported ${out.total} payment${out.total === 1 ? "" : "s"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (listQ.isError && analyticsQ.isError) {
    return (
      <ErrorState
        message={listQ.error?.message || analyticsQ.error?.message}
        onRetry={() => {
          void listQ.refetch();
          void analyticsQ.refetch();
        }}
        title="Could not load payments"
      />
    );
  }

  const items = listQ.data?.items ?? [];
  const summary = analyticsQ.data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        description="Filter by month, quarter, or customer. Charts and the log use the same window. Tap a row to open the rental."
        title="Payments"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={exporting}
          onClick={() => void exportCsv()}
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Export CSV
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <AnalyticsRangeControl
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomApply={({ from, to }) => {
              setCustomFrom(from);
              setCustomTo(to);
              setPreset("custom");
            }}
          />
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-8 w-[200px]" aria-label="Filter by customer">
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {(customersQ.data?.items ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-8 w-[150px]" aria-label="Filter by method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_FILTERS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[140px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Banknote}
          label="Collected"
          loading={analyticsQ.isLoading}
          value={summary ? formatRentalMoney(summary.capturedChargePaise) : "—"}
        />
        <KpiCard
          icon={Undo2}
          label="Refunds"
          loading={analyticsQ.isLoading}
          value={summary ? formatRentalMoney(summary.refundPaise) : "—"}
        />
        <KpiCard
          icon={Receipt}
          label="Transactions"
          hint={
            summary
              ? `${summary.failedCount} failed · ${summary.pendingCount} pending`
              : undefined
          }
          loading={analyticsQ.isLoading}
          value={summary ? String(summary.totalCount) : "—"}
        />
        <KpiCard
          icon={ArrowDownLeft}
          label="Net collected"
          loading={analyticsQ.isLoading}
          value={summary ? formatRentalMoney(summary.netCollectedPaise) : "—"}
        />
      </div>

      <PaymentAnalyticsCharts
        data={analyticsQ.data}
        loading={analyticsQ.isLoading}
        error={analyticsQ.isError ? (analyticsQ.error as Error) : null}
        onRetry={() => void analyticsQ.refetch()}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">Payment log</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[240px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-8 pl-8"
                value={logQ}
                onChange={(e) => setLogQ(e.target.value)}
                placeholder="Search rental or customer"
                aria-label="Search payment log"
              />
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {listQ.data?.total != null ? `${listQ.data.total} in range` : null}
            </p>
          </div>
        </div>

        {listQ.isError ? (
          <ErrorState
            message={listQ.error?.message}
            onRetry={() => void listQ.refetch()}
            title="Could not load payment log"
          />
        ) : listQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <EmptyState
            message={
              debouncedQ
                ? "No payments match this search."
                : "No payments match these filters."
            }
          />
        ) : (
          <Table
            footer={
              <TablePagination
                limit={listQ.data?.limit ?? LIST_PAGE_SIZE}
                onPageChange={setPage}
                page={listQ.data?.page ?? page}
                total={listQ.data?.total ?? items.length}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Rental</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const href = p.rentalId ? `/rentals/${p.rentalId}` : "/payments";
                const isRefund = p.direction === "refund";
                return (
                  <ClickableRow
                    href={href}
                    key={p._id}
                    label={p.rentalId ? `Open rental ${p.rentalNumber || p.rentalId}` : "Payment without rental"}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatWhen(p.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{p.rentalNumber || p.rentalId || "—"}</TableCell>
                    <TableCell>{p.customerName || "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatRentalMoney(p.amountPaise)}</TableCell>
                    <TableCell className="capitalize">{p.method?.replace(/_/g, " ") || "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 capitalize text-muted-foreground">
                        {isRefund ? (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {p.direction || "—"}
                      </span>
                    </TableCell>
                    <TableCell>{labelStatus(p.status)}</TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
