// SPEC-014 tax codes. Products reference taxClassId → this collection.
import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const taxCodeSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    /** Rate in basis points (1800 = 18%). */
    rateBps: { type: Number, required: true, min: 0, max: 10000 },
    mode: { type: String, enum: ["exclusive", "inclusive"], default: "exclusive" },
    jurisdiction: { type: String, default: "IN" },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    version: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
taxCodeSchema.index({ tenantId: 1, code: 1 }, { unique: true });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalTaxCode = model("RentalTaxCode", taxCodeSchema);
