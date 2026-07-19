"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useCart } from "@/lib/cart-store";
import { formatINR, estimateLineSubtotal, periodsInWindow } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function CartPage() {
  const { lines, updateQuantity, remove, hydrated, mode, preview, busy } = useCart();

  if (!hydrated) {
    return (
      <div className="container py-12">
        <Skeleton className="h-9 w-40" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container flex flex-col items-center justify-center py-28 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <ShoppingBag className="h-7 w-7 text-ink-soft" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Your cart is empty</h1>
        <p className="mt-2 max-w-sm text-ink-soft">
          Reserve cameras, sound, staging, or tools and they&apos;ll show up here.
        </p>
        <Button asChild className="mt-6">
          <Link href="/products">Browse the catalog</Link>
        </Button>
      </div>
    );
  }

  const estimate = lines.reduce((s, l) => s + estimateLineSubtotal(l), 0);
  const unavailable = lines.some((l) => l.availability && !l.availability.sufficient);

  return (
    <div className="container py-10 md:py-14">
      <h1 className="text-display font-semibold text-ink">Your cart</h1>
      <p className="mt-2 text-ink-soft">
        {lines.length} {lines.length === 1 ? "reservation" : "reservations"}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((line) => {
            const periods = periodsInWindow(line.startAt, line.endAt, line.periodCode);
            const short = line.availability && !line.availability.sufficient;
            return (
              <li key={line.id} className="flex gap-4 py-5">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-muted">
                  <Image src={line.image} alt={line.productName} fill sizes="96px" className="object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {line.productSlug ? (
                        <Link
                          href={`/products/${line.productSlug}`}
                          className="text-sm font-medium text-ink hover:underline"
                        >
                          {line.productName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-ink">{line.productName}</span>
                      )}
                      {line.variantLabel && (
                        <p className="mt-0.5 text-xs text-ink-soft">{line.variantLabel}</p>
                      )}
                      <p className="tnum mt-1 text-xs text-ink-soft">
                        {periods} {line.periodCode}
                        {periods > 1 ? "s" : ""} · {format(new Date(line.startAt), "d MMM")} →{" "}
                        {format(new Date(line.endAt), "d MMM")}
                      </p>
                      {short && (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Only {line.availability!.availableCount} available for these dates
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(line.id)}
                      disabled={busy}
                      aria-label="Remove"
                      className="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:bg-muted hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <div className="flex items-center rounded-lg border border-line">
                      <button
                        aria-label="Decrease quantity"
                        disabled={line.quantity <= 1 || busy}
                        onClick={() => updateQuantity(line.id, line.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="tnum w-8 text-center text-sm text-ink">{line.quantity}</span>
                      <button
                        aria-label="Increase quantity"
                        disabled={busy}
                        onClick={() => updateQuantity(line.id, line.quantity + 1)}
                        className="flex h-9 w-9 items-center justify-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="tnum text-sm font-medium text-ink">
                      {line.ratePaise > 0 ? formatINR(estimateLineSubtotal(line)) : "—"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-card p-6">
            <h2 className="text-base font-medium text-ink">Order summary</h2>

            {mode === "server" && preview ? (
              <>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <Row label="Rental subtotal" value={formatINR(preview.preTaxSubtotalPaise)} />
                  <Row label="GST" value={formatINR(preview.bookedGstPaise)} />
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-ink-soft">
                      <ShieldCheck className="h-4 w-4" /> Refundable deposit
                    </dt>
                    <dd className="tnum text-ink">{formatINR(preview.deposit.depositPaise)}</dd>
                  </div>
                </dl>
                <Separator className="my-4" />
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-ink">Due now</span>
                  <span className="tnum text-xl font-semibold text-ink">
                    {formatINR(preview.totalPaise + preview.deposit.depositPaise)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Includes {formatINR(preview.deposit.depositPaise)} refundable deposit
                </p>
              </>
            ) : (
              <>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <Row label="Rental estimate" value={formatINR(estimate)} />
                </dl>
                <Separator className="my-4" />
                <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-ink-soft">
                  GST, deposit, and live availability are confirmed once you sign in and reach
                  checkout.
                </p>
              </>
            )}

            <Button
              asChild
              size="lg"
              className="mt-5 w-full"
              disabled={unavailable}
            >
              <Link href="/checkout">
                Checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {unavailable && (
              <p className="mt-2 text-center text-xs text-danger">
                Adjust quantities or dates for the flagged items to continue.
              </p>
            )}
            <Link
              href="/products"
              className="mt-3 block text-center text-sm text-ink-soft hover:text-ink"
            >
              Continue browsing
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}
