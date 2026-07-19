import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, bearer } from "../helpers/rentalApp.js";

describe("product image upload (Cloudinary)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("returns 424 when Cloudinary credentials incomplete", async () => {
    const prev = {
      name: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    process.env.CLOUDINARY_CLOUD_NAME = "do6ovetpn";
    process.env.CLOUDINARY_API_KEY = "";
    process.env.CLOUDINARY_API_SECRET = "test-secret";

    const { token } = await registerTenant(app);
    const res = await request(app)
      .post("/api/v1/rental/admin/products/images")
      .set(bearer(token))
      .attach("file", Buffer.from("fake-image-bytes"), { filename: "x.png", contentType: "image/png" });

    expect(res.status).toBe(424);
    expect(res.body.error).toBe("PROVIDER_NOT_CONFIGURED");

    process.env.CLOUDINARY_CLOUD_NAME = prev.name;
    process.env.CLOUDINARY_API_KEY = prev.key;
    process.env.CLOUDINARY_API_SECRET = prev.secret;
  });

  it("rejects non-image mime", async () => {
    const { token } = await registerTenant(app);
    const res = await request(app)
      .post("/api/v1/rental/admin/products/images")
      .set(bearer(token))
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
  });
});
