"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { ProductCreateDialog } from "@/components/features/products/product-create-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import type { Category, PageResult, Product, StockRollup, TaxCode } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function taxLabel(t: TaxCode) {
  const pct = Number.isFinite(t.rateBps) ? `${(t.rateBps / 100).toFixed(t.rateBps % 100 === 0 ? 0 : 1)}%` : "";
  return pct ? `${t.name} (${pct})` : t.name;
}

export default function ProductsPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [categoryId, setCategoryId] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const productsQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "products", { status }),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<Product>>("/admin/products", {
          limit: 100,
          status: status === "all" ? "all" : status,
        })
      ),
  });

  const categoriesQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "categories", { status: "active" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Category>>("/admin/categories", { limit: 100, status: "active" })),
  });

  const taxQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "tax-codes", { status: "all" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<TaxCode>>("/admin/tax/codes", { limit: 100, status: "all" })),
  });

  const stockQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "stock-rollup"),
    queryFn: () => rentalGet<StockRollup>("/admin/inventory/stock"),
  });

  useEffect(() => {
    setPageTitle({ title: "Products", description: "Things you rent out" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const categoryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoriesQ.data?.items ?? []) m.set(c._id, c.name);
    return m;
  }, [categoriesQ.data]);

  const taxById = useMemo(() => {
    const m = new Map<string, TaxCode>();
    for (const t of taxQ.data?.items ?? []) m.set(t._id, t);
    return m;
  }, [taxQ.data]);

  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of stockQ.data?.items ?? []) {
      if (!row.productId) continue;
      const id = String(row.productId);
      m.set(id, (m.get(id) || 0) + (row.count || 0));
    }
    return m;
  }, [stockQ.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (productsQ.data?.items ?? []).filter((p) => {
      if (categoryId !== "all" && String(p.categoryId || "") !== categoryId) return false;
      if (!needle) return true;
      const hay = `${p.name} ${p.productSku} ${p.brand || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [productsQ.data, q, categoryId]);

  const paged = useClientPagination(filtered, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${status}|${categoryId}|${q}`,
  });

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "products") }),
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "stock-rollup") }),
    ]);
  }

  async function deactivate(p: Product) {
    if (!confirm(`Deactivate ${p.name}? It will hide from the customer catalog.`)) return;
    try {
      await rentalCommand(`/admin/products/${p._id}`, "DELETE", undefined, { version: p.version ?? 0 });
      toast.success("Product deactivated");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate");
    }
  }

  async function activate(p: Product) {
    try {
      await rentalCommand(`/admin/products/${p._id}/restore`, "POST", undefined, { version: p.version ?? 0 });
      toast.success("Product activated");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate");
    }
  }

  if (productsQ.isError) {
    return (
      <ErrorState
        message={productsQ.error?.message}
        onRetry={() => void productsQ.refetch()}
        title="Could not load products"
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actionLabel="Add product"
        description="Tap a row for details. Use ⋮ to edit, deactivate, or activate."
        onAction={() => setCreateOpen(true)}
        title="Products"
      />
      <ProductCreateDialog
        onCreated={() => void invalidate()}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, SKU, brand"
          value={q}
        />
        <Select onValueChange={setCategoryId} value={categoryId}>
          <SelectTrigger aria-label="Filter by category" className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categoriesQ.data?.items ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger aria-label="Filter by status" className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Inactive</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {productsQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          actionLabel="Add product"
          message={q || categoryId !== "all" ? "No products match this filter." : "No products yet. Add the first item you rent."}
          onAction={() => setCreateOpen(true)}
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
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((p) => {
              const thumb = p.images?.[0];
              const tax = p.taxClassId ? taxById.get(p.taxClassId) : undefined;
              const qty = qtyByProduct.get(p._id) ?? 0;
              const archived = p.status === "archived";
              return (
                <ClickableRow href={`/products/${p._id}`} key={p._id} label={`Open ${p.name}`}>
                  <TableCell>
                    <div className="relative h-10 w-10 overflow-hidden rounded-md bg-muted">
                      {thumb ? (
                        <Image alt="" className="object-cover" fill sizes="40px" src={thumb} unoptimized />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.productSku}</TableCell>
                  <TableCell>{(p.categoryId && categoryById.get(p.categoryId)) || "—"}</TableCell>
                  <TableCell>{tax ? taxLabel(tax) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                  <TableCell>
                    <StatusChip kind="catalog" status={p.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActionsMenu
                      actions={[
                        { label: "Edit", onSelect: () => router.push(`/products/${p._id}?edit=1`) },
                        {
                          label: archived ? "Activate" : "Deactivate",
                          onSelect: () => void (archived ? activate(p) : deactivate(p)),
                          destructive: !archived,
                          separatorBefore: true,
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
