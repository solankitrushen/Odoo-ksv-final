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

describe("Mock delivery (no Borzo)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("dispatch returns 4-5 day promise; admin confirm-delivery marks delivered", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    const { variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 10000, gstBps: 0 });

    const cust = await request(app)
      .post("/api/v1/rental/admin/customers")
      .set(h)
      .set(idem(`c-${uniqueSlug()}`))
      .send({ displayName: "Deliver Me", email: `cust-${uniqueSlug()}@example.test`, phone: `+9197${Math.floor(Math.random() * 1e8)}`,
        addresses: [
          {
            type: "service",
            line1: "12 Test St",
            city: "Mumbai",
            state: "MH",
            postalCode: "400001",
            phone: "+919700000001",
          },
        ],
      });
    expect(cust.status).toBe(201);
    const customerId = cust.body.data.customer._id;
    const addr = cust.body.data.customer.addresses?.[0] || cust.body.data.customer.addresses;
    // addresses may be nested differently — re-fetch customer if needed
    const startAt = new Date(Date.now() + DAY).toISOString();
    const endAt = new Date(Date.now() + 3 * DAY).toISOString();

    const draft = await request(app)
      .post("/api/v1/rental/admin/rentals")
      .set(h)
      .set(idem(`d-${uniqueSlug()}`))
      .send({
        customerId,
        startAt,
        endAt,
        lines: [{ variantId, quantity: 1 }],
        fulfillment: { method: "delivery" },
        addresses: {
          delivery: {
            line1: "12 Test St",
            city: "Mumbai",
            state: "MH",
            pincode: "400001",
            phone: "+919700000001",
            fullName: "Deliver Me",
          },
        },
      });
    expect(draft.status).toBe(201);
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
        reference: "DEL-1",
      });

    const dispatch = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/dispatch`)
      .set(h)
      .set(idem(`dp-${uniqueSlug()}`));
    expect(dispatch.status).toBe(200);
    expect(dispatch.body.data.rental.status).toBe("dispatch_pending");
    expect(dispatch.body.data.deliveryPromise.message).toMatch(/4-5 days/i);
    expect(dispatch.body.data.shipment.provider).toBe("mock");
    expect(dispatch.body.data.shipment.metadata.mock).toBe(true);

    const confirm = await request(app)
      .post(`/api/v1/rental/admin/rentals/${rentalId}/confirm-delivery`)
      .set(h)
      .set(idem(`cd-${uniqueSlug()}`));
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.rental.status).toBe("dispatched");
    expect(confirm.body.data.rental.fulfillment.deliveredAt).toBeTruthy();
    expect(confirm.body.data.shipment.status).toBe("delivered");
    void addr;
  });
});
