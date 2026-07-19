import { randomUUID } from "crypto";
import { logger } from "../Utils/logger.js";

const SKIP_PATHS = new Set(["/health", "/favicon.ico"]);
const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "otp",
  "token",
  "refreshToken",
  "accessToken",
  "bankAccountNumber",
  "pan",
  "gst",
  "cardNumber",
  "cvv",
]);
const MAX_BODY_LOG_CHARS = 500;

function redact(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_BODY_KEYS.has(k)) out[k] = "[redacted]";
    else out[k] = redact(v);
  }
  return out;
}

function summarizeBody(body) {
  if (!body || typeof body !== "object") return undefined;
  const keys = Object.keys(body);
  if (keys.length === 0) return undefined;
  const redacted = redact(body);
  let json;
  try {
    json = JSON.stringify(redacted);
  } catch {
    return { keys };
  }
  if (json.length > MAX_BODY_LOG_CHARS) {
    return { keys, truncated: true, preview: json.slice(0, MAX_BODY_LOG_CHARS) };
  }
  return redacted;
}

function pickLevel(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export function requestLogger(req, res, next) {
  if (SKIP_PATHS.has(req.path)) return next();

  const start = process.hrtime.bigint();
  const reqId =
    req.headers["x-request-id"] || randomUUID().split("-")[0];
  req.requestId = reqId;
  res.setHeader("x-request-id", reqId);

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress;

  logger.info("→ req", {
    reqId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip,
    ua: req.headers["user-agent"],
    ...(req.method !== "GET" && req.method !== "HEAD"
      ? { body: summarizeBody(req.body) }
      : {}),
    ...(req.query && Object.keys(req.query).length ? { query: req.query } : {}),
  });

  res.on("finish", () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = pickLevel(res.statusCode);
    logger[level]("← res", {
      reqId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durMs: Number(durMs.toFixed(1)),
      bytes: Number(res.getHeader("content-length")) || undefined,
      userId: req.userId || undefined,
      role: req.role || undefined,
      slow: durMs > 1000 || undefined,
    });
  });

  res.on("close", () => {
    if (res.writableEnded) return;
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.warn("⚠ req aborted", {
      reqId,
      method: req.method,
      path: req.originalUrl || req.url,
      durMs: Number(durMs.toFixed(1)),
    });
  });

  next();
}

export default requestLogger;
