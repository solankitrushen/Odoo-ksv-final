// SPEC-RMS-001 §10 webhook ingress: verify signature over raw bytes BEFORE parse,
// durable dedupe by {provider,eventId}, fast 2xx, advisory MSG91 token.
import crypto from "crypto";
import { RentalWebhookEvent } from "../schema/index.js";
import { PROVIDERS } from "../constants.js";
import { verifyWebhookSignature as razorpayVerify } from "../integrations/payments/razorpayAdapter.js";
import { verifyCallbackSignature as borzoVerify } from "../integrations/delivery/borzoAdapter.js";
import { logger } from "../../Utils/logger.js";

function rawBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return Buffer.from(JSON.stringify(body ?? {}), "utf8");
}

function hashRaw(provider, buf) {
  return crypto.createHash("sha256").update(`${provider}:`).update(buf).digest("hex");
}

async function durableReceipt({ provider, eventId, eventType, buf, tenantId, aggregateId }) {
  try {
    await RentalWebhookEvent.create({
      provider,
      eventId,
      eventType: eventType || null,
      tenantId: tenantId || null,
      aggregateId: aggregateId || null,
      rawHash: hashRaw(provider, buf),
      signatureStatus: "valid",
      receivedAt: new Date(),
    });
    return { duplicate: false };
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  }
}

/** Razorpay: HMAC over raw with webhook secret; dedupe by x-razorpay-event-id. */
export async function ingestRazorpay({ rawBody, signature, eventIdHeader }) {
  const buf = rawBuffer(rawBody);
  if (!signature) return { status: 400, body: { success: false, error: "Missing signature" } };
  if (!razorpayVerify(buf, signature)) {
    logger.warn("razorpay webhook invalid signature");
    return { status: 401, body: { success: false, error: "Invalid signature" } };
  }
  let event;
  try {
    event = JSON.parse(buf.toString("utf8"));
  } catch {
    return { status: 400, body: { success: false, error: "Invalid JSON" } };
  }
  const eventId = eventIdHeader || event?.id || hashRaw(PROVIDERS.RAZORPAY, buf);
  const rec = await durableReceipt({ provider: PROVIDERS.RAZORPAY, eventId, eventType: event?.event, buf });
  if (rec.duplicate) return { status: 200, body: { success: true, duplicate: true } };
  // Async processing would happen via a worker; mark accepted.
  return { status: 200, body: { success: true, accepted: true } };
}

/** Borzo: HMAC-SHA256 over raw bytes with callback secret; deterministic dedupe. */
export async function ingestBorzo({ rawBody, signature }) {
  const buf = rawBuffer(rawBody);
  if (!signature) return { status: 400, body: { success: false, error: "Missing signature" } };
  if (!borzoVerify(buf, signature)) {
    logger.warn("borzo callback invalid signature");
    return { status: 401, body: { success: false, error: "Invalid signature" } };
  }
  let event;
  try {
    event = JSON.parse(buf.toString("utf8"));
  } catch {
    return { status: 400, body: { success: false, error: "Invalid JSON" } };
  }
  const eventId = event?.event_id || hashRaw(PROVIDERS.BORZO, buf);
  const rec = await durableReceipt({
    provider: PROVIDERS.BORZO,
    eventId,
    eventType: event?.event_type || event?.order?.status || null,
    buf,
    aggregateId: event?.order?.order_id ? String(event.order.order_id) : null,
  });
  if (rec.duplicate) return { status: 200, body: { success: true, duplicate: true } };
  return { status: 200, body: { success: true, accepted: true } };
}

/** MSG91: advisory. Opaque token compared timing-safe; never mutates business state. */
export async function ingestMsg91({ rawBody, opaqueToken }) {
  const configured = process.env.MSG91_CALLBACK_TOKEN;
  if (!configured) return { status: 401, body: { success: false, error: "Callback not configured" } };
  const a = Buffer.from(String(opaqueToken || ""), "utf8");
  const b = Buffer.from(String(configured), "utf8");
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return { status: 401, body: { success: false, error: "Invalid token" } };
  const buf = rawBuffer(rawBody);
  let event;
  try {
    event = JSON.parse(buf.toString("utf8"));
  } catch {
    return { status: 400, body: { success: false, error: "Invalid JSON" } };
  }
  const eventId = event?.requestId || event?.request_id || hashRaw(PROVIDERS.MSG91, buf);
  const rec = await durableReceipt({ provider: PROVIDERS.MSG91, eventId, eventType: "message_status", buf });
  if (rec.duplicate) return { status: 200, body: { success: true, duplicate: true } };
  return { status: 200, body: { success: true, accepted: true } };
}
