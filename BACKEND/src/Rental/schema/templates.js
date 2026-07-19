// SPEC-005/010 quotation templates + document layout (header/footer).
import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });

const quotationTemplateSchema = new Schema(
  {
    tenantId: { ...oid("Tenant"), required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    headerText: { type: String, default: "" },
    footerText: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);
quotationTemplateSchema.index({ tenantId: 1, code: 1 }, { unique: true });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const RentalQuotationTemplate = model("RentalQuotationTemplate", quotationTemplateSchema);
