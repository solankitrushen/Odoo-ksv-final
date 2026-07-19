import { format, formatDistanceToNowStrict } from "date-fns";
import type { RentalPeriodUnit } from "./domain/types";
import type { RentalStatus } from "./rental-api";

export function fmtDate(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM yyyy") : "—";
}

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM, h:mmaaa") : "—";
}

export function fromNow(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function perUnitLabel(unit: RentalPeriodUnit): string {
  return `/${unit}`;
}

type BadgeVariant = "default" | "success" | "warn" | "danger" | "muted" | "outline";

export const RENTAL_STATUS_META: Record<RentalStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Requested", variant: "outline" },
  reserved: { label: "Reserved", variant: "outline" },
  confirmed: { label: "Confirmed", variant: "default" },
  dispatch_pending: { label: "Preparing", variant: "warn" },
  dispatched: { label: "On the way", variant: "warn" },
  active: { label: "On rent", variant: "default" },
  overdue: { label: "Overdue", variant: "danger" },
  return_pending: { label: "Return due", variant: "warn" },
  returned: { label: "Returned", variant: "success" },
  inspection: { label: "Inspection", variant: "muted" },
  closed: { label: "Closed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "muted" },
  cancelled_exception: { label: "Cancelled", variant: "muted" },
  expired: { label: "Expired", variant: "muted" },
  exception: { label: "Needs attention", variant: "danger" },
};

export function rentalStatusMeta(status: RentalStatus | string) {
  return RENTAL_STATUS_META[status as RentalStatus] ?? { label: status, variant: "muted" as const };
}

/** Statuses that count as "in play" for the customer dashboard. */
export const OPEN_RENTAL_STATUSES: RentalStatus[] = [
  "draft",
  "reserved",
  "confirmed",
  "dispatch_pending",
  "dispatched",
  "active",
  "overdue",
  "return_pending",
];
