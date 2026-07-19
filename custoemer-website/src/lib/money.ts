// Money + rental-period helpers. Integer paise only, never float rupees.
// The server (/cart/preview, rental quote) is authoritative; helpers here only
// drive guest-side estimates and display.

import type { Paise, RentalPeriodUnit } from "./domain/types";
import { PERIOD_MINUTES } from "./domain/types";

/** ISO-8601 with local offset — backend zod datetime({ offset: true }). */
export function toIsoWithOffset(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Format integer paise as ₹ with Indian grouping. */
export function formatINR(paise: Paise, opts?: { withDecimals?: boolean }): string {
  const rupees = paise / 100;
  const withDecimals = opts?.withDecimals ?? paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(rupees);
}

/** Whole billing periods spanned by a window, rounded up, minimum 1. */
export function periodsInWindow(
  startAt: string | Date,
  endAt: string | Date,
  periodCode: RentalPeriodUnit,
): number {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  const minutes = ms / 60000;
  return Math.max(1, Math.ceil(minutes / PERIOD_MINUTES[periodCode]));
}

/** Guest-side line estimate: rate × periods × quantity. Not authoritative. */
export function estimateLineSubtotal(line: {
  ratePaise: number;
  periodCode: RentalPeriodUnit;
  quantity: number;
  startAt: string;
  endAt: string;
}): Paise {
  return line.ratePaise * periodsInWindow(line.startAt, line.endAt, line.periodCode) * line.quantity;
}
