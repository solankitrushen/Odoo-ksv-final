import mongoose from "mongoose";
import { TENANT_STATUS } from "../../config/constants.js";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tenant name is required"],
      trim: true,
      maxlength: [150, "Name too long"],
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^[a-z0-9-]{2,60}$/, "Slug must be 2-60 lowercase letters, digits, hyphens"],
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^[\w.-]+@[\w.-]+\.\w+$/, "Invalid email format"],
    },
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.ACTIVE,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "VbUser", default: null },
  },
  { timestamps: true }
);

const Tenant = mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);
export default Tenant;
