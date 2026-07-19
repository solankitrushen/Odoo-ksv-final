// SPEC-007 FR-12 repair work-order (thin lifecycle).
import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const repairSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    assetId: { ...oid("RentalAsset"), default: null },
    status: {
      type: String,
      enum: ["open", "in_repair", "done", "scrapped"],
      default: "open",
      index: true,
    },
    notes: { type: String, default: null },
    damagePreTaxPaise: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
repairSchema.index({ tenantId: 1, rentalId: 1 });
repairSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalRepairWorkOrder = model("RentalRepairWorkOrder", repairSchema);
