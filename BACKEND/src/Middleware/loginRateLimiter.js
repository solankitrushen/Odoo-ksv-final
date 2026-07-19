import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Bucket by the identifier the attacker is targeting (email/phone) PLUS
  // the source IP. Stops a single IP from spraying many emails AND stops
  // a botnet from spraying a single email.
  keyGenerator: (req) => {
    const id =
      (req.body?.email && String(req.body.email).toLowerCase()) ||
      req.body?.phone ||
      "";
    return `${id}:${req.ip}`;
  },
  message: {
    success: false,
    error: "Too many login attempts",
    message: "Try again in 15 minutes",
  },
});
