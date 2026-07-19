import mongoose from "mongoose";
import { comparePasswordMethod, hashPasswordHook } from "./shared/passwordHooks.js";

const vbSessionSchema = new mongoose.Schema(
  {
    tokenId: String,
    createdAt: Date,
    lastUsedAt: Date,
    ipAddress: String,
    userAgent: String,
    deviceName: String,
    revokedAt: Date,
  },
  { _id: false }
);

const vbUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^[\w.-]+@[\w.-]+\.\w+$/, "Invalid email format"],
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 chars"],
      select: false,
    },
    sessions: [vbSessionSchema],
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    credentialsVersion: { type: Number, default: 0 },
    lastLogin: Date,
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

vbUserSchema.pre("save", hashPasswordHook);
vbUserSchema.methods.comparePassword = comparePasswordMethod;

vbUserSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.sessions;
  return obj;
};

const VbUser = mongoose.models.VbUser || mongoose.model("VbUser", vbUserSchema);
export default VbUser;
