// SPEC-016 risk incidents (thin).
import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const incidentSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    customerId: { ...oid("RentalCustomer"), default: null },
    rentalId: { ...oid("RentalOrder"), default: null },
    type: {
      type: String,
      enum: ["damage", "loss", "fraud", "non_return", "other"],
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "written_off"],
      default: "open",
      index: true,
    },
    notes: { type: String, default: null },
    amountPaise: { type: Number, default: 0 },
    resolution: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
incidentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalIncident = model("RentalIncident", incidentSchema);
