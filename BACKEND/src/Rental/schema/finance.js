// SPEC-RMS-PAY-002 payments + deposit ledger (append-only).
import mongoose from "mongoose";
import { PAYMENT_DIRECTION, DEPOSIT_EVENT, PROVIDERS } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const paymentSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    direction: { type: String, enum: Object.values(PAYMENT_DIRECTION), required: true },
    method: { type: String, required: true }, // razorpay|cash|bank_transfer|upi_manual|cheque|other_manual
    provider: { type: String, default: null },
    amountPaise: { type: Number, required: true, min: 0 },
    allocation: {
      chargePaise: { type: Number, default: 0, min: 0 },
      depositPaise: { type: Number, default: 0, min: 0 },
    },
    currency: { type: String, default: "INR", enum: ["INR"] },
    status: {
      type: String,
      enum: ["created", "pending", "authorized", "captured", "failed", "cancelled", "requested", "submitted", "processed", "manual_review", "voided"],
      default: "created",
      index: true,
    },
    providerOrderId: { type: String, default: null },
    providerPaymentId: { type: String, default: null },
    providerRefundId: { type: String, default: null },
    idempotencyKey: { type: String, default: null },
    reference: { type: String, default: null },
    reason: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } }
);
paymentSchema.index(
  { provider: 1, providerRefundId: 1 },
  { unique: true, partialFilterExpression: { providerRefundId: { $type: "string" } } }
);
paymentSchema.index({ tenantId: 1, rentalId: 1, createdAt: -1 });

const depositEntrySchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    eventType: { type: String, enum: Object.values(DEPOSIT_EVENT), required: true },
    state: { type: String, default: "posted" },
    amountPaise: { type: Number, required: true, min: 0 },
    category: { type: String, default: null }, // forfeiture category
    reason: { type: String, default: null },
    approvalArtifactId: { type: String, default: null },
    chargeAllocations: { type: [Schema.Types.Mixed], default: [] },
    paymentId: { ...oid("RentalPayment"), default: null },
    providerRefundId: { type: String, default: null },
    idempotencyKey: { type: String, default: null },
    actorId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
depositEntrySchema.index(
  { tenantId: 1, idempotencyKey: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
depositEntrySchema.index({ tenantId: 1, rentalId: 1, createdAt: 1 });

void PROVIDERS;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalPayment = model("RentalPayment", paymentSchema);
export const RentalDepositEntry = model("RentalDepositEntry", depositEntrySchema);
