"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import type { Customer, PageResult } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "archived", label: "Inactive" },
] as const;

export default function CustomersPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filters = { q, status: status === "all" ? undefined : status, page, limit: LIST_PAGE_SIZE };

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: rentalKeys.customers(scope, filters),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<Customer>>("/admin/customers", {
          q: q || undefined,
          status: status === "all" ? undefined : status,
          page,
          limit: LIST_PAGE_SIZE,
        }),
      ),
  });

  useEffect(() => {
    setPageTitle({ title: "Customers", description: "People and businesses who rent from you" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  useEffect(() => {
    setPage(1);
  }, [q, status]);

  async function runStatus(c: Customer, next: "blocked" | "active" | "archived", reasonPrompt: string) {
    const reason = window.prompt(reasonPrompt, c.statusReason || "") ?? "";
    if (next !== "active" && !reason.trim()) {
      toast.error("Add a short reason");
      return;
    }
    setBusyId(c._id);
    try {
      const path =
        next === "archived"
          ? `/admin/customers/${c._id}`
          : next === "blocked"
            ? `/admin/customers/${c._id}/block`
            : `/admin/customers/${c._id}/unblock`;
      const method = next === "archived" ? "DELETE" : "POST";
      await rentalCommand(path, method, { reason: reason.trim() || undefined }, { version: c.version ?? 0 });
      toast.success(
        next === "blocked" ? "Customer blocked" : next === "archived" ? "Customer deactivated" : "Customer unblocked",
      );
      await qc.invalidateQueries({ queryKey: ["rental", scope, "customers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update customer");
    } finally {
      setBusyId(null);
    }
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => void refetch()} title="Could not load customers" />;
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        actionHref="/customers/new"
        actionLabel="Add customer"
        description="Open a row for history. Use Actions to edit, block, or deactivate."
        title="Customers"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or number"
          value={q}
        />
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger aria-label="Filter by status" className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          actionHref="/customers/new"
          actionLabel="Add customer"
          message={status === "all" && !q ? "No customers yet. Add someone to start rentals." : "No customers match this search."}
        />
      ) : (
        <Table
          footer={
            <TablePagination
              limit={data?.limit ?? LIST_PAGE_SIZE}
              onPageChange={setPage}
              page={data?.page ?? page}
              total={data?.total ?? items.length}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => {
              const blocked = c.status === "blocked";
              const inactive = c.status === "archived";
              return (
                <ClickableRow href={`/customers/${c._id}`} key={c._id} label={`Open ${c.displayName}`}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{c.displayName}</p>
                      {c.type === "business" ? (
                        <p className="text-xs text-muted-foreground">Business</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {c.customerNumber || "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-foreground" title={c.email || undefined}>
                    {c.email || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {c.phone || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <StatusChip kind="customer" status={c.status} />
                      {blocked && c.statusReason ? (
                        <p className="max-w-[200px] truncate text-xs text-muted-foreground" title={c.statusReason}>
                          {c.statusReason}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActionsMenu
                      label={`Actions for ${c.displayName}`}
                      actions={[
                        {
                          label: "Edit",
                          onSelect: () => router.push(`/customers/${c._id}/edit`),
                          disabled: busyId === c._id || inactive,
                        },
                        {
                          label: blocked ? "Unblock" : "Block",
                          onSelect: () =>
                            void runStatus(
                              c,
                              blocked ? "active" : "blocked",
                              blocked
                                ? "Reason for unblocking (optional):"
                                : "Why block this customer? (overdues, unpaid penalties…)",
                            ),
                          disabled: busyId === c._id || inactive,
                        },
                        {
                          label: "Deactivate",
                          onSelect: () =>
                            void runStatus(c, "archived", "Why deactivate this customer?"),
                          disabled: busyId === c._id || inactive,
                        },
                      ]}
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
