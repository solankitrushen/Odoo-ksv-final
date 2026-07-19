import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, seedCatalog, bearer, idem, ifMatch, uniqueSlug, FAKE_INSPECT_PHOTOS } from "../helpers/rentalApp.js";

const DAY = 24 * 3600 * 1000;

describe("Rental full lifecycle (transaction-capable Mongo)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("runs quote → reserve → confirm → pay → issue → late return → close with deposit settlement", async () => {
    const { token, tenantId } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token);

    // customer
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`cust-${uniqueSlug()}`))
      .send({ displayName: "Acme Renter", type: "business", email: `renter-${uniqueSlug()}@x.test`, phone: "+919000001234" });
    expect(cust.status).toBe(201);
    const customerId = cust.body.data.customer._id;

    // availability
    const startAt = new Date(Date.now() - 2 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString(); // 1 day interval, in the past
    const avail = await request(app)
      .get("/api/v1/rental/admin/availability")
      .set(h)
      .query({ variantId, startAt, endAt, quantity: 1 });
    expect(avail.status).toBe(200);
    expect(avail.body.data.availableCount).toBeGreaterThanOrEqual(1);

    // draft
    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`draft-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1, periodCode: "day" }] });
    expect(draft.status).toBe(201);
    const rentalId = draft.body.data.rental._id;
    expect(draft.body.data.preview.preTaxSubtotalPaise).toBe(120000);
    expect(draft.body.data.preview.bookedGstPaise).toBe(21600);
    expect(draft.body.data.preview.deposit.depositPaise).toBe(30000);

    // reserve (version 0)
    const reserve = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/reserve`)
      .set(h)
      .set(idem(`res-${uniqueSlug()}`))
      .set(ifMatch(0))
      .send({});
    expect(reserve.status).toBe(200);
    expect(reserve.body.data.rental.status).toBe("reserved");

    // confirm (version 1)
    const confirm = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/confirm`)
      .set(h)
      .set(idem(`conf-${uniqueSlug()}`))
      .set(ifMatch(1))
      .send({ paymentPolicy: "prepaid" });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.rental.status).toBe("confirmed");
    expect(confirm.body.data.rental.chargeGrossPaise).toBe(141600);
    expect(confirm.body.data.invoiceId).toBeTruthy();

    // manual payment: rent + deposit
    const pay = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/payments/manual`)
      .set(h)
      .set(idem(`pay-${uniqueSlug()}`))
      .send({ amountPaise: 171600, allocation: { chargePaise: 141600, depositPaise: 30000 }, method: "cash", reference: "R-1" });
    expect(pay.status).toBe(201);
    expect(pay.body.data.rental.paymentsPaise).toBe(141600);
    expect(pay.body.data.rental.depositCollectedPaise).toBe(30000);
    expect(pay.body.data.rental.balanceDuePaise).toBe(0);

    // issue
    const issue = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/issue`)
      .set(h)
      .set(idem(`iss-${uniqueSlug()}`))
      .set(ifMatch(3))
      .send({});
    expect(issue.status).toBe(200);
    expect(issue.body.data.rental.status).toBe("active");

    // return (late — actualReturnedAt now, planned end was 1 day ago)
    const ret = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/return`)
      .set(h)
      .set(idem(`ret-${uniqueSlug()}`))
      .send({ actualReturnedAt: new Date().toISOString() });
    expect(ret.status).toBe(200);
    expect(ret.body.data.rental.status).toBe("returned");

    // inspection (manual 3-angle photos required)
    const insp = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/inspection`)
      .set(h)
      .set(idem(`insp-${uniqueSlug()}`))
      .send({ photos: FAKE_INSPECT_PHOTOS, notes: "ok" });
    expect(insp.status).toBe(200);
    expect(insp.body.data.rental.inspection.photos.front).toBeTruthy();

    // close — late fee capped at 5000, deducted from deposit, remainder refunded
    const close = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/close`)
      .set(h)
      .set(idem(`close-${uniqueSlug()}`))
      .send({});
    expect(close.status).toBe(200);
    const c = close.body.data.rental;
    expect(c.status).toBe("closed");
    expect(c.lateFeePaise).toBe(5000);
    expect(c.deductionsPaise).toBe(5900); // 5000 late + 900 late GST
    expect(c.depositRefundsCompletedPaise).toBe(24100); // 30000 - 5900
    expect(c.depositLiabilityPaise).toBe(0);
    expect(c.balanceDuePaise).toBe(0);
    // conservation
    expect(c.depositCollectedPaise).toBe(
      c.depositLiabilityPaise + c.deductionsPaise + c.forfeitedDepositPaise + c.depositRefundsCompletedPaise
    );

    // dashboard reflects revenue + late fee
    const dash = await request(app).get("/api/v1/rental/admin/dashboard").set(h);
    expect(dash.status).toBe(200);
    expect(dash.body.data.money.revenueFromRentalsPaise).toBe(141600);
    expect(dash.body.data.money.lateFeeCollectionPaise).toBe(5000);

    void tenantId;
  });

  it("on-time return refunds the full deposit with no late fee", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token);
    const cust = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(`c-${uniqueSlug()}`)).send({ displayName: "OnTime", email: `cust-${uniqueSlug()}@example.test`, phone: "+919000009999" });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() - 2 * DAY).toISOString();
    const endAt = new Date(Date.now() - 1 * DAY).toISOString();
    const draft = await request(app).post("/api/v1/rental/admin/rentals").set(h).set(idem(`d-${uniqueSlug()}`)).send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    expect(draft.status).toBe(201);
    const id = draft.body.data.rental._id;
    await request(app).post(`/api/v1/rental/admin/rentals/${id}/reserve`).set(h).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
    const confirmed = await request(app).post(`/api/v1/rental/admin/rentals/${id}/confirm`).set(h).set(idem(`cf-${uniqueSlug()}`)).set(ifMatch(1)).send({});
    expect(confirmed.status).toBe(200);
    const rentalAfterConfirm = confirmed.body.data.rental;
    const charge = rentalAfterConfirm.chargeGrossPaise;
    const deposit = rentalAfterConfirm.depositSnapshot?.depositPaise
      ?? draft.body.data.preview.deposit.depositPaise;
    const pay = await request(app).post(`/api/v1/rental/admin/rentals/${id}/payments/manual`).set(h).set(idem(`p-${uniqueSlug()}`)).send({
      amountPaise: charge + deposit,
      allocation: { chargePaise: charge, depositPaise: deposit },
      method: "cash",
      reference: "R-2",
    });
    expect(pay.status).toBe(201);
    await request(app).post(`/api/v1/rental/admin/rentals/${id}/issue`).set(h).set(idem(`i-${uniqueSlug()}`)).set(ifMatch(pay.body.data.rental.version)).send({});
    // return exactly at planned end (not late)
    const detail = await request(app).get(`/api/v1/rental/admin/rentals/${id}`).set(h);
    const plannedEnd = detail.body.data.rental.plannedEndAt;
    const ret = await request(app).post(`/api/v1/rental/admin/rentals/${id}/return`).set(h).set(idem(`rt-${uniqueSlug()}`)).send({ actualReturnedAt: plannedEnd });
    expect(ret.status).toBe(200);
    expect(ret.body.data.rental.lateFeePaise).toBe(0);
    expect(ret.body.data.rental.deductionsPaise).toBe(0);
    await request(app).post(`/api/v1/rental/admin/rentals/${id}/inspection`).set(h).set(idem(`in-${uniqueSlug()}`)).send({ photos: FAKE_INSPECT_PHOTOS });
    const close = await request(app).post(`/api/v1/rental/admin/rentals/${id}/close`).set(h).set(idem(`cl-${uniqueSlug()}`)).send({});
    const c = close.body.data.rental;
    expect(c.lateFeePaise).toBe(0);
    expect(c.deductionsPaise).toBe(0);
    expect(c.depositRefundsCompletedPaise).toBe(deposit);
    expect(c.depositLiabilityPaise).toBe(0);
  });
});
