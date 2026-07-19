import crypto from "crypto";
import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp } from "../helpers/rentalApp.js";

const hmac = (secret, body) => crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");

describe("Rental provider webhooks (raw body, signature-before-parse, dedupe)", () => {
  let app;
  const saved = {};
  beforeAll(async () => {
    app = await getRentalApp();
    saved.rz = process.env.RAZORPAY_WEBHOOK_SECRET;
    saved.bz = process.env.BORZO_CALLBACK_SECRET;
    saved.msg = process.env.MSG91_CALLBACK_TOKEN;
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
    process.env.BORZO_CALLBACK_SECRET = "test_borzo_secret";
    process.env.MSG91_CALLBACK_TOKEN = "test_msg91_token_high_entropy";
  });
  afterAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = saved.rz;
    process.env.BORZO_CALLBACK_SECRET = saved.bz;
    process.env.MSG91_CALLBACK_TOKEN = saved.msg;
  });

  it("razorpay: valid signature accepted, duplicate deduped, bad signature 401", async () => {
    const body = JSON.stringify({ id: `evt_${Date.now()}`, event: "payment.captured" });
    const sig = hmac("test_webhook_secret", body);
    const eventId = `rz_${Date.now()}`;

    const ok = await request(app)
      .post("/api/v1/rental/webhook/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sig)
      .set("x-razorpay-event-id", eventId)
      .send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.accepted).toBe(true);

    const dup = await request(app)
      .post("/api/v1/rental/webhook/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sig)
      .set("x-razorpay-event-id", eventId)
      .send(body);
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);

    const bad = await request(app)
      .post("/api/v1/rental/webhook/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", "deadbeef")
      .send(body);
    expect(bad.status).toBe(401);
  });

  it("borzo: valid HMAC accepted, bad signature 401", async () => {
    const body = JSON.stringify({ event_id: `bz_${Date.now()}`, order: { order_id: 555, status: "parcel_picked_up" } });
    const sig = hmac("test_borzo_secret", body);
    const ok = await request(app)
      .post("/api/v1/rental/webhook/borzo")
      .set("Content-Type", "application/json")
      .set("X-DV-Signature", sig)
      .send(body);
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post("/api/v1/rental/webhook/borzo")
      .set("Content-Type", "application/json")
      .set("X-DV-Signature", "00")
      .send(body);
    expect(bad.status).toBe(401);
  });

  it("msg91: correct opaque token accepted, wrong token 401", async () => {
    const body = JSON.stringify({ request_id: `wa_${Date.now()}`, status: "delivered" });
    const ok = await request(app)
      .post("/api/v1/rental/webhook/msg91/test_msg91_token_high_entropy")
      .set("Content-Type", "application/json")
      .send(body);
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post("/api/v1/rental/webhook/msg91/wrong_token")
      .set("Content-Type", "application/json")
      .send(body);
    expect(bad.status).toBe(401);
  });
});
