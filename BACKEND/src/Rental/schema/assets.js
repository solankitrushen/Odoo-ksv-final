// SPEC-RMS-001-CAT assets, maintenance blocks, allocations.
import mongoose from "mongoose";
import { ASSET_STATE, ALLOCATION_STATUS } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const assetSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    assetCode: { type: String, required: true },
    variantId: { ...oid("RentalVariant"), required: true },
    productId: { ...oid("RentalProduct"), default: null },
    serialNumber: { type: String, default: null },
    condition: {
      type: String,
      enum: ["new", "excellent", "good", "fair", "damaged", "unusable"],
      default: "good",
    },
    state: {
      type: String,
      enum: Object.values(ASSET_STATE),
      default: ASSET_STATE.AVAILABLE,
      index: true,
    },
    locationId: { type: String, default: "default" },
    lastKnownLocation: { type: Schema.Types.Mixed, default: null },
    acquisition: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, default: null },
    allocationVersion: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
assetSchema.index({ tenantId: 1, assetCode: 1 }, { unique: true });
assetSchema.index(
  { tenantId: 1, serialNumber: 1 },
  { unique: true, partialFilterExpression: { serialNumber: { $type: "string" } } }
);
assetSchema.index({ tenantId: 1, variantId: 1, state: 1, condition: 1, locationId: 1 });

const maintenanceSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    assetId: { ...oid("RentalAsset"), required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    reason: { type: String, default: null },
    notes: { type: String, default: null },
    actorId: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
maintenanceSchema.index({ tenantId: 1, assetId: 1, startAt: 1, endAt: 1, status: 1 });

const allocationSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    rentalId: { ...oid("RentalOrder"), required: true },
    lineId: { type: String, required: true },
    assetId: { ...oid("RentalAsset"), required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(ALLOCATION_STATUS),
      default: ALLOCATION_STATUS.HELD,
      index: true,
    },
    expiresAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
allocationSchema.index({ tenantId: 1, rentalId: 1, lineId: 1, assetId: 1 }, { unique: true });
allocationSchema.index({ tenantId: 1, assetId: 1, status: 1, startAt: 1, endAt: 1 });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalAsset = model("RentalAsset", assetSchema);
export const RentalMaintenanceBlock = model("RentalMaintenanceBlock", maintenanceSchema);
export const RentalAllocation = model("RentalAllocation", allocationSchema);
