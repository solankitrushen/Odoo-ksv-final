// SPEC-RMS-DN-003 canonical payload hashing + strict rupee→paise parser. Pure.
import crypto from "crypto";
import { rentalError } from "../errors.js";

/**
 * Canonicalize a JSON-compatible value exactly per spec:
 *  - recursively omit undefined object members and array elements
 *  - sort object keys ascending by Unicode code point at every depth
 *  - preserve remaining array order
 *  - no Unicode normalization
 *  - reject NaN, Infinity, BigInt, functions, symbols, cycles, sparse holes,
 *    and non-plain objects.
 * Returns the compact JSON string (Node JSON.stringify semantics).
 */
export function canonicalJson(value) {
  const seen = new WeakSet();
  const cleaned = clean(value, seen);
  if (cleaned === undefined) {
    throw rentalError("VALIDATION_ERROR", "Canonical root value is empty");
  }
  return JSON.stringify(cleaned);
}

function clean(value, seen) {
  if (value === null) return null;
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw rentalError("VALIDATION_ERROR", "Non-finite number rejected in canonical payload");
    }
    return value;
  }
  if (t === "string" || t === "boolean") return value;
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") {
    return undefined; // undefined omitted; others invalid unless omitted at member level
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw rentalError("VALIDATION_ERROR", "Cycle in canonical payload");
    seen.add(value);
    const out = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) {
        throw rentalError("VALIDATION_ERROR", "Sparse array hole rejected in canonical payload");
      }
      const c = clean(value[i], seen);
      if (c !== undefined) out.push(c);
    }
    seen.delete(value);
    return out;
  }
  if (t === "object") {
    if (seen.has(value)) throw rentalError("VALIDATION_ERROR", "Cycle in canonical payload");
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw rentalError("VALIDATION_ERROR", "Non-plain object rejected in canonical payload");
    }
    seen.add(value);
    const keys = Object.keys(value).sort(codePointCompare);
    const out = {};
    for (const k of keys) {
      const raw = value[k];
      if (typeof raw === "bigint" || typeof raw === "function" || typeof raw === "symbol") {
        throw rentalError("VALIDATION_ERROR", `Invalid value type at key ${k}`);
      }
      const c = clean(raw, seen);
      if (c !== undefined) out[k] = c;
    }
    seen.delete(value);
    return out;
  }
  throw rentalError("VALIDATION_ERROR", "Unsupported value in canonical payload");
}

function codePointCompare(a, b) {
  // Compare by Unicode code point. Default JS string compare is by UTF-16 code
  // unit; for BMP keys these agree. Iterate code points for correctness.
  const ai = Array.from(a);
  const bi = Array.from(b);
  const len = Math.min(ai.length, bi.length);
  for (let i = 0; i < len; i++) {
    const d = ai[i].codePointAt(0) - bi[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return ai.length - bi.length;
}

/** lowercase hex SHA-256 of the UTF-8 bytes of the canonical JSON. */
export function canonicalHash(value) {
  const json = canonicalJson(value);
  return crypto.createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex");
}

/**
 * Strict two-decimal rupee string → integer paise. Never parseFloat.
 * Accepts optional thousands-free decimal like "120.00", "0", "0.01", "30000".
 * Rejects exponent, sign, >2 decimals, whitespace, non-digits, empty.
 */
export function rupeeStringToPaise(input) {
  if (typeof input !== "string") {
    throw rentalError("PROVIDER_CONTRACT_MISMATCH", "Amount must be a string");
  }
  const s = input;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw rentalError("PROVIDER_CONTRACT_MISMATCH", `Invalid rupee amount: ${s}`);
  }
  const [whole, frac = ""] = s.split(".");
  const paiseFrac = (frac + "00").slice(0, 2);
  const rupees = BigInt(whole);
  const paise = rupees * 100n + BigInt(paiseFrac);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw rentalError("PRICING_RANGE_EXCEEDED", "Rupee amount exceeds safe range");
  }
  return Number(paise);
}
