import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  getRentalApp,
  registerTenant,
  seedCatalog,
  bearer,
  idem,
  ifMatch,
  uniqueSlug,
  FAKE_INSPECT_PHOTOS,
} from "../helpers/rentalApp.js";
import { computeLine } from "../../../src/Rental/services/pricing.js";
import { deriveDepositStatus } from "../../../src/Rental/services/depositLedger.js";
import { sweepOverdueForTenant } from "../../../src/Rental/services/overdueSweep.js";
import { RentalOrder } from "../../../src/Rental/schema/index.js";

const DAY = 24 * 3600 * 1000;

async function registerAndVerify(app, slug, { email, phone, password = "Customer@1234" }) {
  process.env.RENTAL_OTP_DEV_ECHO = "true";
  const reg = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/register`)
    .send({ email, phone, password, displayName: "Gap User" });
  expect(reg.status).toBe(201);
  const verify = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/verify-email`)
    .send({ email, code: reg.body.data.devCode });
  expect(verify.status).toBe(200);
  return { token: verify.body.data.tokens.accessToken };
}

describe("gap close — Must/Should remnants", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("inclusive tax back-calcs preTax + GST", () => {
    const { linePreTaxPaise, lineGstPaise, lineGrossPaise, taxMode } = computeLine({
      ratePaise: 11800,
      quantity: 1,
      billableMinutes: 60,
      unitMinutes: 60,
      gstBps: 1800,
      mode: "inclusive",
    });
    expect(taxMode).toBe("inclusive");
    expect(lineGrossPaise).toBe(11800);
    expect(linePreTaxPaise + lineGstPaise).toBe(11800);
    expect(linePreTaxPaise).toBe(10000);
    expect(lineGstPaise).toBe(1800);
  });

  it("deriveDepositStatus enums", () => {
    expect(deriveDepositStatus({ depositCollectedPaise: 0 }, { expectedDepositPaise: 100 })).toBe("pending");
    expect(
      deriveDepositStatus({
        depositCollectedPaise: 100,
        deductionsPaise: 0,
        forfeitedDepositPaise: 0,
        depositRefundsPendingPaise: 0,
        depositRefundsCompletedPaise: 0,
        depositLiabilityPaise: 100,
        refundableDepositPaise: 100,
      })
    ).toBe("held");
    expect(
      deriveDepositStatus({
        depositCollectedPaise: 100,
        deductionsPaise: 0,
        forfeitedDepositPaise: 0,
        depositRefundsPendingPaise: 0,
        depositRefundsCompletedPaise: 100,
        depositLiabilityPaise: 0,
        refundableDepositPaise: 0,
      })
    ).toBe("refunded");
  });

  it("commercial-rules list, users, templates, multi-window cart, deposit, sweep, repair, bonus", async () => {
    const { token: adminToken, slug, tenantId } = await registerTenant(app);
    const ah = bearer(adminToken);
    const { variantId } = await seedCatalog(app, adminToken, { assets: 2, ratePaise: 10000, gstBps: 0 });

    const rules = await request(app).get("/api/v1/rental/admin/commercial-rules").set(ah);
    expect(rules.status).toBe(200);
    expect(rules.body.data.items.length).toBeGreaterThan(0);

    const users = await request(app).get("/api/v1/rental/admin/users").set(ah);
    expect(users.status).toBe(200);
    expect(users.body.data.items.length).toBeGreaterThan(0);

    const tmpl = await request(app)
      .post("/api/v1/rental/admin/quotation-templates")
      .set(ah)
      .send({ code: "STD", name: "Standard", headerText: "ACME Rentals", footerText: "Thanks", isDefault: true });
    expect(tmpl.status).toBe(201);

    const email = `gap-${uniqueSlug()}@test.com`;
    const phone = `+9195${Math.floor(Math.random() * 1e8)}`;
    const { token: custToken } = await registerAndVerify(app, slug, { email, phone });
    const ch = bearer(custToken);

    const w1s = new Date(Date.now() + DAY).toISOString();
    const w1e = new Date(Date.now() + 2 * DAY).toISOString();
    const w2s = new Date(Date.now() + 5 * DAY).toISOString();
    const w2e = new Date(Date.now() + 6 * DAY).toISOString();

    const add1 = await request(app)
      .post("/api/v1/rental/customer/cart/items")
      .set(ch)
      .send({ variantId, quantity: 1, startAt: w1s, endAt: w1e, locationId: "default" });
    expect(add1.status).toBe(201);
    expect(add1.body.data.cart.lines[0].availability.sufficient).toBe(true);

    const add2 = await request(app)
      .post("/api/v1/rental/customer/cart/items")
      .set(ch)
      .send({ variantId, quantity: 1, startAt: w2s, endAt: w2e });
    expect(add2.status).toBe(201);
    expect(add2.body.data.cart.lines).toHaveLength(2);

    const preview = await request(app).get("/api/v1/rental/customer/cart/preview").set(ch);
    expect(preview.status).toBe(200);
    expect(preview.body.data.preview.taxBreakdown).toBeDefined();

    const checkout = await request(app)
      .post("/api/v1/rental/customer/cart/checkout")
      .set(ch)
      .set(idem(`co-${uniqueSlug()}`))
      .send({});
    expect(checkout.status).toBe(201);
    const rentalId = checkout.body.data.rental._id;
    expect(checkout.body.data.rental.lines[0].startAt).toBeTruthy();

    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`).set(ah).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    const confirm = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`)
      .set(ah)
      .set(idem(`cf-${uniqueSlug()}`))
      .set(ifMatch(1))
      .send({});
    expect(confirm.status).toBe(200);

    const dep = await request(app).get(`/api/v1/rental/customer/rentals/${rentalId}/deposit`).set(ch);
    expect(dep.status).toBe(200);
    expect(["pending", "held"]).toContain(dep.body.data.status);

    // overdue sweep path
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(ah)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Sweep", email: `cust-${uniqueSlug()}@example.test`, phone: `+9196${Math.floor(Math.random() * 1e8)}` });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() - 3 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(ah)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    const rid2 = draft.body.data.rental._id;
    const charge = draft.body.data.preview.preTaxSubtotalPaise + draft.body.data.preview.bookedGstPaise;
    const deposit = draft.body.data.preview.deposit.depositPaise;
    await request(app).post(`/api/v1/rental/admin/rentals/${rid2}/reserve`).set(ah).set(idem(`r2-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    await request(app).post(`/api/v1/rental/admin/rentals/${rid2}/confirm`).set(ah).set(idem(`cf2-${uniqueSlug()}`)).set(ifMatch(1)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rid2}/payments/manual`)
      .set(ah)
      .set(idem(`p-${uniqueSlug()}`))
      .send({
        amountPaise: charge + deposit,
        allocation: { chargePaise: charge, depositPaise: deposit },
        method: "cash",
        reference: "SW-1",
      });
    await request(app).post(`/api/v1/rental/admin/rentals/${rid2}/issue`).set(ah).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(3)).send({});

    const tid = tenantId || (await RentalOrder.findById(rid2).select("tenantId").lean()).tenantId;
    const swept = await sweepOverdueForTenant(tid, { sendReminders: false });
    expect(swept.transitioned).toBeGreaterThanOrEqual(1);
    const after = await RentalOrder.findById(rid2).lean();
    expect(after.status).toBe("overdue");

    const job = await request(app).post("/api/v1/rental/admin/jobs/overdue-sweep").set(ah);
    expect(job.status).toBe(200);

    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rid2}/return`)
      .set(ah)
      .set(idem(`rt-${uniqueSlug()}`))
      .send({ actualReturnedAt: new Date().toISOString() });
    const insp = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rid2}/inspection`)
      .set(ah)
      .set(idem(`in-${uniqueSlug()}`))
      .send({ photos: FAKE_INSPECT_PHOTOS, damagePreTaxPaise: 5000, notes: "scratch" });
    expect(insp.status).toBe(200);
    const repairList = await request(app).get(`/api/v1/rental/admin/repairs?rentalId=${rid2}`).set(ah);
    expect(repairList.status).toBe(200);
    expect(repairList.body.data.items.length).toBeGreaterThanOrEqual(1);

    const dashOd = await request(app).get("/api/v1/rental/admin/dashboard/overdue").set(ah);
    expect(dashOd.status).toBe(200);

    const assets = await request(app).get("/api/v1/rental/admin/assets").set(ah);
    const code = assets.body.data.items[0].assetCode;
    const scan = await request(app).get(`/api/v1/rental/admin/bonus/scan?code=${code}`).set(ah);
    expect(scan.status).toBe(200);
    expect(scan.body.data.asset.assetCode).toBe(code);

    const analytics = await request(app).get("/api/v1/rental/admin/bonus/analytics").set(ah);
    expect(analytics.status).toBe(200);
  });
});
