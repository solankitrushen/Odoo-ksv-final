import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import type { RentalOrder } from "@/lib/rental-api";
import { formatINR } from "@/lib/money";
import { fmtDate, rentalStatusMeta } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function OrderCard({ order }: { order: RentalOrder }) {
  const meta = rentalStatusMeta(order.status);
  const first = order.lines[0];
  const extra = order.lines.length - 1;
  const total = order.preTaxSubtotalPaise + order.bookedGstPaise;
  const deposit = order.depositSnapshot?.depositPaise ?? 0;

  return (
    <Link
      href={`/account/orders/${order._id}`}
      className="group flex items-center gap-4 rounded-xl border border-line bg-card p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-muted">
        <Package className="h-6 w-6 text-ink-soft" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tnum text-xs text-ink-soft">{order.rentalNumber}</span>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-ink">
          {first?.nameSnapshot ?? `${order.lines.length} item${order.lines.length === 1 ? "" : "s"}`}
          {extra > 0 && <span className="text-ink-soft"> +{extra} more</span>}
        </p>
        <p className="tnum mt-0.5 text-xs text-ink-soft">
          {fmtDate(order.startAt)} → {fmtDate(order.endAt)}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        {total > 0 ? (
          <>
            <p className="tnum text-sm font-medium text-ink">{formatINR(total)}</p>
            {deposit > 0 && (
              <p className="text-2xs text-ink-soft">+{formatINR(deposit)} deposit</p>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-soft">Pricing pending</p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
