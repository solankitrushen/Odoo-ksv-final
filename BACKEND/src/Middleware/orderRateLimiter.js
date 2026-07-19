import rateLimit from "express-rate-limit";
import { ORDER_RATE_LIMIT } from "../../config/constants.js";

export const createOrderLimiter = rateLimit({
  windowMs: ORDER_RATE_LIMIT.windowMs,
  max: ORDER_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (req) => req.userId || req.ip,
  message: {
    success: false,
    error: "Too many requests",
    message: "Order limit exceeded. Try again in a minute.",
  },
});
