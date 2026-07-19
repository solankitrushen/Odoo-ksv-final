import fs from "fs";
import path from "path";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "@jest/globals";
import { setHttpClient, resetHttpClient } from "../../../src/Rental/integrations/http.js";
import * as msg91 from "../../../src/Rental/integrations/messaging/msg91Adapter.js";
import * as borzo from "../../../src/Rental/integrations/delivery/borzoAdapter.js";
import * as razorpay from "../../../src/Rental/integrations/payments/razorpayAdapter.js";

const FIX = path.resolve(process.cwd(), "../docs/provider-contracts");
function readFix(rel) {
  return fs.readFileSync(path.join(FIX, rel));
}
function mock(response) {
  setHttpClient(async ({ url, method, headers, body }) => {
    lastRequest = { url, method, headers, body };
    return {
      status: response.status ?? 200,
      headers: {},
      text: JSON.stringify(response.json),
      json: () => response.json,
    };
  });
}
let lastRequest = null;

describe("Provider adapters — mocked HTTP boundary + fixtures", () => {
  const saved = {};
  beforeAll(() => {
    Object.assign(saved, { ...process.env });
    process.env.RENTAL_MODULE_ENABLED = "true";
    process.env.RENTAL_PROVIDER_ROLLOUT_MODE = "all";
    process.env.MSG91_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "test_key";
    process.env.MSG91_OTP_TEMPLATE_ID = "tmpl_otp";
    process.env.MSG91_SMS_FLOW_TEMPLATE_ID = "tmpl_sms";
    process.env.BORZO_ENABLED = "true";
    process.env.BORZO_BASE_URL = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
    process.env.BORZO_AUTH_TOKEN = "test_token";
    process.env.RAZORPAY_ENABLED = "true";
    process.env.RAZORPAY_KEY_ID = "rzp_test_contract_key";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret_not_for_production_2026";
  });
  afterAll(() => {
    for (const k of ["RENTAL_MODULE_ENABLED", "RENTAL_PROVIDER_ROLLOUT_MODE", "MSG91_ENABLED", "MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID", "MSG91_SMS_FLOW_TEMPLATE_ID", "BORZO_ENABLED", "BORZO_BASE_URL", "BORZO_AUTH_TOKEN", "RAZORPAY_ENABLED", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  afterEach(() => resetHttpClient());

  it("MSG91 OTP send: strict success shape", async () => {
    mock({ json: JSON.parse(readFix("msg91/otp-send.success.json")) });
    const res = await msg91.sendOtp({ mobile: "919000000000", tenantId: "t1" });
    expect(res.kind).toBe("success");
    expect(lastRequest.url).toContain("https://control.msg91.com/api/v5/otp");
    expect(lastRequest.method).toBe("POST");
  });

  it("MSG91 OTP verify: exact success message verifies; other shape rejected", async () => {
    mock({ json: JSON.parse(readFix("msg91/otp-verify.success.json")) });
    const ok = await msg91.verifyOtp({ mobile: "919000000000", otp: "1234", tenantId: "t1" });
    expect(ok.kind).toBe("success");
    mock({ json: JSON.parse(readFix("msg91/otp-verify.invalid.json")) });
    const bad = await msg91.verifyOtp({ mobile: "919000000000", otp: "0000", tenantId: "t1" });
    expect(bad.kind).toBe("rejected");
  });

  it("MSG91 SMS: contract mismatch on altered success shape throws", async () => {
    mock({ json: { type: "success" } }); // missing message
    await expect(msg91.sendSms({ mobiles: "919000000000", tenantId: "t1" })).rejects.toMatchObject({ code: "PROVIDER_CONTRACT_MISMATCH" });
  });

  it("Borzo quote: parses two-decimal rupee payment_amount to paise", async () => {
    mock({ json: JSON.parse(readFix("borzo-1.8/calculate-order.success.json")) });
    const payload = borzo.buildCreatePayload({
      points: [
        { address: "WH", phone: "910000000000", name: "Dispatch" },
        { address: "Cust", phone: "910000000001", name: "Recipient", clientOrderId: "rntout0001" },
      ],
    });
    const res = await borzo.quote({ payload, tenantId: "t1" });
    expect(res.kind).toBe("success");
    expect(res.data.amountPaise).toBe(23450); // "234.50" → 23450
    expect(lastRequest.url).toContain("/calculate-order");
  });

  it("Razorpay createOrder: success returns provider order id", async () => {
    mock({ json: JSON.parse(readFix("razorpay/order-create.success.json")) });
    const res = await razorpay.createOrder({ amountPaise: 16800, receipt: "rnt_20260718_0001", tenantId: "t1" });
    expect(res.kind).toBe("success");
    expect(res.data.orderId).toBe("order_test_contract_001");
    expect(lastRequest.headers.Authorization).toMatch(/^Basic /);
  });

  it("Razorpay checkout signature vector verifies (and rejects tampered)", () => {
    const ctx = JSON.parse(readFix("razorpay/checkout-signature.context.json"));
    process.env.RAZORPAY_KEY_SECRET = ctx.testSecret;
    const ok = razorpay.verifyCheckoutSignature({
      storedOrderId: ctx.serverStoredOrderId,
      paymentId: ctx.paymentId,
      signature: ctx.expectedSignature,
    });
    expect(ok).toBe(true);
    const bad = razorpay.verifyCheckoutSignature({
      storedOrderId: ctx.serverStoredOrderId,
      paymentId: ctx.paymentId,
      signature: "0".repeat(ctx.expectedSignature.length),
    });
    expect(bad).toBe(false);
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret_not_for_production_2026";
  });

  it("Razorpay webhook signature vector verifies over exact raw bytes", () => {
    const vectors = JSON.parse(readFix("razorpay/signature-vectors.json"));
    process.env.RAZORPAY_WEBHOOK_SECRET = vectors.testSecret;
    const v = vectors.vectors.find((x) => x.path === "webhook-payment.captured.json");
    const raw = readFix(`razorpay/${v.path}`);
    expect(razorpay.verifyWebhookSignature(raw, v.expectedSignature)).toBe(true);
    expect(razorpay.verifyWebhookSignature(raw, "deadbeef")).toBe(false);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("Borzo callback signature vector verifies over exact raw bytes", () => {
    const vectors = JSON.parse(readFix("borzo-1.8/callback-signature-vectors.json"));
    process.env.BORZO_CALLBACK_SECRET = vectors.testSecret;
    const v = vectors.vectors.find((x) => x.path === "callback-order.json");
    const raw = readFix(`borzo-1.8/${v.path}`);
    expect(borzo.verifyCallbackSignature(raw, v.expectedSignature)).toBe(true);
    expect(borzo.verifyCallbackSignature(raw, "00")).toBe(false);
    delete process.env.BORZO_CALLBACK_SECRET;
  });
});
