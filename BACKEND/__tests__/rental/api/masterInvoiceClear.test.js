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

describe("Master invoice generate + clear (settlement)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("generate builds a deposit-credited master invoice; clear zeroes the balance and closes", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 10000, depositBps: 2500, gstBps: 0 });
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Clear", email: `cust-${uniqueSlug()}@example.test`, phone: `+9193${Math.floor(Math.random() * 1e8)}` });
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
    // Pay rent upfront + deposit collected.
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(h)
      .set(idem(`p-${uniqueSlug()}`))
      .send({ amountPaise: charge + deposit, allocation: { chargePaise: charge, depositPaise: deposit }, method: "cash" });
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/issue`).set(h).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(3)).send({});
    // Late return (overdue) → late fee (capped) applies.
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/return`)
      .set(h)
      .set(idem(`rt-${uniqueSlug()}`))
      .send({ actualReturnedAt: new Date().toISOString() });
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/inspection`)
      .set(h)
      .set(idem(`in-${uniqueSlug()}`))
      .send({ photos: FAKE_INSPECT_PHOTOS, notes: "ok", damagePreTaxPaise: 0, damageGstPaise: 0 });

    // Generate the master invoice (explicit button).
    const gen = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/invoice/generate`)
      .set(h)
      .send({});
    expect(gen.status).toBe(201);
    expect(gen.body.data.invoice.type).toBe("final");
    // Deposit must never appear as a charge line.
    const lineNames = (gen.body.data.invoice.lines || []).map((l) => l.nameSnapshot || "");
    expect(lineNames.some((n) => /deposit/i.test(n))).toBe(false);
    const t = gen.body.data.invoice.totals;
    expect(t.finalPayablePaise).toBe(Math.max(0, t.chargeGrossPaise - t.paymentsPaise - t.depositAppliedPaise));

    // Regenerate is idempotent — same single final invoice.
    const gen2 = await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/invoice/generate`).set(h).send({});
    expect(gen2.body.data.invoice._id).toBe(gen.body.data.invoice._id);

    // Clear: settle + close.
    const clear = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/clear`)
      .set(h)
      .set(idem(`clr-${uniqueSlug()}`))
      .send({});
    expect(clear.status).toBe(200);
    expect(clear.body.data.rental.status).toBe("closed");
    expect(clear.body.data.rental.balanceDuePaise).toBe(0);
    expect(clear.body.data.rental.settlementShortfallPaise).toBe(0);
  });

  it("clear rejects returned (must inspect first); second clear on closed is idempotent", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 10000, depositBps: 0, gstBps: 0 });
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "ClearGate", email: `cust-${uniqueSlug()}@example.test`, phone: `+9193${Math.floor(Math.random() * 1e8)}` });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() - 2 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    const rentalId = draft.body.data.rental._id;
    const charge = draft.body.data.preview.preTaxSubtotalPaise;

    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`).set(h).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`).set(h).set(idem(`cf-${uniqueSlug()}`)).set(ifMatch(1)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(h)
      .set(idem(`p-${uniqueSlug()}`))
      .send({ amountPaise: charge, allocation: { chargePaise: charge, depositPaise: 0 }, method: "cash" });
    await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/issue`).set(h).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(3)).send({});
    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/return`)
      .set(h)
      .set(idem(`rt-${uniqueSlug()}`))
      .send({ actualReturnedAt: new Date().toISOString() });

    const early = await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/clear`).set(h).set(idem(`clr0-${uniqueSlug()}`)).send({});
    expect(early.status).toBe(409);
    expect(early.body.error).toBe("INVALID_STATE_TRANSITION");

    await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/inspection`)
      .set(h)
      .set(idem(`in-${uniqueSlug()}`))
      .send({ photos: FAKE_INSPECT_PHOTOS, notes: "ok", damagePreTaxPaise: 0, damageGstPaise: 0 });

    const clear = await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/clear`).set(h).set(idem(`clr1-${uniqueSlug()}`)).send({});
    expect(clear.status).toBe(200);
    expect(clear.body.data.rental.status).toBe("closed");

    const again = await request(app).post(`/api/v1/rental/admin/rentals/${rentalId}/clear`).set(h).set(idem(`clr2-${uniqueSlug()}`)).send({});
    expect(again.status).toBe(200);
    expect(again.body.data.rental.status).toBe("closed");
    expect(again.body.data.rental.balanceDuePaise).toBe(0);
  });
});
