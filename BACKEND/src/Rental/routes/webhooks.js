import express, { Router } from "express";
import { asyncHandler } from "../../Utils/asyncHandler.js";
import * as webhooks from "../services/webhookService.js";

// Raw-body webhook routers. MUST be mounted before express.json in index.js.
const router = Router();
const raw = express.raw({ type: "*/*", limit: "1mb" });

router.post(
  "/razorpay",
  raw,
  asyncHandler(async (req, res) => {
    const out = await webhooks.ingestRazorpay({
      rawBody: req.body,
      signature: req.get("X-Razorpay-Signature"),
      eventIdHeader: req.get("x-razorpay-event-id"),
    });
    res.status(out.status).json(out.body);
  })
);

router.post(
  "/borzo",
  raw,
  asyncHandler(async (req, res) => {
    const out = await webhooks.ingestBorzo({
      rawBody: req.body,
      signature: req.get("X-DV-Signature"),
    });
    res.status(out.status).json(out.body);
  })
);

router.post(
  "/msg91/:opaqueToken",
  raw,
  asyncHandler(async (req, res) => {
    const out = await webhooks.ingestMsg91({
      rawBody: req.body,
      opaqueToken: req.params.opaqueToken,
    });
    res.status(out.status).json(out.body);
  })
);

export default router;
