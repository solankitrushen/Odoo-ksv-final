import crypto from "crypto";

export function generateDeliveryOtp(length = 6) {
  const max = 10 ** length;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(length, "0");
}

export function hashDeliveryOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

export function verifyDeliveryOtp(otp, hash) {
  if (!otp || !hash) return false;
  const a = hashDeliveryOtp(otp);
  if (a.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(hash));
}
