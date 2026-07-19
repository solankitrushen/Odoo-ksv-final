"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Truck,
  Store,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-store";
import {
  setCartFulfillment,
  checkoutServerCart,
  createCheckoutRazorpayOrder,
  confirmCheckoutPayment,
  previewHasError,
  UnauthorizedError,
  RentalApiError,
} from "@/lib/rental-api";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { formatINR, estimateLineSubtotal, periodsInWindow } from "@/lib/money";
import type { Address, FulfilmentMethod } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const isObjectId = (s: string) => /^[a-f\d]{24}$/i.test(s);

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, preview, mode, clear, hydrated: cartHydrated, busy } = useCart();
  const { user, addresses, saveAddresses, isAuthenticated, hydrated: authHydrated, clearSession } =
    useAuth();

  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>("delivery");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [form, setForm] = useState({
    label: "Home",
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (authHydrated && !isAuthenticated) router.replace("/login?next=/checkout");
  }, [authHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (addresses.length === 0) {
      setSelectedAddressId("new");
      return;
    }
    const def = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(def.id);
  }, [addresses]);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        fullName: f.fullName || `${user.firstName} ${user.lastName}`.trim(),
        phone: f.phone || user.phone || "",
      }));
    }
  }, [user]);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedAddressId("new");
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  if (!cartHydrated || !authHydrated || !isAuthenticated) {
    return (
      <div className="container py-12">
        <Skeleton className="h-9 w-40" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container flex flex-col items-center py-28 text-center">
        <h1 className="text-2xl font-semibold text-ink">Nothing to check out</h1>
        <p className="mt-2 text-ink-soft">Your cart is empty.</p>
        <Button asChild className="mt-6">
          <Link href="/products">Browse the catalog</Link>
        </Button>
      </div>
    );
  }

  const estimate = lines.reduce((s, l) => s + estimateLineSubtotal(l), 0);
  const deposit = preview?.deposit.depositPaise ?? 0;
  const gst = preview?.bookedGstPaise ?? 0;
  const subtotal = preview?.preTaxSubtotalPaise ?? estimate;
  const dueNow = preview ? preview.totalPaise + deposit : estimate;

  const newAddressValid = Boolean(
    form.fullName.trim() &&
      form.phone.trim() &&
      form.line1.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.pincode.trim(),
  );

  function canPlace(): boolean {
    if (fulfilment === "pickup") return true;
    if (selectedAddressId !== "new" && isObjectId(selectedAddressId)) return true;
    return newAddressValid;
  }

  async function resolveDeliveryAddressId(): Promise<string> {
    if (selectedAddressId !== "new" && isObjectId(selectedAddressId)) return selectedAddressId;
    const newAddr: Address = {
      id: `new-${Date.now()}`,
      label: form.label.trim() || "Home",
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim() || undefined,
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      isDefault: addresses.length === 0,
    };
    const saved = await saveAddresses([...addresses, newAddr]);
    const match =
      saved.find(
        (a) =>
          a.line1 === newAddr.line1 && a.pincode === newAddr.pincode && a.phone === newAddr.phone,
      ) ??
      saved.find((a) => a.isDefault) ??
      saved[saved.length - 1];
    if (!match) throw new RentalApiError("Could not save the delivery address", "VALIDATION_ERROR", 400);
    return match.id;
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    try {
      if (fulfilment === "delivery") {
        const addressId = await resolveDeliveryAddressId();
        await setCartFulfillment({ method: "delivery", addressId });
      } else {
        await setCartFulfillment({ method: "pickup" });
      }

      const { rental, preview: quote } = await checkoutServerCart();
      if (previewHasError(quote)) {
        setError(quote.error);
        setPlacing(false);
        return;
      }

      if (fulfilment === "delivery") {
        const payOrder = await createCheckoutRazorpayOrder(rental._id);
        const paid = await openRazorpayCheckout(payOrder, {
          name: form.fullName.trim() || user?.firstName,
          contact: form.phone.trim() || user?.phone,
          email: user?.email,
        });
        await confirmCheckoutPayment(rental._id, paid);
      }

      await clear();
      const qs = new URLSearchParams({ order: rental.rentalNumber, id: rental._id });
      qs.set("total", String(quote.totalPaise));
      qs.set("sub", String(quote.preTaxSubtotalPaise));
      qs.set("gst", String(quote.bookedGstPaise));
      qs.set("dep", String(quote.deposit?.depositPaise ?? 0));
      if (fulfilment === "delivery") qs.set("paid", "1");
      router.push(`/checkout/confirmed?${qs}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearSession();
        router.replace("/login?next=/checkout");
        return;
      }
      const msg =
        err instanceof RentalApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not place the order. Please retry.";
      setError(
        msg === "Payment cancelled" ? "Payment cancelled — the order is unpaid. Try again to pay." : msg,
      );
      setPlacing(false);
    }
  }

  return (
    <div className="container py-8 md:py-12">
      <Link href="/cart" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Back to cart
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <h1 className="text-display font-semibold text-ink">Checkout</h1>

          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-base font-medium text-ink">Fulfilment</h2>
              <RadioGroup
                value={fulfilment}
                onValueChange={(v) => setFulfilment(v as FulfilmentMethod)}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <FulfilmentCard
                  value="delivery"
                  active={fulfilment === "delivery"}
                  icon={Truck}
                  title="We deliver to you"
                  body="Pay now — our team delivers to your saved address and you track it in your dashboard."
                />
                <FulfilmentCard
                  value="pickup"
                  active={fulfilment === "pickup"}
                  icon={Store}
                  title="Store pickup"
                  body="Reserve now, collect from our depot. We email pickup details once your request is confirmed."
                />
              </RadioGroup>
            </section>

            {fulfilment === "delivery" && (
              <section>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-base font-medium text-ink">Delivery address</h2>
                  <Link
                    href="/account/addresses"
                    className="text-xs font-medium text-ink-soft hover:text-ink hover:underline"
                  >
                    Manage saved addresses
                  </Link>
                </div>

                {addresses.length > 0 && (
                  <RadioGroup
                    value={selectedAddressId}
                    onValueChange={setSelectedAddressId}
                    className="mt-3 space-y-2"
                  >
                    {addresses.map((a) => (
                      <Label
                        key={a.id}
                        htmlFor={`addr-${a.id}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          selectedAddressId === a.id
                            ? "border-ink bg-muted/50"
                            : "border-line hover:border-line-strong",
                        )}
                      >
                        <RadioGroupItem value={a.id} id={`addr-${a.id}`} className="mt-0.5" />
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-medium text-ink">
                            {a.label || "Address"}
                            {a.isDefault ? " · Default" : ""}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-soft">
                            {a.fullName} · {a.line1}, {a.city} {a.pincode}
                          </span>
                        </span>
                      </Label>
                    ))}
                    <Label
                      htmlFor="addr-new"
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        selectedAddressId === "new"
                          ? "border-ink bg-muted/50"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <RadioGroupItem value="new" id="addr-new" className="mt-0.5" />
                      <span className="text-sm font-medium text-ink">Use a different address</span>
                    </Label>
                  </RadioGroup>
                )}

                {(selectedAddressId === "new" || addresses.length === 0) && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <Field id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")} className="col-span-2" required />
                    <Field id="phone" label="Phone" value={form.phone} onChange={set("phone")} className="col-span-2" required />
                    <Field id="line1" label="Address" value={form.line1} onChange={set("line1")} className="col-span-2" required />
                    <Field id="line2" label="Address line 2" value={form.line2} onChange={set("line2")} className="col-span-2" />
                    <Field id="city" label="City" value={form.city} onChange={set("city")} required />
                    <Field id="state" label="State" value={form.state} onChange={set("state")} required />
                    <Field id="pincode" label="PIN code" value={form.pincode} onChange={set("pincode")} className="col-span-2" required />
                  </div>
                )}
              </section>
            )}

            {fulfilment === "pickup" && (
              <section className="rounded-lg border border-line bg-card p-4">
                <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Store className="h-4 w-4" /> Store pickup
                </h2>
                <p className="mt-2 text-sm text-ink-soft">
                  Place your reservation now — we&apos;ll confirm the pickup depot, timing, and any
                  balance by email. No payment is taken online for pickup orders.
                </p>
              </section>
            )}

            <div className="rounded-lg border border-line bg-muted/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <ShieldCheck className="h-4 w-4" />
                {deposit > 0 ? `${formatINR(deposit)} refundable deposit` : "Refundable deposit applies"}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                The deposit is held during your rental and returned in full when gear comes back on
                time and in working order.
              </p>
            </div>

            {error && (
              <p className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={placeOrder}
              disabled={placing || busy || !canPlace()}
            >
              {placing
                ? fulfilment === "delivery"
                  ? "Opening payment…"
                  : "Placing order…"
                : fulfilment === "delivery"
                  ? "Pay & place order"
                  : "Place rental request"}
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-card p-6">
            <h2 className="text-base font-medium text-ink">Order summary</h2>
            <ul className="mt-4 space-y-3">
              {lines.map((line) => {
                const periods = periodsInWindow(line.startAt, line.endAt, line.periodCode);
                return (
                  <li key={line.id} className="flex gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-line bg-muted">
                      <Image src={line.image} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{line.productName}</p>
                      <p className="tnum text-xs text-ink-soft">
                        {line.quantity} × {periods} {line.periodCode}
                        {periods > 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="tnum text-sm text-ink">
                      {line.ratePaise > 0 ? formatINR(estimateLineSubtotal(line)) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Separator className="my-4" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Subtotal</dt>
                <dd className="tnum text-ink">{formatINR(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">GST{preview ? "" : " (est.)"}</dt>
                <dd className="tnum text-ink">{preview ? formatINR(gst) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Deposit (refundable)</dt>
                <dd className="tnum text-ink">{preview ? formatINR(deposit) : "—"}</dd>
              </div>
            </dl>
            <Separator className="my-4" />
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-ink">{preview ? "Due now" : "Estimated total"}</span>
              <span className="tnum text-xl font-semibold text-ink">{formatINR(dueNow)}</span>
            </div>
            {!preview && (
              <p className="mt-2 text-xs text-ink-soft">
                Final GST and deposit are confirmed the moment you place the order.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FulfilmentCard({
  value,
  active,
  icon: Icon,
  title,
  body,
}: {
  value: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Label
      htmlFor={value}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        active ? "border-ink bg-muted/50" : "border-line hover:border-line-strong",
      )}
    >
      <RadioGroupItem value={value} id={value} className="mt-0.5" />
      <span className="flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className="h-4 w-4" /> {title}
        </span>
        <span className="mt-1 block text-xs text-ink-soft">{body}</span>
      </span>
    </Label>
  );
}

function Field({
  id,
  label,
  className,
  ...props
}: { id: string; label: string; className?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      <Input id={id} {...props} />
    </div>
  );
}
