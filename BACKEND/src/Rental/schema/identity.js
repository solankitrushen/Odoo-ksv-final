// SPEC-RMS-001-IDC customer, identity claims, and the customer auth realm.
import mongoose from "mongoose";
import { comparePasswordMethod, hashPasswordHook } from "../../Schema/shared/passwordHooks.js";
import { RENTAL_CUSTOMER_ROLE } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const contactSchema = new Schema(
  {
    name: String,
    role: String,
    email: String,
    phone: String,
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const addressSchema = new Schema(
  {
    type: { type: String, enum: ["billing", "service", "registered", "other"], default: "service" },
    label: { type: String, default: "" },
    recipient: String,
    phone: { type: String, default: null },
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: { type: String, default: "IN" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    instructions: String,
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const customerSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    customerNumber: { type: String, required: true },
    type: { type: String, enum: ["person", "business"], default: "person" },
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    legalName: { type: String, default: null },
    emailMasked: { type: String, default: null },
    phoneMasked: { type: String, default: null },
    gstinMasked: { type: String, default: null },
    contacts: { type: [contactSchema], default: [] },
    addresses: { type: [addressSchema], default: [] },
    tags: { type: [String], default: [] },
    notes: { type: String, default: null },
    photoUrl: { type: String, default: null },
    externalRef: { type: String, default: null },
    status: {
      type: String,
      enum: ["active", "blocked", "archived", "merged", "pseudonymized"],
      default: "active",
      index: true,
    },
    /** Why blocked / deactivated — shown to rental admins. */
    statusReason: { type: String, default: null, maxlength: 2000 },
    mergedInto: { ...oid("RentalCustomer"), default: null },
    pseudonymizedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
customerSchema.index({ tenantId: 1, customerNumber: 1 }, { unique: true });
customerSchema.index({ tenantId: 1, status: 1, displayName: 1 });

const claimSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    customerId: { ...oid("RentalCustomer"), required: true },
    claimType: {
      type: String,
      required: true,
      // external:<provider> stored with the provider suffix; validated in service.
    },
    normalizedValue: { type: String, required: true },
    state: { type: String, enum: ["active", "released"], default: "active", index: true },
    aliasKind: { type: String, default: null },
    sourceCustomerId: { ...oid("RentalCustomer"), default: null },
    claimedAt: { type: Date, default: Date.now },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
// Active uniqueness is tenant+type+value (partial index on active state).
claimSchema.index(
  { tenantId: 1, claimType: 1, normalizedValue: 1 },
  { unique: true, partialFilterExpression: { state: "active" } }
);
claimSchema.index({ tenantId: 1, customerId: 1, state: 1 });

// Customer auth realm (SPEC-RMS-AUTH-001).
const custAuthSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    customerId: { ...oid("RentalCustomer"), required: true },
    phone: { type: String, default: null }, // E.164, optional
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, default: null, select: false },
    role: { type: String, default: RENTAL_CUSTOMER_ROLE },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    credentialsVersion: { type: Number, default: 0 },
    // Email verification challenge (hashed code only).
    emailVerifyHash: { type: String, default: null, select: false },
    emailVerifyExpiresAt: { type: Date, default: null },
    emailVerifyAttempts: { type: Number, default: 0 },
    // Login OTP challenge (hashed verifier only).
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
custAuthSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
custAuthSchema.index({ tenantId: 1, email: 1 }, { unique: true });
custAuthSchema.index({ customerId: 1 }, { unique: true });
custAuthSchema.pre("save", hashPasswordHook);
custAuthSchema.methods.comparePassword = comparePasswordMethod;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalCustomer = model("RentalCustomer", customerSchema);
export const RentalIdentityClaim = model("RentalIdentityClaim", claimSchema);
export const RentalCustomerAuth = model("RentalCustomerAuth", custAuthSchema);
