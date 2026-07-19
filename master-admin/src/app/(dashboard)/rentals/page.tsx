"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { actionsForStatus, useRentalAction, type RentalLifecycleAction } from "@/hooks/rental/use-rental-actions";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { createIntentKey, normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import { labelAction } from "@/lib/rental-labels";
import type { PageResult, RentalOrder } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "reserved", label: "Reserved" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dispatch_pending", label: "Ready to send / on the way" },
  { value: "dispatched", label: "Delivered (awaiting hand-out)" },
  { value: "active", label: "Out with customer" },
  { value: "overdue", label: "Overdue" },
  { value: "returned", label: "Returned" },
  { value: "inspection", label: "Checking item" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function RentalsPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const router = useRouter();
  const qc = useQueryClient();
  const action = useRentalAction();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sweeping, setSweeping] = useState(false);

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: rentalKeys.rentals(scope, { status }),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<RentalOrder>>("/admin/rentals", {
          limit: 100,
          status: status === "all" ? undefined : status,
        })
      ),
  });

  useEffect(() => {
    setPageTitle({ title: "Rentals", description: "All bookings" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter((r) => {
      if (!needle) return true;
      const hay = `${r.rentalNumber} ${r.customerSnapshot?.displayName || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q]);

  const paged = useClientPagination(filtered, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${status}|${q}`,
  });

  function runAction(r: RentalOrder, a: RentalLifecycleAction) {
    let body: Record<string, unknown> | undefined;
    if (a === "cancel") {
      const reason = window.prompt("Cancel reason?", "Customer requested")?.trim();
      if (!reason) return;
      body = { reason };
    }
    action.mutate({ rentalId: r._id, action: a, version: r.version, body });
  }

  async function runOverdueSweep() {
    try {
      setSweeping(true);
      const out = await rentalCommand<{ transitioned?: number }>("/admin/jobs/overdue-sweep", "POST", {}, {
        idempotencyKey: createIntentKey(),
      });
      toast.success(
        out?.transitioned != null ? `Marked ${out.transitioned} rental(s) overdue` : "Overdue sweep done"
      );
      void qc.invalidateQueries({ queryKey: ["rental", scope] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setSweeping(false);
    }
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => void refetch()} title="Could not load rentals" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actionHref="/rentals/new"
        actionLabel="New rental"
        description="Tap a row to manage that booking. Use ⋮ for the next step."
        title="Rentals"
      >
        <Button disabled={sweeping} onClick={() => void runOverdueSweep()} type="button" variant="outline">
          {sweeping ? "Scanning…" : "Mark overdue"}
        </Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rental or customer"
          value={q}
        />
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger aria-label="Filter by status" className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          actionHref="/rentals/new"
          actionLabel="New rental"
          message={q || status !== "all" ? "No rentals match this filter." : "No rentals yet. Create a booking for a customer."}
        />
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
              <TableHead>Fulfillment</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Due back</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((r) => {
              const next = actionsForStatus(r.status, r.fulfillment?.method);
              return (
                <ClickableRow href={`/rentals/${r._id}`} key={r._id} label={`Open ${r.rentalNumber}`}>
                  <TableCell className="font-medium">{r.rentalNumber}</TableCell>
                  <TableCell>{r.customerSnapshot?.displayName || "—"}</TableCell>
                  <TableCell>
                    <StatusChip kind="rental" status={r.status} />
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {r.fulfillment?.method || "—"}
                  </TableCell>
                  <TableCell>{fmt(r.startAt)}</TableCell>
                  <TableCell>{fmt(r.plannedEndAt || r.endAt)}</TableCell>
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
