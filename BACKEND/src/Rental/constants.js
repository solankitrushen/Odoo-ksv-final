// SPEC-RMS-001 rental constants. Additive; does not modify legacy config/constants.js.

/** Fixed rental period unit minutes. Month is exactly 30 days, never calendar. */
export const UNIT_MINUTES = Object.freeze({
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
  month: 43200,
});

export const PERIOD_CODES = Object.freeze(Object.keys(UNIT_MINUTES));

/** JWT realms. Operator reuses existing 'vb'; customers get a distinct realm. */
export const RENTAL_REALM = Object.freeze({
  ADMIN: "vb",
  CUSTOMER: "rental_customer",
});

export const RENTAL_CUSTOMER_ROLE = "rental_customer";

/** Deposit / cap policy modes. */
export const POLICY_MODE = Object.freeze({ FIXED: "fixed", PERCENTAGE: "percentage" });

/** Commercial policy types resolved independently through the precedence chain. */
export const POLICY_TYPES = Object.freeze(["tax", "deposit", "late", "grace", "cap"]);

/** Precedence source levels (highest → lowest). Variant is never a policy level. */
export const POLICY_SOURCE = Object.freeze({
  LINE: "line",
  PRODUCT: "product",
  CATEGORY: "category",
  ORGANIZATION: "organization",
  SYSTEM: "system",
});

export const RENTAL_STATUS = Object.freeze({
  DRAFT: "draft",
  RESERVED: "reserved",
  CONFIRMED: "confirmed",
  DISPATCH_PENDING: "dispatch_pending",
  DISPATCHED: "dispatched",
  ACTIVE: "active",
  OVERDUE: "overdue",
  RETURN_PENDING: "return_pending",
  RETURNED: "returned",
  INSPECTION: "inspection",
  CLOSED: "closed",
  CANCELLED: "cancelled",
  CANCELLED_EXCEPTION: "cancelled_exception",
  EXPIRED: "expired",
  EXCEPTION: "exception",
});

export const RENTAL_TERMINAL = Object.freeze([
  RENTAL_STATUS.CLOSED,
  RENTAL_STATUS.CANCELLED,
  RENTAL_STATUS.CANCELLED_EXCEPTION,
  RENTAL_STATUS.EXPIRED,
]);

export const ASSET_STATE = Object.freeze({
  AVAILABLE: "available",
  HELD: "held",
  RESERVED: "reserved",
  DISPATCHED: "dispatched",
  IN_TRANSIT: "in_transit",
  RENTED: "rented",
  RETURN_IN_TRANSIT: "return_in_transit",
  INSPECTION: "inspection",
  MAINTENANCE: "maintenance",
  LOST: "lost",
  RETIRED: "retired",
});

export const ALLOCATION_STATUS = Object.freeze({
  HELD: "held",
  CONFIRMED: "confirmed",
  ACTIVE: "active",
  RELEASED: "released",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

/** Allocation statuses that block availability for an overlapping interval. */
export const BLOCKING_ALLOCATION_STATUSES = Object.freeze([
  ALLOCATION_STATUS.HELD,
  ALLOCATION_STATUS.CONFIRMED,
  ALLOCATION_STATUS.ACTIVE,
]);

export const SHIPMENT_STATUS = Object.freeze({
  QUOTE_REQUESTED: "quote_requested",
  QUOTED: "quoted",
  CREATE_PENDING: "create_pending",
  BOOKED: "booked",
  COURIER_ASSIGNED: "courier_assigned",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  DELAYED: "delayed",
  CANCEL_PENDING: "cancel_pending",
  CANCELLED: "cancelled",
  FAILED: "failed",
  UNKNOWN: "unknown",
  MANUAL_REVIEW: "manual_review",
});

/** Monotonic mainline rank for Borzo shipment status merges (never regress). */
export const SHIPMENT_MAINLINE_RANK = Object.freeze({
  [SHIPMENT_STATUS.QUOTE_REQUESTED]: 0,
  [SHIPMENT_STATUS.QUOTED]: 0,
  [SHIPMENT_STATUS.CREATE_PENDING]: 0,
  [SHIPMENT_STATUS.BOOKED]: 1,
  [SHIPMENT_STATUS.COURIER_ASSIGNED]: 2,
  [SHIPMENT_STATUS.PICKED_UP]: 3,
  [SHIPMENT_STATUS.IN_TRANSIT]: 4,
  [SHIPMENT_STATUS.DELIVERED]: 5,
});

export const SHIPMENT_LEG = Object.freeze({ OUTBOUND: "outbound", RETURN: "return" });

export const PAYMENT_DIRECTION = Object.freeze({ CHARGE: "charge", REFUND: "refund" });

export const DEPOSIT_EVENT = Object.freeze({
  COLLECTED: "deposit_collected",
  APPLIED: "deposit_applied",
  FORFEITED: "deposit_forfeited",
  REFUND_REQUESTED: "deposit_refund_requested",
  REFUND_COMPLETED: "deposit_refund_completed",
  REFUND_FAILED: "deposit_refund_failed",
  REFUND_CANCELLED: "deposit_refund_cancelled",
});

export const FORFEIT_CATEGORIES = Object.freeze([
  "lost_asset",
  "unreturned_asset",
  "contractual_cancellation",
  "other_authorized",
]);

export const PROVIDERS = Object.freeze({
  RAZORPAY: "razorpay",
  BORZO: "borzo", // legacy adapter kept; runtime delivery uses MOCK
  MSG91: "msg91",
  MOCK: "mock",
});

/** Customer-facing mock delivery promise (no 3PL until frontend/ops ready). */
export const MOCK_DELIVERY_MESSAGE = "We'll deliver to you in 4-5 days";
export const MOCK_DELIVERY_MIN_DAYS = 4;
export const MOCK_DELIVERY_MAX_DAYS = 5;

export const ROLLOUT_MODE = Object.freeze({ DISABLED: "disabled", CANARY: "canary", ALL: "all" });

export const NOTIFICATION_PURPOSES = Object.freeze([
  "booking_confirmed",
  "payment_received",
  "dispatch_update",
  "due_reminder",
  "overdue_reminder",
  "return_update",
  "refund_update",
  "rental_cancelled",
]);

export const OTP_PURPOSES = Object.freeze(["handover", "return"]);

/** Stable, tenant-safe error codes (SPEC-RMS-001 error catalog + child specs). */
export const RENTAL_ERROR = Object.freeze({
  VALIDATION_ERROR: { http: 400, code: "VALIDATION_ERROR" },
  INVALID_INTERVAL: { http: 400, code: "INVALID_INTERVAL" },
  UNAUTHORIZED: { http: 401, code: "UNAUTHORIZED" },
  FORBIDDEN: { http: 403, code: "FORBIDDEN" },
  RESOURCE_NOT_FOUND: { http: 404, code: "RESOURCE_NOT_FOUND" },
  DUPLICATE_RESOURCE: { http: 409, code: "DUPLICATE_RESOURCE" },
  RESOURCE_IN_USE: { http: 409, code: "RESOURCE_IN_USE" },
  CUSTOMER_DUPLICATE: { http: 409, code: "CUSTOMER_DUPLICATE" },
  CUSTOMER_MERGED: { http: 409, code: "CUSTOMER_MERGED" },
  DELIVERY_QUOTE_EXPIRED: { http: 409, code: "DELIVERY_QUOTE_EXPIRED" },
  DELIVERY_QUOTE_CHANGED: { http: 409, code: "DELIVERY_QUOTE_CHANGED" },
  IDEMPOTENCY_CONFLICT: { http: 409, code: "IDEMPOTENCY_CONFLICT" },
  VERSION_CONFLICT: { http: 409, code: "VERSION_CONFLICT" },
  INVALID_STATE_TRANSITION: { http: 409, code: "INVALID_STATE_TRANSITION" },
  ASSET_UNAVAILABLE: { http: 409, code: "ASSET_UNAVAILABLE" },
  RESERVATION_EXPIRED: { http: 409, code: "RESERVATION_EXPIRED" },
  PAYMENT_ALREADY_USED: { http: 409, code: "PAYMENT_ALREADY_USED" },
  PRICE_CHANGED: { http: 409, code: "PRICE_CHANGED" },
  PRICING_RANGE_EXCEEDED: { http: 422, code: "PRICING_RANGE_EXCEEDED" },
  PRICE_NOT_CONFIGURED: { http: 422, code: "PRICE_NOT_CONFIGURED" },
  PRICING_CONFIGURATION_INCOMPLETE: { http: 422, code: "PRICING_CONFIGURATION_INCOMPLETE" },
  DEPOSIT_MODE_CONFLICT: { http: 422, code: "DEPOSIT_MODE_CONFLICT" },
  DEPOSIT_POLICY_CONFLICT: { http: 422, code: "DEPOSIT_POLICY_CONFLICT" },
  PAYMENT_AMOUNT_MISMATCH: { http: 422, code: "PAYMENT_AMOUNT_MISMATCH" },
  REFUND_EXCEEDS_CAPTURE: { http: 422, code: "REFUND_EXCEEDS_CAPTURE" },
  DEPOSIT_LEDGER_MISMATCH: { http: 422, code: "DEPOSIT_LEDGER_MISMATCH" },
  OTP_INVALID_OR_EXPIRED: { http: 422, code: "OTP_INVALID_OR_EXPIRED" },
  EMAIL_NOT_VERIFIED: { http: 403, code: "EMAIL_NOT_VERIFIED" },
  CUSTOMER_BLOCKED: { http: 403, code: "CUSTOMER_BLOCKED" },
  PROVIDER_NOT_CONFIGURED: { http: 424, code: "PROVIDER_NOT_CONFIGURED" },
  PROVIDER_REJECTED: { http: 502, code: "PROVIDER_REJECTED" },
  PROVIDER_CONTRACT_MISMATCH: { http: 502, code: "PROVIDER_CONTRACT_MISMATCH" },
  PROVIDER_UNAVAILABLE: { http: 503, code: "PROVIDER_UNAVAILABLE" },
  PROVIDER_OUTCOME_UNKNOWN: { http: 503, code: "PROVIDER_OUTCOME_UNKNOWN" },
  TRANSACTION_REQUIRED: { http: 503, code: "TRANSACTION_REQUIRED" },
  RATE_LIMITED: { http: 429, code: "RATE_LIMITED" },
});

/** Locked system-safe commercial policy defaults (SPEC-RMS-001). */
export const SYSTEM_SAFE_POLICY = Object.freeze({
  tax: { gstBps: 0 },
  deposit: { mode: POLICY_MODE.FIXED, valuePaise: 0 },
  late: { enabled: false },
  grace: { minutes: 0 },
  cap: { mode: POLICY_MODE.FIXED, valuePaise: 0 },
});

/** Largest safe integer paise value we permit to persist/return (< 2^53). */
export const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER;
