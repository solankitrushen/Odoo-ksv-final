// SPEC-RMS-001-CAT categories, products, variants, pricelists, rate entries,
// and commercial policy versions. Rates and policies are separate systems.
import mongoose from "mongoose";
import { PERIOD_CODES, POLICY_MODE } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const policyRefSchema = new Schema(
  {
    // Inline commercial policy overrides on product/category (complete objects).
    tax: { type: Schema.Types.Mixed, default: undefined },
    deposit: { type: Schema.Types.Mixed, default: undefined },
    late: { type: Schema.Types.Mixed, default: undefined },
    grace: { type: Schema.Types.Mixed, default: undefined },
    cap: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false, minimize: true }
);

const categorySchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    parentCategoryId: { ...oid("RentalCategory"), default: null },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    sortOrder: { type: Number, default: 0 },
    policies: { type: policyRefSchema, default: () => ({}) },
    version: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
categorySchema.index({ tenantId: 1, code: 1 }, { unique: true });
categorySchema.index({ tenantId: 1, parentCategoryId: 1, status: 1, sortOrder: 1 });

const productSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    productSku: { type: String, required: true },
    name: { type: String, required: true },
    categoryId: { ...oid("RentalCategory"), default: null },
    /** SPEC-014 / SPEC-013 FR-7 — required for new products (admin assigns tax code). */
    taxClassId: { ...oid("RentalTaxCode"), default: null, index: true },
    description: { type: String, default: null },
    brand: { type: String, default: null },
    images: { type: [String], default: [] },
    dimensions: { type: Schema.Types.Mixed, default: null },
    weightGrams: { type: Number, default: null },
    fulfillment: { type: Schema.Types.Mixed, default: null },
    policies: { type: policyRefSchema, default: () => ({}) },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    version: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
productSchema.index({ tenantId: 1, productSku: 1 }, { unique: true });
productSchema.index({ tenantId: 1, categoryId: 1, status: 1, name: 1 });

const variantSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    productId: { ...oid("RentalProduct"), required: true },
    variantSku: { type: String, required: true },
    variantSignature: { type: String, default: "" },
    name: { type: String, required: true },
    attributes: { type: Schema.Types.Mixed, default: {} },
    defaultPeriodCode: { type: String, enum: PERIOD_CODES, default: "day" },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    version: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
variantSchema.index({ tenantId: 1, variantSku: 1 }, { unique: true });
variantSchema.index({ tenantId: 1, productId: 1, variantSignature: 1 }, { unique: true });

const pricelistSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    currency: { type: String, default: "INR", enum: ["INR"] },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
pricelistSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const rateEntrySchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    pricelistId: { ...oid("RentalPricelist"), required: true },
    targetType: { type: String, enum: ["variant", "product", "default"], required: true },
    targetId: { ...oid("RentalVariant"), default: null }, // variant or product id
    periodCode: { type: String, enum: PERIOD_CODES, required: true },
    ratePaise: { type: Number, required: true, min: 0 },
    minimumBillingMinutes: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
rateEntrySchema.index({
  tenantId: 1,
  pricelistId: 1,
  targetType: 1,
  targetId: 1,
  periodCode: 1,
  status: 1,
  effectiveFrom: 1,
});

const commercialPolicySchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    scopeType: { type: String, enum: ["organization", "category", "product"], required: true },
    scopeId: { type: String, default: null },
    policyType: { type: String, enum: ["tax", "deposit", "late", "grace", "cap"], required: true },
    policy: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
commercialPolicySchema.index({
  tenantId: 1,
  scopeType: 1,
  scopeId: 1,
  policyType: 1,
  status: 1,
  effectiveFrom: 1,
});

// Guard: percentage/fixed deposit/cap value ranges validated in services;
// schema keeps them Mixed to preserve explicit zero vs absent.
void POLICY_MODE;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalCategory = model("RentalCategory", categorySchema);
export const RentalProduct = model("RentalProduct", productSchema);
export const RentalVariant = model("RentalVariant", variantSchema);
export const RentalPricelist = model("RentalPricelist", pricelistSchema);
export const RentalRateEntry = model("RentalRateEntry", rateEntrySchema);
export const RentalCommercialPolicyVersion = model(
  "RentalCommercialPolicyVersion",
  commercialPolicySchema
);
