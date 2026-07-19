import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  getRentalApp,
  registerTenant,
  seedCatalog,
  seedTaxCode,
  bearer,
  ifMatch,
  uniqueSlug,
} from "../helpers/rentalApp.js";

describe("SPEC-003 pricelist + rates + public product detail", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("admin: rental-periods + pricelist/rate CRUD + default uniqueness", async () => {
    const { token } = await registerTenant(app);
    const h = bearer(token);

    const periods = await request(app).get("/api/v1/rental/admin/rental-periods").set(h);
    expect(periods.status).toBe(200);
    expect(periods.body.data.items.map((p) => p.code)).toEqual(
      expect.arrayContaining(["hour", "day", "week", "month"])
    );

    const a = await request(app)
      .post("/api/v1/rental/admin/pricelists")
      .set(h)
      .send({ code: "DEFAULT", name: "Default", isDefault: true, effectiveFrom: "2020-01-01T00:00:00.000Z" });
    expect(a.status).toBe(201);
    const defaultId = a.body.data.pricelist._id;

    const b = await request(app)
      .post("/api/v1/rental/admin/pricelists")
      .set(h)
      .send({ code: "PROMO", name: "Promo", isDefault: true, effectiveFrom: "2020-01-01T00:00:00.000Z" });
    expect(b.status).toBe(201);
    const promoId = b.body.data.pricelist._id;

    const oldDefault = await request(app).get(`/api/v1/rental/admin/pricelists/${defaultId}`).set(h);
    expect(oldDefault.body.data.pricelist.isDefault).toBe(false);
    const newDefault = await request(app).get(`/api/v1/rental/admin/pricelists/${promoId}`).set(h);
    expect(newDefault.body.data.pricelist.isDefault).toBe(true);

    const rate = await request(app)
      .post(`/api/v1/rental/admin/pricelists/${promoId}/rates`)
      .set(h)
      .send({
        targetType: "default",
        periodCode: "day",
        ratePaise: 99000,
        effectiveFrom: "2020-01-01T00:00:00.000Z",
      });
    expect(rate.status).toBe(201);
    const rateId = rate.body.data.rate._id;

    const listed = await request(app).get(`/api/v1/rental/admin/pricelists/${promoId}/rates`).set(h);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items.some((r) => r._id === rateId)).toBe(true);

    const patched = await request(app)
      .patch(`/api/v1/rental/admin/rates/${rateId}`)
      .set(h)
      .set(ifMatch(0))
      .send({ ratePaise: 110000 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.rate.ratePaise).toBe(110000);

    const archRate = await request(app)
      .delete(`/api/v1/rental/admin/rates/${rateId}`)
      .set(h)
      .set(ifMatch(1))
      .send({});
    expect(archRate.status).toBe(200);
    expect(archRate.body.data.rate.status).toBe("archived");

    // Cannot archive the current default.
    const blockArch = await request(app)
      .delete(`/api/v1/rental/admin/pricelists/${promoId}`)
      .set(h)
      .set(ifMatch(0))
      .send({});
    expect(blockArch.status).toBe(409);
    expect(blockArch.body.error).toBe("RESOURCE_IN_USE");

    // Non-default can archive.
    const archPl = await request(app)
      .delete(`/api/v1/rental/admin/pricelists/${defaultId}`)
      .set(h)
      .set(ifMatch(oldDefault.body.data.pricelist.version))
      .send({});
    expect(archPl.status).toBe(200);
    expect(archPl.body.data.pricelist.status).toBe("archived");
  });

  it("public: product detail exposes variants + resolved rates; matches seed catalog", async () => {
    const { token, slug } = await registerTenant(app);
    const { productId, variantId } = await seedCatalog(app, token, { assets: 1, ratePaise: 120000 });

    const detail = await request(app).get(`/api/v1/rental/public/${slug}/catalog/${productId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.product._id).toBe(productId);
    expect(detail.body.data.periods.length).toBeGreaterThan(0);
    expect(detail.body.data.pricelist).toBeTruthy();

    const v = detail.body.data.variants.find((x) => x._id === variantId);
    expect(v).toBeTruthy();
    const day = v.rates.find((r) => r.periodCode === "day");
    expect(day).toBeTruthy();
    expect(day.ratePaise).toBe(120000);
    expect(day.source).toBe("variant");

    const variantsOnly = await request(app).get(
      `/api/v1/rental/public/${slug}/catalog/${productId}/variants`
    );
    expect(variantsOnly.status).toBe(200);
    expect(variantsOnly.body.data.items[0].rates.some((r) => r.periodCode === "day")).toBe(true);
  });

  it("public: product-level rate fills when variant has no rate", async () => {
    const { token, slug } = await registerTenant(app);
    const h = bearer(token);
    const sku = `P-${uniqueSlug("p")}`;

    const taxClassId = await seedTaxCode(app, token);
    const product = await request(app)
      .post("/api/v1/rental/admin/products")
      .set(h)
      .send({ productSku: sku, name: "Fallback Priced", taxClassId });
    expect(product.status).toBe(201);
    const productId = product.body.data.product._id;
    const variant = await request(app)
      .post("/api/v1/rental/admin/variants")
      .set(h)
      .send({
        productId,
        variantSku: `${sku}-A`,
        name: "A",
        attributes: { color: "black", size: "M" },
        defaultPeriodCode: "day",
      });
    const variantId = variant.body.data.variant._id;

    const pl = await request(app)
      .post("/api/v1/rental/admin/pricelists")
      .set(h)
      .send({ code: "DEFAULT", name: "Default", isDefault: true, effectiveFrom: "2020-01-01T00:00:00.000Z" });
    await request(app)
      .post(`/api/v1/rental/admin/pricelists/${pl.body.data.pricelist._id}/rates`)
      .set(h)
      .send({
        targetType: "product",
        targetId: productId,
        periodCode: "day",
        ratePaise: 50000,
        effectiveFrom: "2020-01-01T00:00:00.000Z",
      });

    const detail = await request(app).get(`/api/v1/rental/public/${slug}/catalog/${productId}`);
    expect(detail.status).toBe(200);
    const v = detail.body.data.variants.find((x) => x._id === variantId);
    expect(v.attributes.color).toBe("black");
    const day = v.rates.find((r) => r.periodCode === "day");
    expect(day.ratePaise).toBe(50000);
    expect(day.source).toBe("product");
  });
});
