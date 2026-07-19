import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid tenantId");

export const registerTenantSchema = z.object({
  tenant: z.object({
    name: z.string().min(2).max(150).trim(),
    slug: z
      .string()
      .min(2)
      .max(60)
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits, hyphens"),
    contactEmail: z.string().email().max(160).toLowerCase().optional(),
  }),
  admin: z.object({
    name: z.string().min(2).max(120).trim(),
    email: z.string().email().max(160).toLowerCase(),
    password: z.string().min(8).max(128),
  }),
});

export const vbLoginSchema = z.object({
  email: z.string().email().max(160).toLowerCase(),
  password: z.string().min(1, "Password required"),
  tenantId: objectId.optional(),
});

export const vbOtpRequestSchema = z.object({
  email: z.string().email().max(160).toLowerCase(),
});

export const vbOtpVerifySchema = z.object({
  email: z.string().email().max(160).toLowerCase(),
  otp: z.string().min(4).max(8),
  tenantId: objectId.optional(),
});

export const switchTenantSchema = z.object({
  tenantId: objectId,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
});
