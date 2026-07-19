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

const DAY = 24 * 3600 * 1000;

describe("Step1: tax + inspect photos + deposit shortfall", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("product requires taxClassId; tax code drives GST on quote", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const missing = await request(app)
      .post("/api/v1/rental/admin/products")
      .set(h)
      .send({ productSku: `X-${uniqueSlug()}`, name: "No tax" });
    expect(missing.status).toBe(400);

    const { variantId } = await seedCatalog(app, token, { gstBps: 1800, ratePaise: 100000, assets: 1 });
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Tax", email: `cust-${uniqueSlug()}@example.test`, phone: `+9191${Math.floor(Math.random() * 1e8)}` });
    const startAt = new Date(Date.now() + DAY).toISOString();
    const endAt = new Date(Date.now() + 2 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({
        customerId: cust.body.data.customer._id,
        startAt,
        endAt,
        lines: [{ variantId, quantity: 1, periodCode: "day" }],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.preview.bookedGstPaise).toBe(18000);
  });

  it("inspect requires 3 photos; damage > deposit → shortfall", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 10000, depositBps: 2500, gstBps: 0 });
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({
        displayName: "Damage",
        email: `dmg-${uniqueSlug()}@x.test`,
        phone: `+9192${Math.floor(Math.random() * 1e8)}`,
      });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() - 2 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    const rentalId = draft.body.data.rental._id;
    const charge = draft.body.data.preview.preTaxSubtotalPaise + draft.body.data.preview.bookedGstPaise;
    const deposit = draft.body.data.preview.deposit.depositPaise;

    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`).set(h).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`).set(h).set(idem(`cf-${uniqueSlug()}`)).set(ifMatch(1)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(h)
      .set(idem(`p-${uniqueSlug()}`))
      .send({
        amountPaise: charge + deposit,
        allocation: { chargePaise: charge, depositPaise: deposit },
        method: "cash",
        reference: "DMG-1",
      });
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/issue`).set(h).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(3)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/return`)
      .set(h)
      .set(idem(`rt-${uniqueSlug()}`))
      .send({ actualReturnedAt: endAt });

    const noPhotos = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/inspection`)
      .set(h)
      .set(idem(`bad-${uniqueSlug()}`))
      .send({ damagePreTaxPaise: 50000 });
    expect(noPhotos.status).toBe(400);

    const damagePreTaxPaise = Math.max(deposit + 20000, 50000);
    const insp = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/inspection`)
      .set(h)
      .set(idem(`in-${uniqueSlug()}`))
      .send({
        photos: FAKE_INSPECT_PHOTOS,
        notes: "cracked housing",
        damagePreTaxPaise,
        damageGstPaise: 0,
      });
    expect(insp.status).toBe(200);
    expect(insp.body.data.rental.inspection.photos.side).toBeTruthy();

    const close = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/close`)
      .set(h)
      .set(idem(`cl-${uniqueSlug()}`))
      .send({});
    expect(close.status).toBe(200);
    expect(close.body.data.rental.settlementShortfallPaise).toBeGreaterThan(0);
    expect(close.body.data.rental.balanceDuePaise).toBeGreaterThan(0);

    const penalty = await request(app).get(`/api/v1/rental/admin/rentals/${rentalId}/penalty`).set(h);
    expect(penalty.status).toBe(200);
    expect(penalty.body.data.settlementShortfallPaise).toBeGreaterThan(0);
    expect(penalty.body.data.inspection.photos.front).toBeTruthy();
  });
});
