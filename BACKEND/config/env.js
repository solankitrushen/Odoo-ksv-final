import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().optional(),
  MONGO_URL: z.string().min(1, "MONGO_URL required").optional(),
  MONGODB_URI: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET min 16 chars in dev / 32 in prod"),
  LEGACY_JWT_SECRET: z.string().min(16).optional(),
  LEGACY_JWT_EXPIRE: z.string().default("12h"),
  LEGACY_IMS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  LEGACY_PASSWORD_REHASH: z
    .enum(["true", "false"])
    .default("true"),
  ORDER_AUTO_PAYMENT_SUCCESS: z.enum(["true", "false"]).default("false"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  DELIVERY_OTP_DELIVERY_CHANNEL: z
    .enum(["email", "sms", "console"])
    .default("console"),
  DEBUG_ERROR_STACK: z.enum(["true", "false"]).default("false"),
  BODY_LIMIT: z.string().default("100kb"),
});

function fail(msg) {
  throw new Error(`[env] ${msg}`);
}

export function loadEnv() {
  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    fail(`environment validation failed:\n${details}`);
  }
  const env = parsed.data;

  if (!env.MONGO_URL && !env.MONGODB_URI) {
    fail("MONGO_URL or MONGODB_URI must be set");
  }

  const isProd = env.NODE_ENV === "production";

  if (isProd) {
    if (env.JWT_SECRET.length < 32) {
      fail("JWT_SECRET must be at least 32 characters in production");
    }
    if (env.ORDER_AUTO_PAYMENT_SUCCESS === "true") {
      fail(
        "ORDER_AUTO_PAYMENT_SUCCESS=true is forbidden in production " +
          "(bypasses Razorpay verification — would let any client mark " +
          "orders as paid)."
      );
    }
    const prodRequired = [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET",
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
      "LEGACY_JWT_SECRET",
    ];
    const missing = prodRequired.filter((k) => !env[k]);
    if (missing.length) {
      fail(`missing required production env: ${missing.join(", ")}`);
    }
    if (env.LEGACY_JWT_SECRET && env.LEGACY_JWT_SECRET === env.JWT_SECRET) {
      fail("LEGACY_JWT_SECRET must differ from JWT_SECRET");
    }
  }

  return env;
}

export function isLegacyEnabled() {
  return process.env.LEGACY_IMS_ENABLED !== "false";
}

export function legacyJwtSecret() {
  return process.env.LEGACY_JWT_SECRET || process.env.JWT_SECRET;
}

export function legacyJwtExpire() {
  return process.env.LEGACY_JWT_EXPIRE || "12h";
}

export function isOrderAutoPaymentSuccess() {
  return process.env.ORDER_AUTO_PAYMENT_SUCCESS === "true";
}
