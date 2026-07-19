// SPEC-RMS-001 §7 / SPEC-RMS-002 audit, provider ops, webhook events, idempotency,
// numbering, tenant rental settings. All tenant-scoped and append-only where required.
import mongoose from "mongoose";
import { PROVIDERS } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

// --- Tenant rental settings (non-secret; secrets stay in env) ---
const settingsSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true, unique: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    dueWindowMinutes: { type: Number, default: 1440 },
    numberingPrefix: { type: String, default: "RENT" },
    paymentPolicy: {
      type: String,
      enum: ["prepaid", "postpaid", "deposit_only"],
      default: "prepaid",
    },
    // Per-tenant provider toggles. Cannot force a false global term on; only off.
    providerEnabled: {
      razorpay: { type: Boolean, default: true },
      borzo: { type: Boolean, default: false }, // 3PL off — mock delivery until enabled
      msg91: { type: Boolean, default: true },
    },
    notificationPurposes: { type: [String], default: [] },
    /** SPEC-011 FR-7 optional widget layout */
    dashboardWidgets: { type: Schema.Types.Mixed, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// --- Append-only audit ---
const auditSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    actorType: { type: String, required: true }, // admin|customer|system|webhook
    actorId: { type: String, default: null },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: null },
    resourceVersion: { type: Number, default: null },
    beforeSummary: { type: Schema.Types.Mixed, default: null },
    afterSummary: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
    requestId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false }
);
auditSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });
auditSchema.index({ tenantId: 1, actorId: 1, createdAt: -1 });

// --- Provider operations (durable post-commit outbox) ---
const providerOpSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    provider: { type: String, enum: Object.values(PROVIDERS), required: true },
    operation: { type: String, required: true },
    aggregateType: { type: String, default: null },
    aggregateId: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
    fingerprint: { type: String, default: null },
    state: {
      type: String,
      enum: ["pending", "in_progress", "success", "rejected", "retryable", "unknown", "manual_review"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedBy: { type: String, default: null },
    lockUntil: { type: Date, default: null },
    safeCode: { type: String, default: null },
    providerIds: { type: Schema.Types.Mixed, default: {} },
    metaRedacted: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
providerOpSchema.index(
  { tenantId: 1, provider: 1, operation: 1, idempotencyKey: 1 },
  { unique: true }
);
providerOpSchema.index({ state: 1, nextAttemptAt: 1 });

// --- Durable webhook receipt (compound provider+eventId uniqueness) ---
const webhookEventSchema = new Schema(
  {
    provider: { type: String, enum: Object.values(PROVIDERS), required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, default: null },
    tenantId: { ...oid("Tenant"), default: null },
    aggregateId: { type: String, default: null },
    rawHash: { type: String, default: null },
    signatureStatus: { type: String, default: "valid" },
    payloadRedacted: { type: Schema.Types.Mixed, default: null },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    processingError: { type: String, default: null },
  },
  { timestamps: true }
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ processedAt: 1, createdAt: 1 });

// --- Rental idempotency (generalized actor dimension) ---
const idempotencySchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    actorType: { type: String, required: true },
    actorId: { type: String, default: "system" },
    scope: { type: String, required: true },
    key: { type: String, required: true, maxlength: 200 },
    fingerprint: { type: String, required: true },
    statusCode: { type: Number, default: null },
    response: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
idempotencySchema.index(
  { tenantId: 1, actorType: 1, actorId: 1, scope: 1, key: 1 },
  { unique: true }
);
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// --- Atomic per-tenant numbering ---
const seqSchema = new Schema({
  tenantId: { ...oid("Tenant"), required: true },
  namespace: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
seqSchema.index({ tenantId: 1, namespace: 1 }, { unique: true });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalSettings = model("RentalSettings", settingsSchema);
export const RentalAuditEvent = model("RentalAuditEvent", auditSchema);
export const ProviderOperation = model("ProviderOperation", providerOpSchema);
export const RentalWebhookEvent = model("RentalWebhookEvent", webhookEventSchema);
export const RentalIdempotency = model("RentalIdempotency", idempotencySchema);
export const RentalSeqCounter = model("RentalSeqCounter", seqSchema);
