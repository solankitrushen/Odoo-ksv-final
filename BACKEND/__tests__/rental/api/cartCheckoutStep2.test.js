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
} from "../helpers/rentalApp.js";

const DAY = 24 * 3600 * 1000;

/** Local calendar YYYY-MM-DD (matches scheduleService dayBounds setHours). */
function localYmd(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function registerAndVerify(app, slug, { email, phone, password = "Customer@1234", displayName = "Cart User" }) {
  process.env.RENTAL_OTP_DEV_ECHO = "true";
  const reg = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/register`)
    .send({ email, phone, password, displayName });
  expect(reg.status).toBe(201);
  const verify = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/verify-email`)
    .send({ email, code: reg.body.data.devCode });
  expect(verify.status).toBe(200);
  return { token: verify.body.data.tokens.accessToken, customerId: verify.body.data.customerId };
}

describe("Step2: cart + invoice download + schedules/overdue", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("cart CRUD → checkout draft → confirm invoice → PDF; pickups/overdue", async () => {
    const { token: adminToken, slug } = await registerTenant(app);
    const ah = bearer(adminToken);
    const { variantId, productId } = await seedCatalog(app, adminToken, { assets: 2, ratePaise: 50000, gstBps: 0 });

    const email = `cart-${uniqueSlug()}@test.com`;
    const phone = `+9193${Math.floor(Math.random() * 1e8)}`;
    const { token: custToken } = await registerAndVerify(app, slug, { email, phone });
    const ch = bearer(custToken);

    const startAt = new Date(Date.now() + DAY).toISOString();
    const endAt = new Date(Date.now() + 2 * DAY).toISOString();

    const empty = await request(app).get("/api/v1/rental/customer/cart").set(ch);
    expect(empty.status).toBe(200);
    expect(empty.body.data.cart.lines).toHaveLength(0);

    const add = await request(app)
      .post("/api/v1/rental/customer/cart/items")
      .set(ch)
      .send({ variantId, quantity: 1, periodCode: "day", startAt, endAt });
    expect(add.status).toBe(201);
    expect(add.body.data.cart.lines).toHaveLength(1);
    const lineId = add.body.data.cart.lines[0].lineId;

    const patch = await request(app)
      .patch(`/api/v1/rental/customer/cart/items/${lineId}`)
      .set(ch)
      .send({ quantity: 1 });
    expect(patch.status).toBe(200);

    const preview = await request(app).get("/api/v1/rental/customer/cart/preview").set(ch);
    expect(preview.status).toBe(200);
    expect(preview.body.data.preview.preTaxSubtotalPaise).toBeGreaterThan(0);

    const checkout = await request(app)
      .post("/api/v1/rental/customer/cart/checkout")
      .set(ch)
      .set(idem(`co-${uniqueSlug()}`))
      .send({});
    expect(checkout.status).toBe(201);
    const rentalId = checkout.body.data.rental._id;
    expect(checkout.body.data.rental.status).toBe("draft");

    const cartAfter = await request(app).get("/api/v1/rental/customer/cart").set(ch);
    expect(cartAfter.body.data.cart.lines).toHaveLength(0);

    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`)
      .set(ah)
      .set(idem(`r-${uniqueSlug()}`))
      .set(ifMatch(0))
      .send({});
    const confirm = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`)
      .set(ah)
      .set(idem(`cf-${uniqueSlug()}`))
      .set(ifMatch(1))
      .send({});
    expect(confirm.status).toBe(200);

    const invList = await request(app).get(`/api/v1/rental/admin/rentals/${rentalId}/invoices`).set(ah);
    expect(invList.status).toBe(200);
    expect(invList.body.data.items.length).toBeGreaterThanOrEqual(1);
    const invoiceId = invList.body.data.items[0]._id;

    const custInv = await request(app).get(`/api/v1/rental/customer/rentals/${rentalId}/invoice`).set(ch);
    expect(custInv.status).toBe(200);
    expect(custInv.body.data.invoice._id).toBe(invoiceId);

    const pdfCust = await request(app)
      .get(`/api/v1/rental/customer/rentals/${rentalId}/invoice/download`)
      .set(ch);
    expect(pdfCust.status).toBe(200);
    expect(pdfCust.headers["content-type"]).toMatch(/pdf/);
    expect(pdfCust.body.length || Buffer.byteLength(pdfCust.text || "")).toBeGreaterThan(100);

    const pdfAdmin = await request(app).get(`/api/v1/rental/admin/invoices/${invoiceId}/download`).set(ah);
    expect(pdfAdmin.status).toBe(200);
    expect(pdfAdmin.headers["content-type"]).toMatch(/pdf/);

    const penalty = await request(app).get(`/api/v1/rental/customer/rentals/${rentalId}/penalty`).set(ch);
    expect(penalty.status).toBe(200);
    expect(penalty.body.data).toHaveProperty("lateFeePaise");
    expect(penalty.body.data).toHaveProperty("dueBillPaise");
    expect(penalty.body.data).toHaveProperty("overdueLabel");
    expect(penalty.body.data).toHaveProperty("penaltyTotalPaise");

    const pickupDate = localYmd(startAt);
    const pickups = await request(app).get(`/api/v1/rental/admin/pickups?date=${pickupDate}`).set(ah);
    expect(pickups.status).toBe(200);
    expect(pickups.body.data.items.some((r) => r._id === rentalId || String(r._id) === rentalId)).toBe(true);

    const search = await request(app).get(`/api/v1/rental/public/${slug}/catalog?q=Camera`);
    expect(search.status).toBe(200);
    expect(search.body.data.items.some((p) => p._id === productId || String(p._id) === productId)).toBe(true);
  });

  it("admin overdue list includes ACTIVE past plannedEndAt", async () => {
    const { token: adminToken } = await registerTenant(app);
    const ah = bearer(adminToken);
    const { variantId } = await seedCatalog(app, adminToken, { assets: 1, ratePaise: 10000, gstBps: 0 });
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(ah)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Late", email: `cust-${uniqueSlug()}@example.test`, phone: `+9194${Math.floor(Math.random() * 1e8)}` });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() - 3 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(ah)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    const rentalId = draft.body.data.rental._id;
    const charge = draft.body.data.preview.preTaxSubtotalPaise + draft.body.data.preview.bookedGstPaise;
    const deposit = draft.body.data.preview.deposit.depositPaise;

    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`).set(ah).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`).set(ah).set(idem(`cf-${uniqueSlug()}`)).set(ifMatch(1)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(ah)
      .set(idem(`p-${uniqueSlug()}`))
      .send({
        amountPaise: charge + deposit,
        allocation: { chargePaise: charge, depositPaise: deposit },
        method: "cash",
        reference: "OD-1",
      });
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/issue`).set(ah).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(3)).send({});

    const overdue = await request(app).get("/api/v1/rental/admin/rentals/overdue").set(ah);
    expect(overdue.status).toBe(200);
    expect(overdue.body.data.items.some((r) => String(r._id) === rentalId)).toBe(true);
    expect(overdue.body.data.items.find((r) => String(r._id) === rentalId).lateFeePaise).toBeGreaterThanOrEqual(0);

    const returns = await request(app).get(`/api/v1/rental/admin/returns?date=${localYmd(endAt)}`).set(ah);
    expect(returns.status).toBe(200);
    expect(returns.body.data.items.some((r) => String(r._id) === rentalId)).toBe(true);
  });
});
