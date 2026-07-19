// Request-context helpers: tenant/actor, idempotency key, and If-Match version.
import { rentalError } from "../errors.js";

export function buildCtx(req) {
  return {
    tenantId: String(req.tenantId),
    actor: req.rentalActor || { type: "system", id: null, tenantId: String(req.tenantId) },
    requestId: req.headers["x-request-id"] || null,
  };
}

export function requireIdempotencyKey(req) {
  const key = req.get("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 200) {
    throw rentalError("VALIDATION_ERROR", "Idempotency-Key header (8-200 chars) required");
  }
  return key;
}

export function optionalIdempotencyKey(req) {
  const key = req.get("Idempotency-Key");
  if (key && (key.length < 8 || key.length > 200)) {
    throw rentalError("VALIDATION_ERROR", "Idempotency-Key must be 8-200 chars");
  }
  return key || null;
}

/** Read required optimistic version from If-Match header or body.version. */
export function requireVersion(req) {
  const raw = req.get("If-Match");
  if (raw) {
    const m = /^"?(\d+)"?$/.exec(raw.trim());
    if (m) return Number(m[1]);
  }
  if (Number.isInteger(req.body?.version)) return req.body.version;
  throw rentalError("VALIDATION_ERROR", "If-Match version header or body.version required");
}
