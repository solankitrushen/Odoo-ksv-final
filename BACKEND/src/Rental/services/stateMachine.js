// SPEC-RMS-001 pure state machines and provider status mapping. No I/O.
import {
  RENTAL_STATUS,
  ASSET_STATE,
  SHIPMENT_STATUS,
  SHIPMENT_MAINLINE_RANK,
} from "../constants.js";

const RENTAL_TRANSITIONS = {
  [RENTAL_STATUS.DRAFT]: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CANCELLED],
  [RENTAL_STATUS.RESERVED]: [
    RENTAL_STATUS.CONFIRMED,
    RENTAL_STATUS.DRAFT,
    RENTAL_STATUS.CANCELLED,
    RENTAL_STATUS.EXPIRED,
  ],
  [RENTAL_STATUS.CONFIRMED]: [
    RENTAL_STATUS.DISPATCH_PENDING,
    RENTAL_STATUS.ACTIVE,
    RENTAL_STATUS.CANCELLED,
    RENTAL_STATUS.EXCEPTION,
  ],
  [RENTAL_STATUS.DISPATCH_PENDING]: [
    RENTAL_STATUS.DISPATCHED,
    RENTAL_STATUS.ACTIVE,
    RENTAL_STATUS.CANCELLED,
    RENTAL_STATUS.EXCEPTION,
  ],
  [RENTAL_STATUS.DISPATCHED]: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.EXCEPTION],
  [RENTAL_STATUS.ACTIVE]: [
    RENTAL_STATUS.OVERDUE,
    RENTAL_STATUS.RETURN_PENDING,
    RENTAL_STATUS.RETURNED,
    RENTAL_STATUS.CANCELLED_EXCEPTION,
  ],
  [RENTAL_STATUS.OVERDUE]: [RENTAL_STATUS.RETURN_PENDING, RENTAL_STATUS.RETURNED],
  [RENTAL_STATUS.RETURN_PENDING]: [RENTAL_STATUS.RETURNED, RENTAL_STATUS.EXCEPTION],
  [RENTAL_STATUS.RETURNED]: [RENTAL_STATUS.INSPECTION],
  [RENTAL_STATUS.INSPECTION]: [RENTAL_STATUS.CLOSED],
  [RENTAL_STATUS.EXCEPTION]: [
    RENTAL_STATUS.CONFIRMED,
    RENTAL_STATUS.ACTIVE,
    RENTAL_STATUS.RETURN_PENDING,
    RENTAL_STATUS.CANCELLED_EXCEPTION,
  ],
  [RENTAL_STATUS.CLOSED]: [],
  [RENTAL_STATUS.CANCELLED]: [],
  [RENTAL_STATUS.CANCELLED_EXCEPTION]: [],
  [RENTAL_STATUS.EXPIRED]: [],
};

export function canTransitionRental(from, to) {
  return (RENTAL_TRANSITIONS[from] || []).includes(to);
}

export function assertRentalTransition(from, to) {
  if (!canTransitionRental(from, to)) {
    return { ok: false, code: "INVALID_STATE_TRANSITION", from, to };
  }
  return { ok: true };
}

const ASSET_TRANSITIONS = {
  [ASSET_STATE.AVAILABLE]: [ASSET_STATE.HELD, ASSET_STATE.MAINTENANCE, ASSET_STATE.RETIRED],
  [ASSET_STATE.HELD]: [ASSET_STATE.RESERVED, ASSET_STATE.AVAILABLE],
  [ASSET_STATE.RESERVED]: [
    ASSET_STATE.DISPATCHED,
    ASSET_STATE.RENTED,
    ASSET_STATE.AVAILABLE,
  ],
  [ASSET_STATE.DISPATCHED]: [ASSET_STATE.IN_TRANSIT, ASSET_STATE.RENTED],
  [ASSET_STATE.IN_TRANSIT]: [ASSET_STATE.RENTED],
  [ASSET_STATE.RENTED]: [ASSET_STATE.RETURN_IN_TRANSIT, ASSET_STATE.INSPECTION],
  [ASSET_STATE.RETURN_IN_TRANSIT]: [ASSET_STATE.INSPECTION],
  [ASSET_STATE.INSPECTION]: [
    ASSET_STATE.AVAILABLE,
    ASSET_STATE.MAINTENANCE,
    ASSET_STATE.LOST,
    ASSET_STATE.RETIRED,
  ],
  [ASSET_STATE.MAINTENANCE]: [ASSET_STATE.AVAILABLE, ASSET_STATE.RETIRED],
  [ASSET_STATE.LOST]: [],
  [ASSET_STATE.RETIRED]: [],
};

export function canTransitionAsset(from, to) {
  return (ASSET_TRANSITIONS[from] || []).includes(to);
}

/** Map a raw Borzo order/delivery status to an internal shipment status. */
export function mapBorzoStatus(raw) {
  switch (raw) {
    case "new":
    case "available":
    case "planned":
      return SHIPMENT_STATUS.BOOKED;
    case "courier_assigned":
    case "active":
    case "courier_departed":
    case "courier_at_pickup":
      return SHIPMENT_STATUS.COURIER_ASSIGNED;
    case "parcel_picked_up":
      return SHIPMENT_STATUS.PICKED_UP;
    case "courier_arrived":
      return SHIPMENT_STATUS.IN_TRANSIT;
    case "completed":
    case "finished":
      return SHIPMENT_STATUS.DELIVERED;
    case "delayed":
      return SHIPMENT_STATUS.DELAYED;
    case "canceled":
    case "deleted":
      return SHIPMENT_STATUS.CANCELLED;
    default:
      return SHIPMENT_STATUS.UNKNOWN;
  }
}

/**
 * Monotonic merge: never regress a mainline shipment status. A mapped status
 * that is on the mainline and ranks higher advances; otherwise the current
 * status is retained and the raw value is metadata only.
 * cancelled is terminal on its valid branch (only from non-terminal).
 */
export function mergeShipmentStatus(current, mapped) {
  if (current === SHIPMENT_STATUS.DELIVERED || current === SHIPMENT_STATUS.CANCELLED) {
    return current; // terminal; raw becomes metadata only.
  }
  if (mapped === SHIPMENT_STATUS.CANCELLED) {
    return SHIPMENT_STATUS.CANCELLED;
  }
  if (mapped === SHIPMENT_STATUS.DELAYED || mapped === SHIPMENT_STATUS.UNKNOWN) {
    return current; // metadata / exception only, no mainline change.
  }
  const curRank = SHIPMENT_MAINLINE_RANK[current] ?? -1;
  const mapRank = SHIPMENT_MAINLINE_RANK[mapped] ?? -1;
  return mapRank > curRank ? mapped : current;
}

/** Payment status ordering: captured/processed cannot regress. */
const PAYMENT_RANK = { created: 0, pending: 1, authorized: 2, captured: 3, failed: 3, cancelled: 3 };
export function canAdvancePayment(current, next) {
  const c = PAYMENT_RANK[current] ?? -1;
  const n = PAYMENT_RANK[next] ?? -1;
  if (current === "captured") return next === "captured";
  return n >= c;
}
