// Provider HTTP boundary. Real fetch with connect/total timeout, size cap, host
// allowlist, and no redirect following. Injectable for mocked-boundary tests.
import { rentalTimeouts } from "../config.js";
import { rentalError } from "../errors.js";

const MAX_RESPONSE_BYTES = 512 * 1024;

let _client = defaultClient;

/** Override the transport in tests to assert exact method/url/headers/body. */
export function setHttpClient(fn) {
  _client = fn || defaultClient;
}
export function resetHttpClient() {
  _client = defaultClient;
}

/**
 * @returns {Promise<{status:number, headers:object, text:string, json:function}>}
 * Throws a normalized RentalError on timeout/network (retryable / unknown).
 */
export async function providerRequest({ method, url, headers = {}, body = null, allowHosts }) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !isLocalTest(parsed)) {
    throw rentalError("PROVIDER_REJECTED", "Provider URL must be https");
  }
  if (allowHosts && !allowHosts.includes(parsed.host)) {
    throw rentalError("PROVIDER_REJECTED", `Provider host not allowlisted: ${parsed.host}`);
  }
  return _client({ method, url, headers, body });
}

function isLocalTest(u) {
  return process.env.NODE_ENV === "test" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
}

async function defaultClient({ method, url, headers, body }) {
  const { totalMs } = rentalTimeouts();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), totalMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // Abort/network before a known write → treat as retryable; callers that
    // performed a write map this to `unknown` for reconciliation.
    throw rentalError("PROVIDER_UNAVAILABLE", `Provider request failed: ${err.name}`);
  }
  clearTimeout(timer);
  if (res.status >= 300 && res.status < 400) {
    throw rentalError("PROVIDER_REJECTED", "Provider redirect rejected");
  }
  const text = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers?.entries?.() || []),
    text,
    json() {
      try {
        return JSON.parse(text);
      } catch {
        throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Provider returned non-JSON");
      }
    },
  };
}

/** Normalized provider result constructors. */
export const result = {
  success: (data, extra = {}) => ({ kind: "success", data, ...extra }),
  rejected: (code, safeMessage) => ({ kind: "rejected", code, safeMessage, retryable: false }),
  retryable: (code, retryAfterMs) => ({ kind: "retryable", code, retryAfterMs }),
  unknown: (code, correlationId) => ({ kind: "unknown", code, correlationId }),
};

/** Classify HTTP status into retryable vs rejected for read/idempotent ops. */
export function classifyHttpStatus(status) {
  if (status === 429 || status >= 500) return "retryable";
  if (status >= 400) return "rejected";
  return "ok";
}
