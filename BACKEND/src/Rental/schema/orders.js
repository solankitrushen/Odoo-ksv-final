// SPEC-RMS-001 §7 rental order aggregate + invoices.
import mongoose from "mongoose";
import { RENTAL_STATUS, PERIOD_CODES, POLICY_MODE } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const lineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    productId: { ...oid("RentalProduct"), default: null },
    variantId: { ...oid("RentalVariant"), default: null },
    catalogItemId: { type: String, default: null },
    nameSnapshot: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    periodCode: { type: String, enum: PERIOD_CODES, default: "day" },
    unitMinutes: { type: Number, default: null },
    ratePaise: { type: Number, default: null },
    minimumBillingMinutes: { type: Number, default: 0 },
    /** Optional per-line window (multi-window cart/order). Falls back to order start/end. */
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    locationId: { type: String, default: null },
    // Snapshotted complete policy objects (confirmation-time).
    taxSnapshot: { type: Schema.Types.Mixed, default: null },
    lateSnapshot: { type: Schema.Types.Mixed, default: null },
    graceSnapshot: { type: Schema.Types.Mixed, default: null },
    capSnapshot: { type: Schema.Types.Mixed, default: null },
    linePreTaxPaise: { type: Number, default: 0 },
    lineGstPaise: { type: Number, default: 0 },
    lineGrossPaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const depositSnapshotSchema = new Schema(
  {
    mode: { type: String, enum: Object.values(POLICY_MODE), default: POLICY_MODE.FIXED },
    depositPaise: { type: Number, default: 0 },
    selectedBps: { type: Number, default: null },
    sourceLevel: { type: String, default: null },
    inputs: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalNumber: { type: String, required: true },
    customerId: { ...oid("RentalCustomer"), required: true },
    customerSnapshot: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: Object.values(RENTAL_STATUS),
      default: RENTAL_STATUS.DRAFT,
      index: true,
    },
    orderChannel: {
      type: String,
      enum: ["admin", "walk_in", "phone", "email", "external_assisted", "customer"],
      default: "admin",
    },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    plannedEndAt: { type: Date, default: null },
    actualIssuedAt: { type: Date, default: null },
    actualReturnedAt: { type: Date, default: null },
    timezone: { type: String, default: "Asia/Kolkata" },
    lines: { type: [lineSchema], default: [] },
    addresses: { type: Schema.Types.Mixed, default: null },
    fulfillment: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, default: null },
    // Immutable pricing snapshot (set at confirmation).
    preTaxSubtotalPaise: { type: Number, default: 0 },
    bookedGstPaise: { type: Number, default: 0 },
    confirmedBillableMinutesByLine: { type: Schema.Types.Mixed, default: {} },
    depositSnapshot: { type: depositSnapshotSchema, default: null },
    pricingFingerprint: { type: String, default: null },
    snapshotAt: { type: Date, default: null },
    // Financial projections (rebuildable from ledgers).
    chargeGrossPaise: { type: Number, default: 0 },
    paymentsPaise: { type: Number, default: 0 },
    refundsPaise: { type: Number, default: 0 },
    deductionsPaise: { type: Number, default: 0 },
    forfeitedDepositPaise: { type: Number, default: 0 },
    depositCollectedPaise: { type: Number, default: 0 },
    depositRefundsPendingPaise: { type: Number, default: 0 },
    depositRefundsCompletedPaise: { type: Number, default: 0 },
    depositLiabilityPaise: { type: Number, default: 0 },
    refundableDepositPaise: { type: Number, default: 0 },
    balanceDuePaise: { type: Number, default: 0 },
    lateFeePaise: { type: Number, default: 0 },
    lateGstPaise: { type: Number, default: 0 },
    damagePreTaxPaise: { type: Number, default: 0 },
    damageGstPaise: { type: Number, default: 0 },
    /** SPEC-007 manual inspection — three-angle photo evidence + notes. */
    inspection: {
      type: new Schema(
        {
          photos: {
            front: { type: String, default: null },
            side: { type: String, default: null },
            back: { type: String, default: null },
          },
          notes: { type: String, default: null },
          assessedAt: { type: Date, default: null },
          assessedBy: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    /** Outstanding after deposit applied (late + damage shortfall). */
    settlementShortfallPaise: { type: Number, default: 0 },
    settlementAlertSentAt: { type: Date, default: null },
    /** Reminder dedupe: pre-due email once; overdue invoice email once per day (yyyy-mm-dd). */
    dueSoonEmailedAt: { type: Date, default: null },
    lastOverdueEmailDay: { type: String, default: null },
    reservationExpiresAt: { type: Date, default: null },
    invoiceIds: { type: [Schema.Types.ObjectId], default: [] },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
orderSchema.index({ tenantId: 1, rentalNumber: 1 }, { unique: true });
orderSchema.index({ tenantId: 1, status: 1, startAt: 1 });
orderSchema.index({ tenantId: 1, status: 1, endAt: 1 });
orderSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

const invoiceSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    invoiceNumber: { type: String, required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    customerId: { ...oid("RentalCustomer"), default: null },
    type: { type: String, enum: ["quote", "tax_invoice", "final", "credit_note", "receipt"], required: true },
    contentHash: { type: String, default: null },
    lines: { type: [Schema.Types.Mixed], default: [] },
    /** Payment / deposit ledger rows appended onto the same PDF (one invoice doc). */
    paymentLines: { type: [Schema.Types.Mixed], default: [] },
    totals: { type: Schema.Types.Mixed, default: {} },
    depositSummary: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "issued" },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    sourceVersion: { type: Number, default: null },
    originalInvoiceId: { ...oid("RentalInvoice"), default: null },
    pdf: { type: Schema.Types.Mixed, default: null },
    /** Customer email delivery for this invoice PDF. */
    emailDelivery: {
      status: {
        type: String,
        enum: ["not_sent", "sent", "failed", "skipped"],
        default: "not_sent",
      },
      sentAt: { type: Date, default: null },
      lastAttemptAt: { type: Date, default: null },
      lastError: { type: String, default: null },
      to: { type: String, default: null },
    },
  },
  { timestamps: true }
);
invoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, rentalId: 1, issuedAt: -1 });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalOrder = model("RentalOrder", orderSchema);
export const RentalInvoice = model("RentalInvoice", invoiceSchema);
