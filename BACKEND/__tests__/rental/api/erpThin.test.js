import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, seedCatalog, bearer, uniqueSlug } from "../helpers/rentalApp.js";

describe("ERP thin: analytics + incidents + deliveries", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("exposes analytics, ar-aging, incidents list, deliveries schedule", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);
    await seedCatalog(app, token, { assets: 1 });

    const sales = await request(app).get("/api/v1/rental/admin/analytics/sales").set(h);
    expect(sales.status).toBe(200);
    expect(sales.body.data).toHaveProperty("items");

    const salesDay = await request(app).get("/api/v1/rental/admin/analytics/sales?groupBy=day").set(h);
    expect(salesDay.status).toBe(200);
    expect(salesDay.body.data.groupBy).toBe("day");
    for (const row of salesDay.body.data.items) {
      expect(row).toHaveProperty("lateFeePaise");
      expect(row).toHaveProperty("revenuePaise");
    }

    const rev = await request(app).get("/api/v1/rental/admin/analytics/revenue").set(h);
    expect(rev.status).toBe(200);
    expect(rev.body.data.gross).toBeDefined();

    const ar = await request(app).get("/api/v1/rental/admin/reports/ar-aging").set(h);
    expect(ar.status).toBe(200);
    expect(ar.body.data.buckets).toBeDefined();

    const inc = await request(app)
      .post("/api/v1/rental/admin/incidents")
      .set(h)
      .send({ type: "fraud", notes: "test", amountPaise: 0 });
    expect(inc.status).toBe(201);

    const list = await request(app).get("/api/v1/rental/admin/incidents").set(h);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1);

    const del = await request(app).get(`/api/v1/rental/admin/deliveries?date=${new Date().toISOString().slice(0, 10)}`).set(h);
    expect(del.status).toBe(200);
    expect(del.body.data).toHaveProperty("items");
    void uniqueSlug;
  });
});
