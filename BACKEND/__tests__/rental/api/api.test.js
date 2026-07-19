import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, seedCatalog, bearer, idem, ifMatch, uniqueSlug } from "../helpers/rentalApp.js";

const DAY = 24 * 3600 * 1000;

async function makeConfirmedRental(app, token, variantId) {
  const h = bearer(token);
  const cust = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(`c-${uniqueSlug()}`)).send({ displayName: "C", email: `cust-${uniqueSlug()}@example.test`, phone: `+9190000${Math.floor(Math.random() * 100000)}` });
  const customerId = cust.body.data.customer._id;
  const startAt = new Date(Date.now() + DAY).toISOString();
  const endAt = new Date(Date.now() + 2 * DAY).toISOString();
  const draft = await request(app).post("/api/v1/rental/admin/rentals").set(h).set(idem(`d-${uniqueSlug()}`)).send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
  const id = draft.body.data.rental._id;
  await request(app).post(`/api/v1/rental/admin/rentals/${id}/reserve`).set(h).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(0)).send({});
  await request(app).post(`/api/v1/rental/admin/rentals/${id}/confirm`).set(h).set(idem(`cf-${uniqueSlug()}`)).set(ifMatch(1)).send({});
  return id;
}

describe("Rental API — authorization, tenant isolation, idempotency, version", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("rejects unauthenticated admin access with 401", async () => {
    const res = await request(app).get("/api/v1/rental/admin/customers");
    expect(res.status).toBe(401);
  });

  it("isolates tenants: cross-tenant rental read is 404", async () => {
    const a = await registerTenant(app);
    const b = await registerTenant(app);
    const { variantId } = await seedCatalog(app, a.token);
    const rentalId = await makeConfirmedRental(app, a.token, variantId);

    const own = await request(app).get(`/api/v1/rental/admin/rentals/${rentalId}`).set(bearer(a.token));
    expect(own.status).toBe(200);
    const cross = await request(app).get(`/api/v1/rental/admin/rentals/${rentalId}`).set(bearer(b.token));
    expect(cross.status).toBe(404);
    expect(cross.body.error).toBe("RESOURCE_NOT_FOUND");
  });

  it("idempotency: same key+body replays, same key+different body conflicts", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const key = `cust-${uniqueSlug()}`;
    const body = { displayName: "Idem Co", email: `idem-${uniqueSlug()}@example.test`, phone: "+919000012345" };
    const first = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(key)).send(body);
    const second = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(key)).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.customer._id).toBe(first.body.data.customer._id);

    const conflict = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(key)).send({ displayName: "Different", email: `cust-${uniqueSlug()}@example.test`, phone: "+919000099999" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("version conflict: stale If-Match on reserve returns 409", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token);
    const cust = await request(app).post("/api/v1/rental/admin/customers").set(h).set(idem(`c-${uniqueSlug()}`)).send({ displayName: "V", email: `cust-${uniqueSlug()}@example.test`, phone: "+919000055555" });
    const startAt = new Date(Date.now() + DAY).toISOString();
    const endAt = new Date(Date.now() + 2 * DAY).toISOString();
    const draft = await request(app).post("/api/v1/rental/admin/rentals").set(h).set(idem(`d-${uniqueSlug()}`)).send({ customerId: cust.body.data.customer._id, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    const id = draft.body.data.rental._id;
    const stale = await request(app).post(`/api/v1/rental/admin/rentals/${id}/reserve`).set(h).set(idem(`r-${uniqueSlug()}`)).set(ifMatch(99)).send({});
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("VERSION_CONFLICT");
  });

  it("rejects unknown fields via strict validation", async () => {
    const { token } = await registerTenant(app);
    const res = await request(app).post("/api/v1/rental/admin/customers").set(bearer(token)).set(idem(`c-${uniqueSlug()}`)).send({ displayName: "X", email: "x@example.test", phone: "+919000000001", tenantId: "hacked", isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("rental create rejects end before start; detail returns ops bag", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token);
    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Ops", email: `cust-${uniqueSlug()}@example.test`, phone: "+919000066677" });
    const customerId = cust.body.data.customer._id;
    const startAt = new Date(Date.now() + 2 * DAY).toISOString();
    const endAt = new Date(Date.now() + DAY).toISOString();
    const bad = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({ customerId, startAt, endAt, lines: [{ variantId, quantity: 1 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("VALIDATION_ERROR");

    const rentalId = await makeConfirmedRental(app, token, variantId);
    const detail = await request(app).get(`/api/v1/rental/admin/rentals/${rentalId}`).set(h);
    expect(detail.status).toBe(200);
    expect(detail.body.data.rental._id).toBeTruthy();
    expect(detail.body.data.ops).toHaveProperty("penalty");
    expect(detail.body.data.ops).toHaveProperty("invoices");
    expect(detail.body.data.ops).toHaveProperty("shipment");
  });

  it("admin customer list returns clear email; block stores statusReason + activity", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const email = `clear-${uniqueSlug()}@test.com`;
    const created = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Clear Contact", email, phone: "+919000011122" });
    expect(created.status).toBe(201);
    const id = created.body.data.customer._id;

    const list = await request(app).get("/api/v1/rental/admin/customers").set(h);
    expect(list.status).toBe(200);
    const row = list.body.data.items.find((c) => c._id === id || String(c._id) === id);
    expect(row).toBeTruthy();
    expect(row.email).toBe(email);
    expect(row.phone).toBe("+919000011122");

    const blocked = await request(app)
      .post(`/api/v1/rental/admin/customers/${id}/block`)
      .set(h)
      .set(ifMatch(0))
      .send({ reason: "Unpaid late fees on overdue rental" });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.customer.status).toBe("blocked");
    expect(blocked.body.data.customer.statusReason).toMatch(/Unpaid late fees/);

    const detail = await request(app).get(`/api/v1/rental/admin/customers/${id}`).set(h);
    expect(detail.status).toBe(200);
    expect(detail.body.data.customer.email).toBe(email);
    expect(detail.body.data.customer.statusReason).toMatch(/Unpaid late fees/);
    expect(detail.body.data.activity).toHaveProperty("rentalCount");
    expect(detail.body.data.activity).toHaveProperty("depositHeldPaise");
    expect(detail.body.data.activity).toHaveProperty("productHistory");
  });

  it("provider unconfigured → 424 on razorpay order", async () => {
    const prev = process.env.RAZORPAY_ENABLED;
    delete process.env.RAZORPAY_ENABLED;
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token);
    const id = await makeConfirmedRental(app, token, variantId);
    const res = await request(app).post(`/api/v1/rental/admin/rentals/${id}/payments/razorpay-order`).set(h).set(idem(`rz-${uniqueSlug()}`)).send({ amountPaise: 141600, purpose: "initial_confirmation" });
    expect(res.status).toBe(424);
    expect(res.body.error).toBe("PROVIDER_NOT_CONFIGURED");
    if (prev !== undefined) process.env.RAZORPAY_ENABLED = prev;
  });
});
