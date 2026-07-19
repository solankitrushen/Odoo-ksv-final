"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShieldCheck, CalendarClock, Check, Loader2 } from "lucide-react";
import { addMinutes, format, parse } from "date-fns";
import type { Product, RentalPeriodUnit } from "@/lib/domain/types";
import { PERIOD_MINUTES } from "@/lib/domain/types";
import { formatINR, toIsoWithOffset } from "@/lib/money";
import { useCart } from "@/lib/cart-store";
import { checkAvailability, RentalApiError } from "@/lib/rental-public-api";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PERIOD_ORDER: RentalPeriodUnit[] = ["hour", "day", "week", "month"];
const MAX_QTY = 20;

type AvailState =
  | { status: "idle" | "loading" }
  | { status: "ok"; availableCount: number; requested: number; sufficient: boolean }
  | { status: "error"; message: string };

function todayInputValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function windowFromStartDate(
  startDate: string,
  unit: RentalPeriodUnit,
  periods: number,
): { start: Date; end: Date } {
  const now = new Date();
  const parsed = parse(startDate, "yyyy-MM-dd", now);
  let start = new Date(parsed);
  start.setHours(now.getHours(), now.getMinutes(), 0, 0);
  if (start < now) start = now;
  const end = addMinutes(start, PERIOD_MINUTES[unit] * periods);
  return { start, end };
}

export function BuyBox({ product }: { product: Product }) {
  const router = useRouter();
  const { add, busy } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [periods, setPeriods] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [startDate, setStartDate] = useState(todayInputValue);
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [unit, setUnit] = useState<RentalPeriodUnit>("day");
  const [avail, setAvail] = useState<AvailState>({ status: "idle" });

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const periodUnits = variant
    ? PERIOD_ORDER.filter((p) => variant.rates.some((r) => r.unit === p))
    : [];
  const activeUnit = periodUnits.includes(unit) ? unit : periodUnits[0] ?? "day";
  const rate = variant?.rates.find((r) => r.unit === activeUnit) ?? variant?.rates[0];

  const { subtotal, startAt, endAt, start, end } = useMemo(() => {
    const { start: s, end: e } = windowFromStartDate(startDate, activeUnit, periods);
    return {
      subtotal: rate ? rate.amount * periods * quantity : 0,
      startAt: toIsoWithOffset(s),
      endAt: toIsoWithOffset(e),
      start: s,
      end: e,
    };
  }, [rate, periods, quantity, activeUnit, startDate]);

  useEffect(() => {
    if (!variant) return;
    let cancelled = false;
    setAvail({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const out = await checkAvailability({
          variantId: variant.id,
          startAt,
          endAt,
          quantity,
        });
        if (!cancelled) {
          setAvail({
            status: "ok",
            availableCount: out.availableCount,
            requested: out.requested,
            sufficient: out.sufficient,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setAvail({
            status: "error",
            message: err instanceof RentalApiError ? err.message : "Could not check availability",
          });
        }
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [variant, startAt, endAt, quantity]);

  if (!variant || !rate) {
    return (
      <div className="rounded-xl border border-line bg-card p-5 text-sm text-ink-soft">
        Pricing unavailable for this product.
      </div>
    );
  }

  const blocked =
    avail.status === "loading" ||
    avail.status === "error" ||
    (avail.status === "ok" && !avail.sufficient);

  async function handleAdd(goToCart: boolean) {
    if (!variant || !rate || blocked) return;
    setPending(true);
    try {
      await add({
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        image: product.image,
        variantId: variant.id,
        variantLabel: variant.label,
        periodCode: activeUnit,
        quantity,
        ratePaise: rate.amount,
        startAt,
        endAt,
      });
      if (goToCart) {
        router.push("/cart");
        return;
      }
      setAdded(true);
      toast("Added to cart", {
        description: `${product.name} · ${periods} ${activeUnit}${periods > 1 ? "s" : ""}`,
        tone: "success",
      });
      setTimeout(() => setAdded(false), 1800);
    } catch (err) {
      toast("Couldn't add to cart", {
        description: err instanceof RentalApiError ? err.message : "Please try again",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  const working = pending || busy;

  return (
    <div className="rounded-xl border border-line bg-card p-5 md:p-6">
      {product.variants.length > 1 && (
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-medium text-ink">Configuration</legend>
          <div className="grid gap-2">
            {product.variants.map((v) => {
              const active = v.id === variantId;
              const dayRate = v.rates.find((r) => r.unit === "day") ?? v.rates[0];
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
                    active ? "border-ink bg-muted/60" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="text-sm text-ink">{v.label}</span>
                  {dayRate && (
                    <span className="tnum text-sm text-ink-soft">
                      {formatINR(dayRate.amount)}/{dayRate.unit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium text-ink">Rental window</legend>
        <div className="mb-3">
          <Label htmlFor="start-date" className="mb-1.5 block text-xs text-ink-soft">
            Start date
          </Label>
          <Input
            id="start-date"
            type="date"
            min={todayInputValue()}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value || todayInputValue())}
            className="tnum"
          />
        </div>

        <div
          className="grid gap-1.5 rounded-lg bg-muted p-1"
          style={{ gridTemplateColumns: `repeat(${periodUnits.length}, minmax(0, 1fr))` }}
        >
          {periodUnits.map((p) => {
            const active = p === activeUnit;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setUnit(p);
                  setPeriods(1);
                }}
                className={cn(
                  "rounded-md py-2 text-sm capitalize transition-colors",
                  active ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink",
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stepper
            label={`${activeUnit}s`}
            value={periods}
            min={1}
            max={activeUnit === "hour" ? 23 : activeUnit === "day" ? 30 : 12}
            onChange={setPeriods}
          />
          <Stepper label="units" value={quantity} min={1} max={MAX_QTY} onChange={setQuantity} />
        </div>
        <p className="tnum mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
          <CalendarClock className="h-3.5 w-3.5" />
          {format(start, "d MMM, h:mmaaa")} → {format(end, "d MMM, h:mmaaa")}
        </p>

        <AvailabilityLine state={avail} />
      </fieldset>

      <dl className="space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-soft">
            {formatINR(rate.amount)} × {periods} {activeUnit}
            {periods > 1 ? "s" : ""} × {quantity}
          </dt>
          <dd className="tnum text-ink">{formatINR(subtotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-medium text-ink">Rental estimate</dt>
          <dd className="tnum text-xl font-semibold text-ink">{formatINR(subtotal)}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-2">
        <Button size="lg" onClick={() => handleAdd(true)} disabled={working || blocked}>
          {working ? "Adding…" : "Reserve now"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => handleAdd(false)}
          disabled={working || blocked}
        >
          {added ? (
            <>
              <Check className="h-4 w-4" /> Added
            </>
          ) : (
            "Add to cart"
          )}
        </Button>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
        <ShieldCheck className="h-3.5 w-3.5" />
        GST and refundable deposit are calculated at checkout.
      </p>
    </div>
  );
}

function AvailabilityLine({ state }: { state: AvailState }) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking availability…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="mt-3 text-xs text-danger" role="alert">
        {state.message}
      </p>
    );
  }
  if (state.status !== "ok") return null;
  if (!state.sufficient) {
    return (
      <p className="mt-3 text-xs text-danger" role="alert">
        Only {state.availableCount} available for these dates (you asked for {state.requested}).
      </p>
    );
  }
  return (
    <p className="mt-3 text-xs text-success" aria-live="polite">
      {state.availableCount} available for this window
    </p>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between rounded-lg border border-line">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-11 w-11 items-center justify-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="tnum text-sm font-medium text-ink">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-11 w-11 items-center justify-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-center text-2xs uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}
