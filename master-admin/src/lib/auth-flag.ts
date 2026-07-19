// Edge-runtime HMAC-SHA256 verifier for the signed `authPresent` cookie.
// The cookie value is `base64url(payload).base64url(sig)` where the payload
// is JSON of shape { sub, role, scope, exp }. We never trust the payload —
// we recompute the HMAC over the raw base64url payload and compare in
// constant time, then check exp. Without the shared secret no one can mint
// or extend a flag, so middleware-gated routes can't be reached by setting
// `authPresent=1` in DevTools.

export const AUTH_FLAG_COOKIE = "authPresent";

function b64urlDecode(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export async function verifyAuthFlag(
  token: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  let providedSig: Uint8Array;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return false;
  }

  let expectedSigBytes: Uint8Array;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payloadB64)
    );
    expectedSigBytes = new Uint8Array(sig);
  } catch {
    return false;
  }

  if (!timingSafeEqual(expectedSigBytes, providedSig)) return false;

  let payload: { exp?: number };
  try {
    const json = new TextDecoder().decode(b64urlDecode(payloadB64));
    payload = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof payload.exp !== "number") return false;
  if (payload.exp * 1000 <= Date.now()) return false;
  return true;
}

// Re-encode for tests / future use; kept exported so callers don't reinvent.
export const _b64url = { encode: b64urlEncode, decode: b64urlDecode };
