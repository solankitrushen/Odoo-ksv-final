import mongoose from "mongoose";
import { VB_ROLE_VALUES } from "../../config/constants.js";

const vbMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VbUser",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    roles: {
      type: [{ type: String, enum: VB_ROLE_VALUES }],
      validate: [(arr) => arr.length > 0, "At least one role required"],
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

vbMembershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
vbMembershipSchema.index({ tenantId: 1, roles: 1 });

const VbMembership =
  mongoose.models.VbMembership ||
  mongoose.model("VbMembership", vbMembershipSchema);
export default VbMembership;
