// Rental idempotency, audit, numbering, and canonical fingerprint helpers.
import crypto from "crypto";
import { RentalIdempotency, RentalAuditEvent, RentalSeqCounter } from "../schema/index.js";
import { idempotencyTtlSeconds } from "../config.js";
import { rentalError } from "../errors.js";

/** Canonical fingerprint preserving explicit zero/null/false distinctions. */
export function fingerprint(body) {
  return crypto.createHash("sha256").update(JSON.stringify(sortKeys(body ?? {}))).digest("hex");
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Idempotency lookup. Returns replay|mismatch|miss. Called before CAS so a
 * winning replay returns its stored response even if the aggregate advanced.
 */
export async function lookupIdempotency({ tenantId, actorType, actorId, scope, key, body }) {
  if (!key) return { status: "miss" };
  const fp = fingerprint(body);
  const existing = await RentalIdempotency.findOne({
    tenantId,
    actorType,
    actorId: actorId || "system",
    scope,
    key,
  }).lean();
  if (!existing) return { status: "miss" };
  if (existing.fingerprint !== fp) return { status: "mismatch" };
  return { status: "replay", record: existing };
}

export async function storeIdempotency(
  { tenantId, actorType, actorId, scope, key, body, statusCode, response },
  session = null
) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + idempotencyTtlSeconds() * 1000);
  const doc = {
    tenantId,
    actorType,
    actorId: actorId || "system",
    scope,
    key,
    fingerprint: fingerprint(body),
    statusCode,
    response,
    expiresAt,
  };
  try {
    await RentalIdempotency.create(session ? [doc] : doc, session ? { session } : undefined);
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

/** Throw IDEMPOTENCY_CONFLICT on fingerprint mismatch; return replay record or null. */
export async function guardIdempotency(ctx) {
  const res = await lookupIdempotency(ctx);
  if (res.status === "mismatch") {
    throw rentalError("IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different request");
  }
  return res.status === "replay" ? res.record : null;
}

export async function writeAudit(event, session = null) {
  const docs = [
    {
      createdAt: new Date(),
      ...event,
    },
  ];
  await RentalAuditEvent.create(docs, session ? { session } : undefined);
}

/** Atomic per-tenant sequence for numbering (rentals, invoices, customers). */
export async function nextSequence(tenantId, namespace, session = null) {
  const doc = await RentalSeqCounter.findOneAndUpdate(
    { tenantId, namespace },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, ...(session ? { session } : {}) }
  );
  return doc.seq;
}

export function formatNumber(prefix, namespace, seq) {
  const tag = namespace.slice(0, 3).toUpperCase();
  return `${prefix}-${tag}-${String(seq).padStart(6, "0")}`;
}
