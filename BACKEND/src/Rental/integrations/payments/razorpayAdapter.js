// SPEC-RMS-PAY-002 §7,§11 Razorpay adapter. Real HTTPS boundary; enablement-gated.
import crypto from "crypto";
import { providerRequest, result, classifyHttpStatus } from "../http.js";
import { evaluateProviderOperation } from "../../config.js";
import { PROVIDERS } from "../../constants.js";
import { rentalError } from "../../errors.js";

const API_BASE = "https://api.razorpay.com/v1";
const API_HOST = "api.razorpay.com";

function ensureEnabled(operation, tenantId, tenantProviderEnabled) {
  const e = evaluateProviderOperation({
    provider: PROVIDERS.RAZORPAY,
    operation,
    tenantId,
    tenantProviderEnabled,
  });
  if (!e.effectiveEnabled) {
    throw rentalError("PROVIDER_NOT_CONFIGURED", `Razorpay ${operation} unavailable`, {
      reason: e.safeReasonCode,
    });
  }
}

function basicAuthHeader() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const token = Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Create a Razorpay order (paise, INR). Post-write timeout → unknown. */
export async function createOrder({ amountPaise, receipt, notes, tenantId, tenantProviderEnabled }) {
  ensureEnabled("order", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${API_BASE}/orders`,
      allowHosts: [API_HOST],
      headers: { Authorization: basicAuthHeader(), "content-type": "application/json" },
      body: { amount: amountPaise, currency: "INR", receipt, notes: notes || {} },
    });
  } catch (err) {
    // network/timeout after a create request may have been accepted.
    return result.unknown(err.code || "PROVIDER_OUTCOME_UNKNOWN", receipt);
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  if (!body?.id || body.currency !== "INR" || body.amount !== amountPaise) {
    throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Razorpay order response mismatch");
  }
  return result.success({ orderId: body.id, amount: body.amount, currency: body.currency, status: body.status });
}

/** Fetch a payment for verification. */
export async function fetchPayment({ paymentId, tenantId, tenantProviderEnabled }) {
  ensureEnabled("order", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "GET",
      url: `${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      allowHosts: [API_HOST],
      headers: { Authorization: basicAuthHeader() },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  if (!body?.id) throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Razorpay payment response mismatch");
  return result.success(body);
}

/** Refund a payment (paise). Post-write timeout → unknown. */
export async function refund({ paymentId, amountPaise, tenantId, tenantProviderEnabled }) {
  ensureEnabled("order", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${API_BASE}/payments/${encodeURIComponent(paymentId)}/refund`,
      allowHosts: [API_HOST],
      headers: { Authorization: basicAuthHeader(), "content-type": "application/json" },
      body: { amount: amountPaise },
    });
  } catch {
    return result.unknown("PROVIDER_OUTCOME_UNKNOWN", paymentId);
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  if (cls === "rejected") return result.rejected("provider_rejected", `HTTP ${res.status}`);
  const body = res.json();
  if (!body?.id) throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Razorpay refund response mismatch");
  return result.success({ refundId: body.id, status: body.status, amount: body.amount });
}

/**
 * Verify Standard Checkout signature over the SERVER-stored order id.
 * HMAC-SHA256(storedOrderId|paymentId, key_secret), timing-safe hex compare.
 */
export function verifyCheckoutSignature({ storedOrderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw rentalError("PROVIDER_NOT_CONFIGURED", "Razorpay key secret missing");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${storedOrderId}|${paymentId}`, "utf8")
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}

/** Verify webhook HMAC over exact raw bytes. Supports current + previous secret. */
export function verifyWebhookSignature(rawBodyBuffer, signature) {
  const secrets = [process.env.RAZORPAY_WEBHOOK_SECRET, process.env.RAZORPAY_WEBHOOK_SECRET_PREV].filter(Boolean);
  if (secrets.length === 0) return false;
  const buf = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer : Buffer.from(String(rawBodyBuffer), "utf8");
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(buf).digest("hex");
    return timingSafeEqualHex(expected, signature);
  });
}

function timingSafeEqualHex(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
  if (sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, "utf8"), Buffer.from(sb, "utf8"));
  } catch {
    return false;
  }
}
