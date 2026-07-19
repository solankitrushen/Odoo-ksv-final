"use client";

import { PageHeader } from "@/components/features/data-table/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/contexts/page-title-context";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { createIntentKey, normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import type { Customer, PageResult, RentalOrder, Variant } from "@/lib/rental-types";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Local datetime-local value for "now" (browser local). */
function localNowValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function toIsoLocal(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

function NewRentalForm() {
  const { setPageTitle } = usePageTitle();
  const router = useRouter();
  const search = useSearchParams();
  const scope = useRentalScope();
  const presetCustomer = search.get("customerId") || "";

  const [customerId, setCustomerId] = useState(presetCustomer);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [deliveryLine1, setDeliveryLine1] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const minStart = useMemo(() => localNowValue(), []);

  const customers = useQuery({
    queryKey: rentalKeys.customers(scope, { limit: 100 }),
    queryFn: async () => normalizePage(await rentalGet<PageResult<Customer>>("/admin/customers", { limit: 100 })),
  });

  const variants = useQuery({
    queryKey: rentalKeys.catalog(scope, "variants", { limit: 100 }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Variant>>("/admin/variants", { limit: 100, status: "active" })),
  });

  useEffect(() => {
    setPageTitle({ title: "New rental", description: "Book an item for a customer" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  useEffect(() => {
    if (presetCustomer) setCustomerId(presetCustomer);
  }, [presetCustomer]);

  useEffect(() => {
    const c = (customers.data?.items ?? []).find((row) => row._id === customerId);
    if (!c) return;
    const addrs = (c.addresses || []) as Array<{
      isDefault?: boolean;
      line1?: string;
      city?: string;
      phone?: string;
    }>;
    const addr = addrs.find((a) => a.isDefault) || addrs[0];
    if (addr?.line1) setDeliveryLine1(addr.line1);
    if (addr?.city) setDeliveryCity(addr.city);
    if (addr?.phone || c.phone) setDeliveryPhone(addr?.phone || c.phone || "");
  }, [customerId, customers.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!customerId || !variantId || !startLocal || !endLocal) {
        toast.error("Customer, item, start, and end are required");
        return;
      }
      const startMs = new Date(startLocal).getTime();
      const endMs = new Date(endLocal).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        toast.error("Invalid start or end time");
        return;
      }
      if (startMs < Date.now() - 60_000) {
        toast.error("Start cannot be in the past — pick now or a future time");
        return;
      }
      if (endMs <= startMs) {
        toast.error("End / due back must be after start");
        return;
      }
      if (method === "delivery" && (!deliveryLine1.trim() || !deliveryCity.trim())) {
        toast.error("Delivery needs address line and city");
        return;
      }

      const qty = Number(quantity) || 1;
      setLoading(true);
      const body: Record<string, unknown> = {
        customerId,
        startAt: toIsoLocal(startLocal),
        endAt: toIsoLocal(endLocal),
        orderChannel: "admin",
        lines: [{ variantId, quantity: qty }],
        fulfillment: { method, paymentStatus: "unpaid" },
      };
      if (method === "delivery") {
        body.addresses = {
          delivery: {
            line1: deliveryLine1.trim(),
            city: deliveryCity.trim(),
            phone: deliveryPhone.trim() || undefined,
            fullName: (customers.data?.items ?? []).find((c) => c._id === customerId)?.displayName,
          },
        };
      }

      const out = await rentalCommand<{ rental: RentalOrder }>(
        "/admin/rentals",
        "POST",
        body,
        { idempotencyKey: createIntentKey() }
      );
      toast.success("Rental draft created");
      router.push(`/rentals/${out.rental._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create rental");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader title="New rental" description="Creates a draft. Confirm it on the next screen." />
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label>Customer</Label>
          <Select onValueChange={setCustomerId} value={customerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {(customers.data?.items ?? [])
                .filter((c) => c.status === "active")
                .map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.displayName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Item (variant)</Label>
          <Select onValueChange={setVariantId} value={variantId}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant / SKU" />
            </SelectTrigger>
            <SelectContent>
              {(variants.data?.items ?? []).map((v) => (
                <SelectItem key={v._id} value={v._id}>
                  {v.name} ({v.variantSku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qty">Quantity</Label>
          <Input id="qty" min={1} onChange={(e) => setQuantity(e.target.value)} type="number" value={quantity} />
        </div>
        <div className="space-y-2">
          <Label>Fulfillment</Label>
          <Select onValueChange={(v) => setMethod(v as "pickup" | "delivery")} value={method}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pickup">Store pickup</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {method === "delivery" ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Delivery address (required to schedule later)</p>
            <div className="space-y-2">
              <Label htmlFor="d-line1">Address</Label>
              <Input id="d-line1" onChange={(e) => setDeliveryLine1(e.target.value)} value={deliveryLine1} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-city">City</Label>
              <Input id="d-city" onChange={(e) => setDeliveryCity(e.target.value)} value={deliveryCity} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-phone">Phone</Label>
              <Input id="d-phone" onChange={(e) => setDeliveryPhone(e.target.value)} value={deliveryPhone} />
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="start">Start</Label>
          <Input
            id="start"
            min={minStart}
            onChange={(e) => setStartLocal(e.target.value)}
            required
            type="datetime-local"
            value={startLocal}
          />
          <p className="text-xs text-muted-foreground">Cannot be earlier than now.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">End / due back</Label>
          <Input
            id="end"
            min={startLocal || minStart}
            onChange={(e) => setEndLocal(e.target.value)}
            required
            type="datetime-local"
            value={endLocal}
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={loading} type="submit">
            {loading ? "Creating…" : "Create draft"}
          </Button>
          <Button onClick={() => router.back()} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewRentalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewRentalForm />
    </Suspense>
  );
}
