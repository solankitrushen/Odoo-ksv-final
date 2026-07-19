// SPEC-RMS-DN-003 §9 Borzo Business API 1.8 adapter. Real HTTPS boundary.
import crypto from "crypto";
import { providerRequest, result, classifyHttpStatus } from "../http.js";
import { evaluateProviderOperation } from "../../config.js";
import { canonicalHash, rupeeStringToPaise } from "../../services/canonicalize.js";
import { PROVIDERS } from "../../constants.js";
import { rentalError } from "../../errors.js";

const TEST_BASE = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
const PROD_BASE = "https://robot-in.borzodelivery.com/api/business/1.8";

function baseUrl() {
  const explicit = process.env.BORZO_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? PROD_BASE : TEST_BASE;
}

function allowedHosts() {
  return [new URL(baseUrl()).host];
}

function ensureEnabled(operation, tenantId, tenantProviderEnabled) {
  const e = evaluateProviderOperation({
    provider: PROVIDERS.BORZO,
    operation,
    tenantId,
    tenantProviderEnabled,
  });
  if (!e.effectiveEnabled) {
    throw rentalError("PROVIDER_NOT_CONFIGURED", `Borzo ${operation} unavailable`, {
      reason: e.safeReasonCode,
    });
  }
}

function authHeaders() {
  return { "X-DV-Auth-Token": process.env.BORZO_AUTH_TOKEN, "content-type": "application/json" };
}

/**
 * Build the normalized create-order payload from internal data. This is the
 * single mapper shared by quote and create; its canonical hash defines the quote.
 */
export function buildCreatePayload({ points, matter = "Rental equipment", vehicleTypeId = 8, isReturnRequired = false }) {
  if (!Array.isArray(points) || points.length < 2) {
    throw rentalError("VALIDATION_ERROR", "Borzo requires at least pickup and drop-off points");
  }
  return {
    type: "standard",
    matter,
    vehicle_type_id: vehicleTypeId,
    is_return_required: isReturnRequired,
    points: points.map((p) => ({
      address: p.address,
      contact_person: { phone: p.phone, name: p.name },
      ...(p.clientOrderId ? { client_order_id: p.clientOrderId } : {}),
      ...(p.latitude ? { latitude: p.latitude } : {}),
      ...(p.longitude ? { longitude: p.longitude } : {}),
      ...(p.requiredStart ? { required_start_datetime: p.requiredStart } : {}),
      ...(p.requiredFinish ? { required_finish_datetime: p.requiredFinish } : {}),
    })),
  };
}

export function payloadHash(payload) {
  return canonicalHash(payload);
}

/** POST /calculate-order → normalized quote. */
export async function quote({ payload, tenantId, tenantProviderEnabled }) {
  ensureEnabled("quote", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${baseUrl()}/calculate-order`,
      allowHosts: allowedHosts(),
      headers: authHeaders(),
      body: { order: payload },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  if (!body?.is_successful || !body?.order) {
    throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Borzo quote response mismatch");
  }
  const amountPaise = rupeeStringToPaise(String(body.order.payment_amount));
  const warnings = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
  return result.success({ amountPaise, warnings, hash: payloadHash(payload) });
}

/** POST /create-order → normalized shipment identity. Post-write timeout → unknown. */
export async function createShipment({ payload, tenantId, tenantProviderEnabled }) {
  ensureEnabled("create", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${baseUrl()}/create-order`,
      allowHosts: allowedHosts(),
      headers: authHeaders(),
      body: { order: payload },
    });
  } catch {
    return result.unknown("PROVIDER_OUTCOME_UNKNOWN", payloadHash(payload));
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  if (!body?.is_successful || !body?.order?.order_id) {
    throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Borzo create response mismatch");
  }
  return result.success({
    providerOrderId: String(body.order.order_id),
    status: body.order.status || null,
    trackingUrl: body.order.points?.[1]?.tracking_url || null,
  });
}

export async function cancelShipment({ providerOrderId, tenantId, tenantProviderEnabled }) {
  ensureEnabled("cancel", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${baseUrl()}/cancel-order`,
      allowHosts: allowedHosts(),
      headers: authHeaders(),
      body: { order_id: Number(providerOrderId) },
    });
  } catch {
    return result.unknown("PROVIDER_OUTCOME_UNKNOWN", String(providerOrderId));
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  return result.success({ status: body?.order?.status || "canceled" });
}

export async function getShipment({ providerOrderId, tenantId, tenantProviderEnabled }) {
  ensureEnabled("reconcile", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "GET",
      url: `${baseUrl()}/orders?order_id=${encodeURIComponent(providerOrderId)}`,
      allowHosts: allowedHosts(),
      headers: authHeaders(),
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  const order = Array.isArray(body?.orders) ? body.orders[0] : body?.order;
  if (!order) throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Borzo reconcile response mismatch");
  return result.success({ status: order.status, raw: order });
}

/** Verify callback HMAC over exact raw bytes with the callback secret. */
export function verifyCallbackSignature(rawBodyBuffer, signature) {
  const secret = process.env.BORZO_CALLBACK_SECRET;
  if (!secret) return false;
  const buf = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer : Buffer.from(String(rawBodyBuffer), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(buf).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
