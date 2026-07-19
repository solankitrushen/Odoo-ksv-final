import "./src/Utils/nodeCompat.js";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

import { connectToMongo, disconnectDB } from "./db.js";
import apiRoutes from "./src/Routes/index.js";
import { rentalWebhookRoutes } from "./src/Rental/index.js";
import { startOverdueSweepJob } from "./src/Rental/services/overdueSweep.js";
import { errorHandler } from "./src/Middleware/errorHandler.js";
import { requestLogger } from "./src/Middleware/requestLogger.js";
import { assertJwtConfig } from "./config/jwt.js";
import { loadEnv } from "./config/env.js";

const ENV = loadEnv();

const app = express();

connectToMongo();

app.use(cookieParser());

const port = ENV.PORT || process.env.PORT || 4469;
const isProd = ENV.NODE_ENV === "production";
const isTest = ENV.NODE_ENV === "test";

if (isProd) app.set("trust proxy", 1);

app.use(
  compression({
    filter: (req, res) => {
      const type = res.getHeader("Content-Type");
      if (type && String(type).includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            "img-src": ["'self'", "data:", "https:"],
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "connect-src": ["'self'"],
          },
        }
      : false,
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  })
);

// Raw-body webhooks before JSON parser
app.use("/api/v1/webhook", rentalWebhookRoutes);
app.use("/api/v1/rental/webhook", rentalWebhookRoutes);

app.use(express.json({ limit: ENV.BODY_LIMIT || "100kb" }));
app.use(requestLogger);

const corsOrigins = [
  ...new Set(
    [
      process.env.CLIENT_URL_1,
      process.env.CLIENT_URL_2,
      process.env.CLIENT_URL_3,
      process.env.CLIENT_URL_4,
      process.env.CLIENT_URL_DEV,
      process.env.CLIENT_URL_PROD,
    ]
      .flatMap((v) => (v ? v.split(",") : []))
      .map((v) => v.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  ),
];

if (isProd && corsOrigins.length === 0) {
  throw new Error("[env] At least one CLIENT_URL_* must be set in production for CORS.");
}

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" });
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX, 10) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});
app.use("/api/v1", globalLimiter);

try {
  assertJwtConfig();
  const api = express.Router();
  api.use(apiRoutes);
  api.use(errorHandler);
  app.use("/api/v1", api);
  console.log("✓ Rental Portal API mounted at /api/v1");
} catch (err) {
  console.warn("API not mounted:", err.message);
}

app.get("/", (_req, res) => {
  res.json({ message: "Rental Portal API", docs: "/api/v1/rental" });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

const server = app.listen(port, () => {
  console.log(`Rental Portal listening on http://localhost:${port}`);
  startOverdueSweepJob();
});
// Cloudinary inspection / product uploads can exceed Node's default request idle timeout.
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 120_000;
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 125_000;

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(async () => {
    try {
      await disconnectDB();
    } catch (err) {
      console.warn("DB disconnect error:", err.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
["SIGTERM", "SIGINT"].forEach((sig) => process.on(sig, () => shutdown(sig)));
