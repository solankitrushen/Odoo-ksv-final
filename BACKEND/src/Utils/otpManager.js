/**
 * OTP helpers only. Email delivery: Utils/smtpMail.js (Hostinger SMTP).
 */
import crypto from "crypto";

export function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

export function otpExpiryMs() {
  return parseInt(process.env.OTP_EXPIRY_MS || "600000", 10);
}

export function lockoutMs() {
  return parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MS || "900000", 10);
}
