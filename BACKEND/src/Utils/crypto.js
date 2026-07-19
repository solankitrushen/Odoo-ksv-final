import crypto from "crypto";

/** Constant-time string compare — mitigates timing leaks on OTP/password checks */
export function constantTimeCompare(a, b) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  if (sa.length !== sb.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(sa), Buffer.from(sb));
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
