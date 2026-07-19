import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  getRentalApp,
  registerTenant,
  seedCatalog,
  bearer,
  uniqueSlug,
  idem,
  ifMatch,
} from "../helpers/rentalApp.js";

describe("Payment analytics + export", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("returns analytics summary, series, filtered list, and export rows", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 10000, depositBps: 2500, gstBps: 0 });

    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Pay Analytics Customer", email: `cust-${uniqueSlug()}@example.test`, phone: `+9193${Math.floor(Math.random() * 1e8)}` });
    expect(cust.status).toBe(201);
    const customerId = cust.body.data.customer._id;

    const DAY = 24 * 3600 * 1000;
    const startAt = new Date(Date.now() - 2 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    expect(draft.status).toBe(201);
    const rentalId = draft.body.data.rental._id;
    const charge = draft.body.data.preview.preTaxSubtotalPaise + draft.body.data.preview.bookedGstPaise;
    const deposit = draft.body.data.preview.deposit.depositPaise;

    const reserved = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`)
      .set(h)
      .set(idem(`r-${uniqueSlug()}`))
      .set(ifMatch(0))
      .send({});
    expect(reserved.status).toBe(200);
    const confirmed = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`)
      .set(h)
      .set(idem(`cf-${uniqueSlug()}`))
      .set(ifMatch(1))
      .send({});
    expect(confirmed.status).toBe(200);

    const pay = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(h)
      .set(idem(`p-${uniqueSlug()}`))
      .send({
        amountPaise: charge + deposit,
        allocation: { chargePaise: charge, depositPaise: deposit },
        method: "cash",
        reference: `CASH-${uniqueSlug()}`,
      });
    if (![200, 201].includes(pay.status)) {
      throw new Error(`manual payment failed: ${pay.status} ${JSON.stringify(pay.body)}`);
    }

    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date().toISOString();

    const analytics = await request(app)
      .get("/api/v1/rental/admin/analytics/payments")
      .query({ from, to, groupBy: "day" })
      .set(h);
    expect(analytics.status).toBe(200);
    expect(analytics.body.data.summary.totalCount).toBeGreaterThanOrEqual(1);
    expect(analytics.body.data.summary.capturedChargePaise).toBeGreaterThanOrEqual(charge);
    expect(Array.isArray(analytics.body.data.series)).toBe(true);
    expect(Array.isArray(analytics.body.data.byMethod)).toBe(true);
    expect(Array.isArray(analytics.body.data.byCustomer)).toBe(true);

    const byCustomer = await request(app)
      .get("/api/v1/rental/admin/analytics/payments")
      .query({ from, to, customerId })
      .set(h);
    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body.data.summary.totalCount).toBeGreaterThanOrEqual(1);

    const list = await request(app)
      .get("/api/v1/rental/admin/payments")
      .query({ from, to, customerId, method: "cash" })
      .set(h);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data.items[0]).toHaveProperty("customerName");

    const searched = await request(app)
      .get("/api/v1/rental/admin/payments")
      .query({ from, to, q: "Pay Analytics" })
      .set(h);
    expect(searched.status).toBe(200);
    expect(searched.body.data.items.length).toBeGreaterThanOrEqual(1);

    const miss = await request(app)
      .get("/api/v1/rental/admin/payments")
      .query({ from, to, q: "zzz-no-such-payment-xyz" })
      .set(h);
    expect(miss.status).toBe(200);
    expect(miss.body.data.items.length).toBe(0);

    const exp = await request(app)
      .get("/api/v1/rental/admin/payments/export")
      .query({ from, to, customerId })
      .set(h);
    expect(exp.status).toBe(200);
    expect(exp.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(exp.body.data).toHaveProperty("exportMax");
    expect(exp.body.data.items[0]).toHaveProperty("amountPaise");
  });
});
