export const ROLES = {
  ADMIN: "admin",
  STORE: "store",
  USER: "user",
};

export const COOKIE_NAMES = {
  AUTH: "authToken",
  REFRESH: "refreshToken",
};

export const AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 60,
};

export const DISCOUNT_TYPES = ["percentage", "fixed"];
export const DISCOUNT_APPLICABLE = ["items", "combos", "both"];

export const MENU_IMAGE = {
  maxBytes: 15 * 1024 * 1024, // 15 MB — HEIC/RAW files can be large
  mimeTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/avif",
    "image/svg+xml",
    // Apple HEIC / HEIF (iPhone camera format)
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
  ],
};

export const ORDER_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  PREPARING: "preparing",
  READY: "ready",
  IN_DELIVERY: "in_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

export const DELIVERY_TYPES = ["takeaway", "delivery", "dine_in"];

export const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
};

export const STORE_MESSAGE_TYPES = ["prep_note", "feedback", "general"];

export const DELIVERY_MAX_KM = 1;
export const DELIVERY_FREE_KM = 1;
export const DELIVERY_RATE_PER_KM = 15;

// Minimum cart subtotal (in INR) before an order can be placed.
// Enforced in buildOrderQuote so the request never reaches Razorpay
// when the line items would total below this floor — blocks empty-cart
// and ₹0/manipulated payment attempts at the source.
export const MIN_ORDER_AMOUNT_INR = 200;

// Per-store ordering defaults. Stores may override via PATCH /store/profile/ordering.
// minOrderValue is the hard floor (cannot order below it); freeDeliveryThreshold is
// the subtotal at/above which delivery is free within freeRadiusKm; below it the
// flat deliveryFee applies. Mirrored as literals in Schema/Store.js `ordering`.
export const ORDERING_DEFAULTS = {
  minOrderValue: MIN_ORDER_AMOUNT_INR,
  freeDeliveryThreshold: 399,
  deliveryFee: 40,
  freeRadiusKm: DELIVERY_FREE_KM,
  maxRadiusKm: DELIVERY_MAX_KM,
  perKmFee: DELIVERY_RATE_PER_KM,
};

export const ORDER_RATE_LIMIT = {
  windowMs: 60 * 1000,
  max: 10,
};

export const PAYMENT_PROVIDERS = {
  RAZORPAY: "razorpay",
  TEST: "test",
};

export const DELIVERY_OTP_LENGTH = 6;

/** Platform fee on order subtotal (1% = 0.01) */
export const PLATFORM_FEE_RATE = 0.01;

export const REVENUE_ORDER_STATUSES = [
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

export const VB_ROLES = {
  ADMIN: "admin",
  OFFICER: "officer",
  MANAGER: "manager",
  VENDOR: "vendor",
};

export const VB_ROLE_VALUES = Object.values(VB_ROLES);

export const TENANT_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
};

export const VENDOR_STATUS = {
  INVITED: "invited",
  ACTIVE: "active",
  INACTIVE: "inactive",
};

export const INVITE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
  REVOKED: "revoked",
};

export const RFQ_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
};

export const RFQ_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

// ---- SPEC-VB-003 quotation core ----
export const QUOTATION_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  WITHDRAWN: "withdrawn",
  EXPIRED: "expired",
};

export const QUOTATION_SOURCE = {
  MANUAL: "manual",
  AI_GENERATED: "ai-generated",
  AI_ENHANCED: "ai-enhanced",
  CSV_IMPORT: "csv-import",
  PDF_EXTRACT: "pdf-extract",
};

// Active statuses participate in the per-vendor partial-unique index.
export const QUOTATION_ACTIVE_STATUSES = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.SUBMITTED,
];

export const QUOTATION_CONFIG = {
  idempotencyTtlS: Number(process.env.QUOTATION_IDEMPOTENCY_TTL_S) || 86400,
  expiryTickMs: Number(process.env.QUOTATION_EXPIRY_TICK_MS) || 60000,
  defaultCurrency: process.env.DEFAULT_CURRENCY || "INR",
};

// ---- SPEC-VB-003-AI ----
export const AI_SESSION_MODE = {
  GENERATE: "generate",
  ENHANCE: "enhance",
};

export const AI_SESSION_STATUS = {
  OPEN: "open",
  ANSWERED: "answered",
  DRAFTED: "drafted",
  CLOSED: "closed",
};

export const AI_QUESTION_KIND = {
  MONEY: "money",
  INT: "int",
  DATE: "date",
  ENUM: "enum",
  TEXT: "text",
  BOOL: "bool",
};

export const AI_QUESTION_KIND_VALUES = Object.values(AI_QUESTION_KIND);

export const QUOTATION_AI_CONFIG = {
  provider: process.env.QUOTATION_AI_PROVIDER || "heuristic",
  sessionTtlS: Number(process.env.QUOTATION_AI_SESSION_TTL_S) || 86400,
  peerMinSamples: Number(process.env.AI_PEER_MIN_SAMPLES) || 3,
  ratePerMin: Number(process.env.QUOTATION_AI_RATE_PER_MIN) || 20,
};


// ---- SPEC-VB-005 approval + review + tickets + invoices ----
export const QUOTATION_APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const AI_RECOMMENDATION = {
  APPROVE: "approve",
  REVIEW: "review",
  REJECT: "reject",
};

// Heuristic thresholds for AI auto-review (score is 0..100).
export const REVIEW_CONFIG = {
  approveAtOrAbove: Number(process.env.REVIEW_APPROVE_SCORE) || 80,
  rejectBelow: Number(process.env.REVIEW_REJECT_SCORE) || 40,
};

export const TICKET_STATUS = {
  OPEN: "open",
  AWAITING_VENDOR: "awaiting_vendor",
  AWAITING_ADMIN: "awaiting_admin",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

export const TICKET_TYPE = {
  BARGAIN: "bargain",
  QUERY: "query",
  GENERAL: "general",
};

export const INVOICE_STATUS = {
  ISSUED: "issued",
  PAID: "paid",
  CANCELLED: "cancelled",
};
