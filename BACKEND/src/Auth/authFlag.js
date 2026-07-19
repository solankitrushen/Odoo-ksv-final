import crypto from "crypto";

// Short-lived, HMAC-signed marker the frontend stores in a non-HttpOnly
// cookie so its Edge middleware can verify "this browser logged in" without
// reading the cross-site HttpOnly auth cookie. The flag is NOT a credential —
// API auth still requires the HttpOnly authToken — but it must be unforgeable
// so middleware-gated routes can't be reached by a fabricated cookie value.

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function getSecret() {
  const s = process.env.AUTH_FLAG_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("AUTH_FLAG_SECRET (or JWT_SECRET) not configured");
  return s;
}

export function signAuthFlag({ sub, role, scope, ttlSec = DEFAULT_TTL_SEC }) {
  const payload = {
    sub: String(sub),
    role,
    scope: scope || null,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function authFlagTtlSec() {
  return DEFAULT_TTL_SEC;
}
