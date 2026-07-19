// SPEC-004 portal cart — one open cart per customer per tenant.
import mongoose from "mongoose";
import { PERIOD_CODES } from "../constants.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const cartLineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    variantId: { ...oid("RentalVariant"), required: true },
    quantity: { type: Number, required: true, min: 1, max: 1000 },
    periodCode: { type: String, enum: PERIOD_CODES, default: "day" },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    locationId: { type: String, default: null },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    customerId: { ...oid("RentalCustomer"), required: true },
    lines: { type: [cartLineSchema], default: [] },
    fulfillment: {
      method: { type: String, enum: ["delivery", "pickup"], default: "pickup" },
      addressId: { type: String, default: null },
    },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
cartSchema.index({ tenantId: 1, customerId: 1 }, { unique: true });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalCart = model("RentalCart", cartSchema);
