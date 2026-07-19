// SPEC-RMS-DN-003 shipments, delivery quotes, notifications, OTP challenges.
import mongoose from "mongoose";
import {
  PROVIDERS,
  SHIPMENT_STATUS,
  SHIPMENT_LEG,
  NOTIFICATION_PURPOSES,
  OTP_PURPOSES,
} from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const deliveryQuoteSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    leg: { type: String, enum: Object.values(SHIPMENT_LEG), required: true },
    provider: { type: String, default: PROVIDERS.BORZO },
    payloadHash: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 0 },
    warnings: { type: [String], default: [] },
    quotedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    sourceVersion: { type: Number, default: null },
  },
  { timestamps: true }
);
deliveryQuoteSchema.index({ tenantId: 1, rentalId: 1, leg: 1, createdAt: -1 });

const shipmentSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    leg: { type: String, enum: Object.values(SHIPMENT_LEG), required: true },
    generation: { type: Number, default: 1 },
    provider: { type: String, default: PROVIDERS.BORZO },
    quoteId: { ...oid("RentalDeliveryQuote"), default: null },
    providerOrderId: { type: String, default: null },
    providerDeliveryId: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(SHIPMENT_STATUS),
      default: SHIPMENT_STATUS.QUOTE_REQUESTED,
      index: true,
    },
    rawStatus: { type: String, default: null },
    trackingUrl: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
shipmentSchema.index(
  { provider: 1, providerOrderId: 1 },
  { unique: true, partialFilterExpression: { providerOrderId: { $type: "string" } } }
);
shipmentSchema.index({ tenantId: 1, rentalId: 1, leg: 1, generation: 1 });
shipmentSchema.index({ tenantId: 1, status: 1, updatedAt: 1 });

const notificationSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), default: null },
    customerId: { ...oid("RentalCustomer"), default: null },
    channel: { type: String, enum: ["sms", "whatsapp"], default: "sms" },
    purpose: { type: String, enum: NOTIFICATION_PURPOSES, required: true },
    templateId: { type: String, default: null },
    templateVersion: { type: String, default: null },
    destinationMask: { type: String, default: null },
    destinationHash: { type: String, default: null },
    provider: { type: String, default: PROVIDERS.MSG91 },
    providerMessageId: { type: String, default: null },
    sourceEventId: { type: String, default: null },
    status: {
      type: String,
      enum: ["queued", "sending", "sent", "delivered", "failed_retryable", "failed_terminal", "failed", "dead_letter", "unknown"],
      default: "queued",
      index: true,
    },
    errorCode: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
notificationSchema.index(
  { provider: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $type: "string" } } }
);
notificationSchema.index({ tenantId: 1, status: 1, nextAttemptAt: 1 });
notificationSchema.index(
  { tenantId: 1, sourceEventId: 1, purpose: 1, channel: 1 },
  { unique: true, partialFilterExpression: { sourceEventId: { $type: "string" } } }
);

const otpChallengeSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), default: null },
    customerAuthId: { ...oid("RentalCustomerAuth"), default: null },
    purpose: { type: String, required: true }, // handover|return|login
    phoneHash: { type: String, required: true },
    providerCorrelation: { type: String, default: null },
    state: { type: String, enum: ["issued", "verified", "expired", "locked"], default: "issued", index: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
otpChallengeSchema.index({ tenantId: 1, rentalId: 1, purpose: 1, state: 1 });
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

void OTP_PURPOSES;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalDeliveryQuote = model("RentalDeliveryQuote", deliveryQuoteSchema);
export const RentalShipment = model("RentalShipment", shipmentSchema);
export const RentalNotification = model("RentalNotification", notificationSchema);
export const RentalOtpChallenge = model("RentalOtpChallenge", otpChallengeSchema);
