import rateLimit from "express-rate-limit";
import { AUTH_RATE_LIMIT } from "../../config/constants.js";

const isTest = process.env.NODE_ENV === "test";

export const authRateLimiter = rateLimit({
  windowMs:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || AUTH_RATE_LIMIT.windowMs,
  max: isTest
    ? 1000
    : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || AUTH_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests",
    message: "Rate limit exceeded. Try again later.",
  },
});
