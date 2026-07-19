"use client";

import { ClickableRow } from "@/components/features/data-table/clickable-row";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { ProductImageDropzone } from "@/components/features/products/product-image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import {
  createIntentKey,
  normalizePage,
  rentalCommand,
  rentalGet,
  rentalUploadProductImages,
} from "@/lib/rental-api";
import { formatRentalMoney, parseRupeesToPaise, paiseToRupeeInput } from "@/lib/rental-money";
import type {
  Category,
  PageResult,
  Product,
  RentalOrder,
  SalesTrends,
  StockRollup,
  TaxCode,
  Variant,
} from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function taxLabel(t: TaxCode) {
  const pct = Number.isFinite(t.rateBps) ? `${(t.rateBps / 100).toFixed(t.rateBps % 100 === 0 ? 0 : 1)}%` : "";
  return pct ? `${t.name} · ${t.code} (${pct})` : `${t.name} · ${t.code}`;
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [taxClassId, setTaxClassId] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addQty, setAddQty] = useState("1");
  const [addingStock, setAddingStock] = useState(false);
  const [lateRupees, setLateRupees] = useState("200");
  const [latePeriod, setLatePeriod] = useState("day");
  const [graceMinutes, setGraceMinutes] = useState("120");
  const [depositRupees, setDepositRupees] = useState("0");
  const [capRupees, setCapRupees] = useState("0");

  useEffect(() => {
    if (searchParams.get("edit") === "1") setEditing(true);
  }, [searchParams]);

  const productQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "product", { id }),
    queryFn: () => rentalGet<{ product: Product }>(`/admin/products/${id}`),
    enabled: Boolean(id),
  });

  const product = productQ.data?.product;

  const categoriesQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "categories", { status: "active" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Category>>("/admin/categories", { limit: 100, status: "active" })),
  });

  const taxQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "tax-codes", { status: "active" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<TaxCode>>("/admin/tax/codes", { limit: 100, status: "active" })),
  });

  const taxAllQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "tax-codes", { status: "all" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<TaxCode>>("/admin/tax/codes", { limit: 100, status: "all" })),
  });

  const variantsQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "variants", { productId: id }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Variant>>("/admin/variants", { productId: id, limit: 50 })),
    enabled: Boolean(id),
  });

  const stockQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "stock", { productId: id }),
    queryFn: () => rentalGet<StockRollup>("/admin/inventory/stock", { productId: id }),
    enabled: Boolean(id),
  });

  const historyQ = useQuery({
    queryKey: rentalKeys.rentals(scope, { productId: id }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<RentalOrder>>("/admin/rentals", { productId: id, limit: 50 })),
    enabled: Boolean(id),
  });

  const salesQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "sales-trends"),
    queryFn: () => rentalGet<SalesTrends>("/admin/analytics/sales", { groupBy: "product" }),
  });

  useEffect(() => {
    if (!product) return;
    setName(product.name || "");
    setProductSku(product.productSku || "");
    setBrand(product.brand || "");
    setDescription(product.description || "");
    setCategoryId(product.categoryId || "none");
    setTaxClassId(product.taxClassId || "");
    setImages(product.images || []);
    setVersion(product.version ?? 0);
    const pol = product.policies || {};
    setLateRupees(paiseToRupeeInput(pol.late?.ratePaise) || "0");
    setLatePeriod(pol.late?.periodCode || "day");
    setGraceMinutes(String(pol.grace?.minutes ?? 120));
    setDepositRupees(paiseToRupeeInput(pol.deposit?.valuePaise) || "0");
    setCapRupees(paiseToRupeeInput(pol.cap?.valuePaise) || "0");
  }, [product]);

  useEffect(() => {
    setPageTitle({
      backHref: "/products",
      title: product?.name || "Product",
      description: "Product record",
    });
    return () => setPageTitle(null);
  }, [setPageTitle, product?.name]);

  const qty = useMemo(() => (stockQ.data?.items ?? []).reduce((n, row) => n + (row.count || 0), 0), [stockQ.data]);
  const available = useMemo(
    () =>
      (stockQ.data?.items ?? [])
        .filter((r) => r.state === "available")
        .reduce((n, row) => n + (row.count || 0), 0),
    [stockQ.data]
  );

  const metrics = useMemo(() => {
    const row = (salesQ.data?.items ?? []).find((i) => String(i.productId) === String(id));
    return {
      bookings: row?.bookingCount ?? historyQ.data?.total ?? 0,
      units: row?.units ?? 0,
      revenuePaise: row?.linePreTaxPaise ?? 0,
    };
  }, [salesQ.data, historyQ.data, id]);

  const historyItems = historyQ.data?.items ?? [];
  const historyPaged = useClientPagination(historyItems, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: String(id),
  });

  const categoryName = useMemo(() => {
    if (!product?.categoryId) return "—";
    return (categoriesQ.data?.items ?? []).find((c) => c._id === product.categoryId)?.name || "—";
  }, [categoriesQ.data, product?.categoryId]);

  const taxName = useMemo(() => {
    if (!product?.taxClassId) return "—";
    const t = (taxAllQ.data?.items ?? []).find((x) => x._id === product.taxClassId);
    return t ? taxLabel(t) : "—";
  }, [taxAllQ.data, product?.taxClassId]);

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "product", { id }) }),
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "products") }),
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "stock", { productId: id }) }),
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "stock-rollup") }),
      qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "variants", { productId: id }) }),
      qc.invalidateQueries({ queryKey: rentalKeys.rentals(scope, { productId: id }) }),
    ]);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !productSku.trim() || !taxClassId) {
      toast.error("Name, SKU, and tax are required");
      return;
    }
    let latePaise: number | undefined;
    let depositPaise: number | undefined;
    let capPaise: number | undefined;
    try {
      latePaise = parseRupeesToPaise(lateRupees) ?? 0;
      depositPaise = parseRupeesToPaise(depositRupees) ?? 0;
      capPaise = parseRupeesToPaise(capRupees) ?? 0;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid money amount");
      return;
    }
    const grace = Number.parseInt(graceMinutes, 10);
    if (!Number.isFinite(grace) || grace < 0) {
      toast.error("Grace minutes must be 0 or more");
      return;
    }
    setSaving(true);
    try {
      const out = await rentalCommand<{ product: Product }>(
        `/admin/products/${id}`,
        "PATCH",
        {
          name: name.trim(),
          productSku: productSku.trim(),
          brand: brand.trim() || null,
          description: description.trim() || null,
          categoryId: categoryId === "none" ? null : categoryId,
          taxClassId,
          images,
          policies: {
            late: { ratePaise: latePaise, periodCode: latePeriod, enabled: latePaise > 0 },
            grace: { minutes: grace },
            deposit: { mode: "fixed", valuePaise: depositPaise },
            cap: { mode: "fixed", valuePaise: capPaise || depositPaise || latePaise },
          },
        },
        { version }
      );
      setVersion(out.product.version ?? version + 1);
      toast.success("Product saved");
      setEditing(false);
      router.replace(`/products/${id}`);
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!confirm("Deactivate this product? It will hide from the customer catalog.")) return;
    setBusy(true);
    try {
      await rentalCommand(`/admin/products/${id}`, "DELETE", undefined, { version });
      toast.success("Product deactivated");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this product? It will be deactivated and hidden from the catalog.")) return;
    setBusy(true);
    try {
      await rentalCommand(`/admin/products/${id}`, "DELETE", undefined, { version });
      toast.success("Product deleted");
      router.push("/products");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  async function onActivate() {
    setBusy(true);
    try {
      const out = await rentalCommand<{ product: Product }>(
        `/admin/products/${id}/restore`,
        "POST",
        undefined,
        { version }
      );
      setVersion(out.product.version ?? version + 1);
      toast.success("Product activated");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate");
    } finally {
      setBusy(false);
    }
  }

  async function onAddFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await rentalUploadProductImages(files);
      if (!urls.length) throw new Error("Upload returned no URLs");
      const next = [...images, ...urls].slice(0, 10);
      setImages(next);
      const out = await rentalCommand<{ product: Product }>(
        `/admin/products/${id}`,
        "PATCH",
        { images: next },
        { version }
      );
      setVersion(out.product.version ?? version + 1);
      toast.success(urls.length === 1 ? "Image added" : `${urls.length} images added`);
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(url: string) {
    const next = images.filter((u) => u !== url);
    setImages(next);
    setSaving(true);
    try {
      const out = await rentalCommand<{ product: Product }>(
        `/admin/products/${id}`,
        "PATCH",
        { images: next },
        { version }
      );
      setVersion(out.product.version ?? version + 1);
      toast.success("Image removed");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update images");
      setImages(images);
    } finally {
      setSaving(false);
    }
  }

  async function ensureVariant(): Promise<Variant> {
    const existing = variantsQ.data?.items?.[0];
    if (existing) return existing;
    const skuBase = (productSku || product?.productSku || "ITEM").replace(/\s+/g, "-").toUpperCase();
    const out = await rentalCommand<{ variant: Variant }>(
      "/admin/variants",
      "POST",
      {
        productId: id,
        variantSku: `${skuBase}-STD`,
        name: "Standard",
        variantSignature: "standard",
        defaultPeriodCode: "day",
      },
      { idempotencyKey: createIntentKey() }
    );
    return out.variant;
  }

  async function onAddStock(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.min(200, Number.parseInt(addQty, 10) || 0));
    if (!n) {
      toast.error("Enter a quantity of at least 1");
      return;
    }
    setAddingStock(true);
    try {
      const variant = await ensureVariant();
      const stamp = Date.now().toString(36).toUpperCase();
      const assets = Array.from({ length: n }, (_, i) => ({
        assetCode: `${variant.variantSku}-${stamp}-${String(i + 1).padStart(3, "0")}`,
        variantId: variant._id,
        productId: id,
        condition: "good" as const,
      }));
      await rentalCommand("/admin/assets", "POST", { assets }, { idempotencyKey: createIntentKey() });
      toast.success(`Added ${n} unit${n === 1 ? "" : "s"}`);
      setAddQty("1");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add stock");
    } finally {
      setAddingStock(false);
    }
  }

  if (productQ.isError) {
    return (
      <ErrorState
        message={productQ.error?.message}
        onRetry={() => void productQ.refetch()}
        title="Could not load product"
      />
    );
  }

  if (productQ.isLoading || !product) {
    return <Skeleton className="h-48 w-full" />;
  }

  const archived = product.status === "archived";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader description={product.productSku} title={product.name}>
        {!editing ? (
          <Button disabled={archived || busy} onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : (
          <Button onClick={() => setEditing(false)} variant="outline">
            Cancel edit
          </Button>
        )}
        <RowActionsMenu
          label={`More actions for ${product.name}`}
          actions={[
            ...(archived
              ? [
                  {
                    label: "Activate",
                    onSelect: () => void onActivate(),
                    disabled: busy,
                  },
                ]
              : [
                  {
                    label: "Deactivate",
                    onSelect: () => void onDeactivate(),
                    disabled: busy,
                  },
                  {
                    label: "Delete",
                    onSelect: () => void onDelete(),
                    disabled: busy,
                  },
                ]),
          ]}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <StatusChip kind="catalog" status={product.status} />
        <span className="text-sm text-muted-foreground">
          Stock <span className="tabular-nums text-foreground">{qty}</span>
          {" · "}
          Available <span className="tabular-nums text-foreground">{available}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-border pb-6">
        <Metric label="Bookings" value={String(metrics.bookings)} />
        <Metric label="Units rented" value={String(metrics.units)} />
        <Metric label="Revenue (pre-tax)" value={formatRentalMoney(metrics.revenuePaise)} />
      </div>

      {!editing ? (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Brand" value={product.brand || "—"} />
            <Info label="Category" value={categoryName} />
            <Info label="Tax" value={taxName} />
            <Info label="SKU" value={product.productSku} />
            <Info
              label="Late fee (this product)"
              value={
                product.policies?.late?.ratePaise
                  ? `${formatRentalMoney(product.policies.late.ratePaise)} / ${product.policies.late.periodCode || "day"}`
                  : "—"
              }
            />
            <Info label="Grace" value={`${product.policies?.grace?.minutes ?? "—"} minutes`} />
            <Info
              label="Deposit"
              value={
                product.policies?.deposit?.valuePaise != null
                  ? formatRentalMoney(product.policies.deposit.valuePaise)
                  : product.policies?.deposit?.valueBps != null
                    ? `${(product.policies.deposit.valueBps / 100).toFixed(0)}% of rent`
                    : "—"
              }
            />
            <Info
              label="Late fee cap"
              value={
                product.policies?.cap?.valuePaise != null
                  ? formatRentalMoney(product.policies.cap.valuePaise)
                  : "—"
              }
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Description</p>
            <p className="mt-1 text-sm text-foreground">{product.description || "—"}</p>
          </div>
          {(product.images?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-3">
              {product.images!.map((url) => (
                <div className="relative h-20 w-20 overflow-hidden rounded-md border border-border" key={url}>
                  <Image alt="" className="object-cover" fill sizes="80px" src={url} unoptimized />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" onChange={(e) => setName(e.target.value)} required value={name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" onChange={(e) => setProductSku(e.target.value)} required value={productSku} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" onChange={(e) => setBrand(e.target.value)} value={brand} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select onValueChange={setCategoryId} value={categoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {(categoriesQ.data?.items ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax</Label>
              <Select onValueChange={setTaxClassId} value={taxClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={taxQ.isLoading ? "Loading…" : "Select tax"} />
                </SelectTrigger>
                <SelectContent>
                  {(taxQ.data?.items ?? []).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {taxLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" onChange={(e) => setDescription(e.target.value)} rows={3} value={description} />
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold">Tax &amp; penalties for this product</h3>
            <p className="text-xs text-muted-foreground">
              Overrides whole-business defaults. Different products can charge different late fees.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="late">Late fee (₹)</Label>
                <Input id="late" onChange={(e) => setLateRupees(e.target.value)} value={lateRupees} />
              </div>
              <div className="space-y-2">
                <Label>Per</Label>
                <Select onValueChange={setLatePeriod} value={latePeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Hour</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grace">Grace (minutes)</Label>
                <Input id="grace" onChange={(e) => setGraceMinutes(e.target.value)} value={graceMinutes} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit">Deposit (₹)</Label>
                <Input id="deposit" onChange={(e) => setDepositRupees(e.target.value)} value={depositRupees} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cap">Late fee cap (₹)</Label>
                <Input id="cap" onChange={(e) => setCapRupees(e.target.value)} value={capRupees} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Images</Label>
            <ProductImageDropzone
              disabled={saving}
              onAddFiles={onAddFiles}
              onRemove={(url) => void removeImage(url)}
              uploading={uploading}
              urls={images}
            />
          </div>

          <Button disabled={saving || uploading} type="submit">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}

      {!archived ? (
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold">Stock (quantity)</h2>
          <form className="flex flex-wrap items-end gap-3" onSubmit={onAddStock}>
            <div className="space-y-2">
              <Label htmlFor="addQty">Units to add</Label>
              <Input
                className="w-28"
                id="addQty"
                inputMode="numeric"
                max={200}
                min={1}
                onChange={(e) => setAddQty(e.target.value)}
                type="number"
                value={addQty}
              />
            </div>
            <Button disabled={addingStock} type="submit">
              {addingStock ? "Adding…" : "Add stock"}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">Rental history</h2>
        {historyQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : historyItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals for this product yet.</p>
        ) : (
          <Table
            footer={
              <TablePagination
                limit={historyPaged.pageSize}
                onPageChange={historyPaged.setPage}
                page={historyPaged.page}
                total={historyPaged.total}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Rental</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyPaged.items.map((r) => (
                <ClickableRow href={`/rentals/${r._id}`} key={r._id} label={`Open ${r.rentalNumber}`}>
                  <TableCell className="font-medium">{r.rentalNumber}</TableCell>
                  <TableCell>{r.customerSnapshot?.displayName || "—"}</TableCell>
                  <TableCell>
                    <StatusChip kind="rental" status={r.status} />
                  </TableCell>
                  <TableCell>{fmt(r.startAt)}</TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}
