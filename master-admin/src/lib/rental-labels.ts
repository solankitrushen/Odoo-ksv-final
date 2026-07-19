/** Plain-language labels for non-tech ops users. */

const RENTAL_STATUS: Record<string, string> = {
  draft: "Draft",
  reserved: "Reserved",
  confirmed: "Confirmed",
  dispatch_pending: "Ready to send",
  dispatched: "On the way",
  active: "Out with customer",
  overdue: "Overdue",
  return_pending: "Return pending",
  returned: "Returned",
  inspection: "Checking item",
  exception: "Needs attention",
  closed: "Closed",
  cancelled: "Cancelled",
  cancelled_exception: "Cancelled (issue)",
  expired: "Expired",
};

const CUSTOMER_STATUS: Record<string, string> = {
  active: "Active",
  blocked: "Blocked",
  archived: "Inactive",
  merged: "Merged",
  pseudonymized: "Removed",
  inactive: "Inactive",
};

/** @deprecated prefer labelRentalStatus / labelCustomerStatus */
export function labelStatus(status?: string | null): string {
  if (!status) return "—";
  return RENTAL_STATUS[status] ?? CUSTOMER_STATUS[status] ?? status.replace(/_/g, " ");
}

export function labelRentalStatus(status?: string | null): string {
  if (!status) return "—";
  return RENTAL_STATUS[status] ?? status.replace(/_/g, " ");
}

export function labelCustomerStatus(status?: string | null): string {
  if (!status) return "—";
  return CUSTOMER_STATUS[status] ?? status.replace(/_/g, " ");
}

/** Catalog products / categories / tax codes (active|archived). */
export function labelCatalogStatus(status?: string | null): string {
  if (!status) return "—";
  if (status === "active") return "Active";
  if (status === "archived") return "Inactive";
  return status.replace(/_/g, " ");
}

export function labelAction(action: string): string {
  const map: Record<string, string> = {
    reserve: "Hold stock",
    confirm: "Confirm booking",
    dispatch: "Schedule delivery",
    "confirm-delivery": "Mark delivered",
    issue: "Hand out item",
    return: "Record return",
    inspection: "Finish check",
    close: "Close rental",
    cancel: "Cancel",
  };
  return map[action] ?? action;
}

export function labelShipmentStatus(status?: string | null): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    quote_requested: "Quote requested",
    quoted: "Quoted",
    create_pending: "Creating",
    booked: "Scheduled",
    courier_assigned: "Courier assigned",
    picked_up: "Picked up",
    in_transit: "Out for delivery",
    delivered: "Delivered",
    delayed: "Delayed",
    cancelled: "Cancelled",
    failed: "Failed",
  };
  return map[status] ?? status.replace(/_/g, " ");
}
