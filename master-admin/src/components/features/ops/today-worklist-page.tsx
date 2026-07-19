"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { rentalGet } from "@/lib/rental-api";
import { labelRentalStatus, labelShipmentStatus } from "@/lib/rental-labels";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

type Row = {
  _id: string;
  rentalId?: string;
  rentalNumber?: string;
  customerSnapshot?: { displayName?: string } | null;
  status?: string;
  shipmentStatus?: string;
  startAt?: string;
  plannedEndAt?: string;
  createdAt?: string;
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function TodayWorklistPage({
  title,
  endpoint,
  queryKey,
  emptyMessage,
}: {
  title: string;
  endpoint: string;
  queryKey: string;
  emptyMessage: string;
}) {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ["rental", scope, "today", queryKey],
    queryFn: () => rentalGet<{ date: string; items: Row[] }>(endpoint),
  });

  useEffect(() => {
    setPageTitle({ title, description: data?.date ? `For ${data.date}` : "Today's work" });
    return () => setPageTitle(null);
  }, [setPageTitle, title, data?.date]);

  const items = data?.items ?? [];
  const paged = useClientPagination(items, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${queryKey}|${data?.date || ""}|${items.length}`,
  });

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => void refetch()} title={`Could not load ${title.toLowerCase()}`} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader description="Tap a row to open the rental." title={title} />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState message={emptyMessage} />
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
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((r) => {
              const rentalId = r.rentalId || r._id;
              return (
                <ClickableRow
                  href={`/rentals/${rentalId}`}
                  key={r._id}
                  label={`Open ${r.rentalNumber || rentalId}`}
                >
                  <TableCell className="font-medium">{r.rentalNumber || rentalId}</TableCell>
                  <TableCell>{r.customerSnapshot?.displayName || "—"}</TableCell>
                  <TableCell>
                    {r.shipmentStatus
                      ? labelShipmentStatus(r.shipmentStatus)
                      : labelRentalStatus(r.status)}
                  </TableCell>
                  <TableCell>{fmt(r.startAt || r.plannedEndAt || r.createdAt)}</TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
