import mongoSanitize from "express-mongo-sanitize";
import xss from "xss";
import { logger } from "../Utils/logger.js";

export const mongoSanitizeMiddleware = mongoSanitize({
  onSanitize: ({ key }) => {
    logger.warn("MongoDB injection key sanitized", { key });
  },
});

function sanitizeValue(value) {
  if (typeof value === "string") {
    return xss(value, { whiteList: {}, stripIgnoredTag: true });
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

export function xssProtection(req, res, next) {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
}

// Mongo-operator keys never appear at the top of a JSON body the client
// should send. Reject them up-front so an attacker cannot smuggle
// `{ "$where": "..." }` through a Zod-loose schema.
const FORBIDDEN_KEYS = new Set([
  "$where",
  "$function",
  "mapReduce",
  "__proto__",
  "constructor",
  "prototype",
]);

function checkKeys(obj, ctx) {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { ctx, key };
    }
    if (value && typeof value === "object") {
      const inner = checkKeys(value, `${ctx}.${key}`);
      if (inner) return inner;
    }
  }
  return null;
}

export function parameterTypeValidator(req, res, next) {
  const hit =
    checkKeys(req.body, "body") ||
    checkKeys(req.query, "query") ||
    checkKeys(req.params, "params");

  if (hit) {
    logger.warn("Forbidden key blocked", hit);
    return res.status(400).json({
      success: false,
      error: "Invalid request parameters",
    });
  }
  next();
}

export function sensitiveRouteLogger(req, res, next) {
  if (req.path.includes("/auth") || req.path.includes("/admin")) {
    logger.info("Sensitive route access", {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
  }
  next();
}
