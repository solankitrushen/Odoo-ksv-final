"use client";

/* Hallmark · component: create-form · genre: modern-minimal · theme: project tokens (Cobalt ops)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (token surfaces)
 * Pre-emit critique: P5 H4 E5 S4 R5 V4
 */

import { ProductImageDropzone } from "@/components/features/products/product-image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import {
  createIntentKey,
  normalizePage,
  rentalCommand,
  rentalGet,
  rentalUploadProductImages,
} from "@/lib/rental-api";
import type { Category, PageResult, Product, TaxCode } from "@/lib/rental-types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

function taxLabel(t: TaxCode) {
  const pct = Number.isFinite(t.rateBps) ? `${(t.rateBps / 100).toFixed(t.rateBps % 100 === 0 ? 0 : 1)}%` : "";
  return pct ? `${t.name} · ${t.code} (${pct})` : `${t.name} · ${t.code}`;
}

/** Label above control · 8px gap · optional hint under field. */
function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-foreground" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" id={hintId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  "h-10 rounded-md border border-input bg-panel shadow-none transition-colors hover:border-foreground/25 focus-visible:ring-1 focus-visible:ring-ring";

type ProductCreateFormProps = {
  className?: string;
  onCancel?: () => void;
  onSuccess?: (product: Product) => void;
};

/**
 * Canonical Add product model: single column, airy field rhythm, dropzone + upload-only compress.
 */
export function ProductCreateForm({ className, onCancel, onSuccess }: ProductCreateFormProps) {
  const router = useRouter();
  const scope = useRentalScope();
  const [name, setName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [taxClassId, setTaxClassId] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [initialQty, setInitialQty] = useState("0");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const tax = useQuery({
    queryKey: rentalKeys.catalog(scope, "tax-codes"),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<TaxCode>>("/admin/tax/codes", { limit: 50, status: "active" })),
  });

  const categories = useQuery({
    queryKey: rentalKeys.catalog(scope, "categories", { status: "active" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Category>>("/admin/categories", { limit: 100, status: "active" })),
  });

  useEffect(() => {
    if (!taxClassId && tax.data?.items?.[0]?._id) setTaxClassId(tax.data.items[0]._id);
  }, [tax.data, taxClassId]);

  async function onAddFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await rentalUploadProductImages(files);
      if (!urls.length) throw new Error("Upload returned no URLs");
      setImages((prev) => [...prev, ...urls].slice(0, 10));
      toast.success(urls.length === 1 ? "Image uploaded" : `${urls.length} images uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !productSku.trim() || !taxClassId) {
      setFieldError("Name, SKU, and tax are required.");
      toast.error("Name, SKU, and tax are required");
      return;
    }
    setFieldError(null);
    setLoading(true);
    try {
      const out = await rentalCommand<{ product: Product }>(
        "/admin/products",
        "POST",
        {
          name: name.trim(),
          productSku: productSku.trim(),
          taxClassId,
          brand: brand.trim() || undefined,
          description: description.trim() || undefined,
          categoryId: categoryId === "none" ? undefined : categoryId,
          images: images.length ? images : undefined,
        },
        { idempotencyKey: createIntentKey() }
      );

      const qty = Math.max(0, Math.min(200, Number.parseInt(initialQty, 10) || 0));
      if (qty > 0) {
        const skuBase = productSku.trim().replace(/\s+/g, "-").toUpperCase();
        const variantOut = await rentalCommand<{ variant: { _id: string; variantSku: string } }>(
          "/admin/variants",
          "POST",
          {
            productId: out.product._id,
            variantSku: `${skuBase}-STD`,
            name: "Standard",
            variantSignature: "standard",
            defaultPeriodCode: "day",
          },
          { idempotencyKey: createIntentKey() }
        );
        const stamp = Date.now().toString(36).toUpperCase();
        const assets = Array.from({ length: qty }, (_, i) => ({
          assetCode: `${variantOut.variant.variantSku}-${stamp}-${String(i + 1).padStart(3, "0")}`,
          variantId: variantOut.variant._id,
          productId: out.product._id,
          condition: "good" as const,
        }));
        await rentalCommand("/admin/assets", "POST", { assets }, { idempotencyKey: createIntentKey() });
      }

      toast.success("Product saved");
      if (onSuccess) onSuccess(out.product);
      else router.push(`/products/${out.product._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={cn("w-full max-w-md", className)}
      data-state={loading ? "loading" : fieldError ? "error" : undefined}
      noValidate
      onSubmit={onSubmit}
    >
      {/* Field stack: 20px between groups (space-y-5), 8px label→control */}
      <div className="flex flex-col gap-5">
        <Field htmlFor="product-name" label="Name">
          <Input
            autoComplete="off"
            className={controlClass}
            id="product-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </Field>

        <Field htmlFor="product-sku" label="SKU / code">
          <Input
            autoComplete="off"
            className={controlClass}
            id="product-sku"
            onChange={(e) => setProductSku(e.target.value)}
            required
            value={productSku}
          />
        </Field>

        <Field htmlFor="product-brand" label="Brand">
          <Input
            autoComplete="off"
            className={controlClass}
            id="product-brand"
            onChange={(e) => setBrand(e.target.value)}
            value={brand}
          />
        </Field>

        <Field label="Category">
          <Select onValueChange={setCategoryId} value={categoryId}>
            <SelectTrigger className={cn(controlClass, "w-full")}>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {(categories.data?.items ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tax">
          <Select onValueChange={setTaxClassId} value={taxClassId}>
            <SelectTrigger className={cn(controlClass, "w-full")}>
              <SelectValue placeholder={tax.isLoading ? "Loading…" : "Select tax"} />
            </SelectTrigger>
            <SelectContent>
              {(tax.data?.items ?? []).map((t) => (
                <SelectItem key={t._id} value={t._id}>
                  {taxLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field htmlFor="product-description" label="Description">
          <Textarea
            className="min-h-[5.5rem] rounded-md border border-input bg-panel shadow-none transition-colors hover:border-foreground/25 focus-visible:ring-1 focus-visible:ring-ring"
            id="product-description"
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            value={description}
          />
        </Field>

        <Field label="Images">
          <ProductImageDropzone
            onAddFiles={onAddFiles}
            onRemove={(url) => setImages((prev) => prev.filter((u) => u !== url))}
            uploading={uploading}
            urls={images}
          />
        </Field>

        <Field
          hint="Creates physical units you can rent out. 0 is fine; add stock later."
          htmlFor="product-qty"
          label="Starting quantity"
        >
          <Input
            className={controlClass}
            id="product-qty"
            inputMode="numeric"
            max={200}
            min={0}
            onChange={(e) => setInitialQty(e.target.value)}
            type="number"
            value={initialQty}
          />
        </Field>
      </div>

      {fieldError ? (
        <p className="mt-4 text-xs text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          className="min-w-[7.5rem]"
          data-state={loading ? "loading" : undefined}
          disabled={loading || !taxClassId || uploading}
          type="submit"
        >
          {loading ? "Saving…" : "Save product"}
        </Button>
        <Button
          disabled={loading || uploading}
          onClick={() => (onCancel ? onCancel() : router.back())}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
