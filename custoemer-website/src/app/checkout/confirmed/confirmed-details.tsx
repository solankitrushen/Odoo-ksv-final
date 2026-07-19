"use client";

import { useSearchParams } from "next/navigation";
import { formatINR } from "@/lib/money";

export function ConfirmedDetails() {
  const params = useSearchParams();
  const order = params.get("order");
  if (!order) return null;

  const total = Number(params.get("total"));
  const sub = Number(params.get("sub"));
  const gst = Number(params.get("gst"));
  const dep = Number(params.get("dep"));
  const paid = params.get("paid") === "1";
  const hasTotals = Number.isFinite(total) && total > 0;

  return (
    <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-card px-6 py-4 text-left">
      <p className="text-2xs uppercase tracking-wide text-ink-soft">Rental number</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink">{order}</p>
      {paid && (
        <p className="mt-3 rounded-md bg-success/12 px-3 py-2 text-sm font-medium text-success">
          Delivery payment captured via Razorpay
        </p>
      )}
      {hasTotals ? (
        <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
          <Row label="Rental subtotal" value={formatINR(sub)} />
          <Row label="GST" value={formatINR(gst)} />
          <Row label="Refundable deposit" value={formatINR(dep)} />
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="font-medium text-ink">Total</dt>
            <dd className="tnum font-semibold text-ink">{formatINR(total)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">
          Pricing is being finalised — you&apos;ll see the confirmed totals in your rentals
          dashboard.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}
