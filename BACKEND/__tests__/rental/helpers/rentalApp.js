import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import apiRoutes from "../../../src/Routes/index.js";
import rentalWebhookRoutes from "../../../src/Rental/routes/webhooks.js";
import { errorHandler } from "../../../src/Middleware/errorHandler.js";
import { connectDB } from "../../../src/db.js";

let ready = false;

/** App with raw webhook routers mounted BEFORE express.json, then the API. */
export async function getRentalApp() {
  if (!ready) {
    await connectDB();
    ready = true;
  }
  const app = express();
  app.use(cookieParser());
  app.use("/api/v1/webhook", rentalWebhookRoutes);
  app.use("/api/v1/rental/webhook", rentalWebhookRoutes);
  app.use(express.json());
  const router = express.Router();
  router.use(apiRoutes);
  router.use(errorHandler);
  app.use("/api/v1", router);
  return app;
}

let counter = 0;
export function uniqueSlug(prefix = "t") {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`.slice(0, 60).toLowerCase();
}

/** Register a tenant + admin, returning bearer token, tenantId and slug. */
export async function registerTenant(app, slug = uniqueSlug()) {
  const res = await request(app)
    .post("/api/v1/vb/auth/register-tenant")
    .send({
      tenant: { name: `Org ${slug}`, slug },
      admin: { name: "Admin", email: `admin-${slug}@example.test`, password: "Admin@1234" },
    });
  if (res.status !== 201) {
    throw new Error(`register-tenant failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.tokens.accessToken, tenantId: res.body.data.tenantId, slug };
}

export const bearer = (t) => ({ Authorization: `Bearer ${t}` });
export const idem = (k) => ({ "Idempotency-Key": k });
export const ifMatch = (v) => ({ "If-Match": `"${v}"` });

/**
 * Seed a full catalog (category, product, variant, default pricelist + rate,
 * org tax + deposit policies, assets) for a tenant via the admin API.
 * @returns {{variantId, productId}}
 */
export async function seedCatalog(app, token, { assets = 3, ratePaise = 120000, gstBps = 1800, depositBps = 2500 } = {}) {
  const h = bearer(token);
  const tax = await request(app)
    .post("/api/v1/rental/admin/tax/codes")
    .set(h)
    .send({
      code: "GST18",
      name: "GST 18%",
      rateBps: gstBps,
      mode: "exclusive",
      jurisdiction: "IN",
      effectiveFrom: "2020-01-01T00:00:00.000Z",
    });
  if (tax.status !== 201) throw new Error(`tax seed failed: ${tax.status} ${JSON.stringify(tax.body)}`);
  const taxClassId = tax.body.data.taxCode._id;
  const cat = await request(app).post("/api/v1/rental/admin/categories").set(h).send({ code: "CAM", name: "Cameras" });
  const product = await request(app)
    .post("/api/v1/rental/admin/products")
    .set(h)
    .send({ productSku: "CAM-KIT", name: "Camera Kit", categoryId: cat.body.data.category._id, taxClassId });
  const variant = await request(app)
    .post("/api/v1/rental/admin/variants")
    .set(h)
    .send({ productId: product.body.data.product._id, variantSku: "CAM-KIT-STD", name: "Camera Kit Std", defaultPeriodCode: "day" });
  const pl = await request(app)
    .post("/api/v1/rental/admin/pricelists")
    .set(h)
    .send({ code: "DEFAULT", name: "Default", isDefault: true, effectiveFrom: "2020-01-01T00:00:00.000Z" });
  await request(app)
    .post(`/api/v1/rental/admin/pricelists/${pl.body.data.pricelist._id}/rates`)
    .set(h)
    .send({ targetType: "variant", targetId: variant.body.data.variant._id, periodCode: "day", ratePaise, effectiveFrom: "2020-01-01T00:00:00.000Z" });
  await request(app)
    .post("/api/v1/rental/admin/commercial-rules")
    .set(h)
    .send({ scopeType: "organization", policyType: "deposit", policy: { mode: "percentage", valueBps: depositBps }, effectiveFrom: "2020-01-01T00:00:00.000Z" });
  // late policy so late fee applies (hourly late rate) + a cap (system-safe
  // cap default is 0, which would zero every late fee).
  await request(app)
    .post("/api/v1/rental/admin/commercial-rules")
    .set(h)
    .send({ scopeType: "organization", policyType: "late", policy: { enabled: true, ratePaise: 6000, periodCode: "hour" }, effectiveFrom: "2020-01-01T00:00:00.000Z" });
  await request(app)
    .post("/api/v1/rental/admin/commercial-rules")
    .set(h)
    .send({ scopeType: "organization", policyType: "cap", policy: { mode: "fixed", valuePaise: 5000 }, effectiveFrom: "2020-01-01T00:00:00.000Z" });
  const assetDocs = Array.from({ length: assets }, (_, i) => ({
    assetCode: `CAM-${String(i + 1).padStart(4, "0")}`,
    variantId: variant.body.data.variant._id,
  }));
  await request(app).post("/api/v1/rental/admin/assets").set(h).send({ assets: assetDocs });
  return { variantId: variant.body.data.variant._id, productId: product.body.data.product._id, taxClassId };
}

/** Placeholder inspection photo URLs (Cloudinary optional in tests). */
export const FAKE_INSPECT_PHOTOS = {
  front: "https://res.cloudinary.com/demo/image/upload/front.jpg",
  side: "https://res.cloudinary.com/demo/image/upload/side.jpg",
  back: "https://res.cloudinary.com/demo/image/upload/back.jpg",
};

/** Admin customer create body with required email + phone. */
export function customerBody(overrides = {}) {
  const slug = uniqueSlug("c");
  return {
    displayName: "Customer",
    email: `${slug}@example.test`,
    phone: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    ...overrides,
  };
}

export async function seedTaxCode(app, token, { code = "GST18", rateBps = 1800 } = {}) {
  const res = await request(app)
    .post("/api/v1/rental/admin/tax/codes")
    .set(bearer(token))
    .send({
      code: `${code}-${uniqueSlug("t")}`.slice(0, 40),
      name: "GST",
      rateBps,
      mode: "exclusive",
      jurisdiction: "IN",
      effectiveFrom: "2020-01-01T00:00:00.000Z",
    });
  if (res.status !== 201) throw new Error(`seedTaxCode failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.taxCode._id;
}
