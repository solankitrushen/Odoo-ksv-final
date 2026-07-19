"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { PageHeader } from "@/components/features/data-table/page-header";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { DashboardAnalyticsCharts } from "@/components/features/dashboard/analytics-charts";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { KpiCard } from "@/components/features/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { rentalGet } from "@/lib/rental-api";
import { labelRentalStatus } from "@/lib/rental-labels";
import { formatRentalMoney } from "@/lib/rental-money";
import type { OverdueWorklist, RentalDashboard } from "@/lib/rental-types";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Banknote,
  CalendarClock,
  ClipboardList,
  PackageCheck,
  ShieldAlert,
  Undo2,
  Vault,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const OVERDUE_PAGE_SIZE = 10;

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function DashboardPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const [overduePage, setOverduePage] = useState(1);

  const dash = useQuery({
    queryKey: rentalKeys.dashboard(scope),
    queryFn: () => rentalGet<RentalDashboard>("/admin/dashboard"),
  });

  const overdue = useQuery({
    queryKey: rentalKeys.dashboardOverdue(scope, { page: overduePage, limit: OVERDUE_PAGE_SIZE }),
    queryFn: () =>
      rentalGet<OverdueWorklist>("/admin/dashboard/overdue", {
        page: overduePage,
        limit: OVERDUE_PAGE_SIZE,
      }),
  });

  useEffect(() => {
    setPageTitle({
      description: "What needs attention right now",
      title: "Dashboard",
    });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  if (dash.isError) {
    return (
      <ErrorState
        message={dash.error?.message}
        onRetry={() => {
          void dash.refetch();
          void overdue.refetch();
        }}
        title="Could not load dashboard"
      />
    );
  }

  const counts = dash.data?.counts;
  const money = dash.data?.money;
  const overdueItems = overdue.data?.items ?? [];
  const overdueTotal = overdue.data?.total ?? overdueItems.length;
  const overdueLimit = overdue.data?.limit ?? OVERDUE_PAGE_SIZE;

  return (
    <div className="space-y-5">
      <PageHeader
        description="Numbers update from your live rentals. Tap an overdue row to fix it."
        title="Dashboard"
      >
        <Link className="text-sm font-medium text-primary hover:underline" href="/today/returns">
          Today&apos;s returns
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard icon={ClipboardList} label="Out with customers" loading={dash.isLoading} value={counts ? String(counts.activeRentals) : "—"} />
        <KpiCard icon={AlarmClock} label="Due back today" loading={dash.isLoading} value={counts ? String(counts.rentalsDueToday) : "—"} />
        <KpiCard hint="next 7 days" icon={PackageCheck} label="Upcoming pickups" loading={dash.isLoading} value={counts ? String(counts.upcomingPickups) : "—"} />
        <KpiCard hint="next 7 days" icon={Undo2} label="Upcoming returns" loading={dash.isLoading} value={counts ? String(counts.upcomingReturns) : "—"} />
        <KpiCard hint={counts && counts.overdueRentals > 0 ? "needs attention" : undefined} icon={ShieldAlert} label="Overdue" loading={dash.isLoading} value={counts ? String(counts.overdueRentals) : "—"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={Banknote} label="Revenue collected" loading={dash.isLoading} value={money ? formatRentalMoney(money.revenueFromRentalsPaise) : "—"} />
        <KpiCard hint="on open rentals" icon={Vault} label="Deposits held" loading={dash.isLoading} value={money ? formatRentalMoney(money.securityDepositsHeldPaise) : "—"} />
        <KpiCard icon={CalendarClock} label="Late fees" loading={dash.isLoading} value={money ? formatRentalMoney(money.lateFeeCollectionPaise) : "—"} />
      </div>

      <DashboardAnalyticsCharts />

      <div className="mb-8 space-y-3 pb-6">
        <div className="flex flex-row items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Overdue — tap to open</h2>
          {dash.data?.asOfAt ? (
            <p className="text-xs text-muted-foreground">As of {formatWhen(dash.data.asOfAt)}</p>
          ) : null}
        </div>
        {overdue.isError ? (
          <ErrorState message={overdue.error?.message} onRetry={() => void overdue.refetch()} title="Could not load overdue list" />
        ) : overdue.isLoading ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : overdueItems.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            Nothing overdue. Nice work.
          </p>
        ) : (
          <Table
            footer={
              <TablePagination
                page={overdue.data?.page ?? overduePage}
                limit={overdueLimit}
                total={overdueTotal}
                onPageChange={setOverduePage}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Rental</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due back</TableHead>
                <TableHead>Late fee</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:last-child>td]:pb-6">
              {overdueItems.map((row) => (
                <ClickableRow href={`/rentals/${row._id}`} key={row._id} label={`Open ${row.rentalNumber || row._id}`}>
                  <TableCell className="font-medium">{row.rentalNumber || row._id}</TableCell>
                  <TableCell>{row.customerSnapshot?.displayName || "—"}</TableCell>
                  <TableCell>{labelRentalStatus(row.status)}</TableCell>
                  <TableCell>{formatWhen(row.plannedEndAt)}</TableCell>
                  <TableCell>{formatRentalMoney(row.lateFeePaise)}</TableCell>
                  <TableCell>{formatRentalMoney(row.balanceDuePaise)}</TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
