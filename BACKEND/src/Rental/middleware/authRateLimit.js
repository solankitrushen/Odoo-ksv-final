// SPEC-RMS-AUTH-001 rate limits for public rental auth endpoints.
import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

/** Login / register / verify — per email+IP. */
export const rentalAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const id = (req.body?.email && String(req.body.email).toLowerCase()) || "";
    return `rental-auth:${id}:${req.ip}`;
  },
  message: {
    success: false,
    error: "RATE_LIMITED",
    message: "Too many auth attempts. Try again later.",
  },
});

/** Resend verification + OTP request — tighter bucket. */
export const rentalAuthSendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const id = (req.body?.email && String(req.body.email).toLowerCase()) || "";
    return `rental-auth-send:${id}:${req.ip}`;
  },
  message: {
    success: false,
    error: "RATE_LIMITED",
    message: "Too many email requests. Try again later.",
  },
});
