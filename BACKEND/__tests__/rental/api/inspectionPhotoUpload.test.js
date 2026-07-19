import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, bearer } from "../helpers/rentalApp.js";

describe("inspection photo upload (per-angle)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("rejects non-JPEG with 415", async () => {
    const { token } = await registerTenant(app);
    const res = await request(app)
      .post("/api/v1/rental/admin/rentals/000000000000000000000001/inspection/photos/front")
      .set(bearer(token))
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
  });

  it("rejects invalid angle", async () => {
    const { token } = await registerTenant(app);
    const res = await request(app)
      .post("/api/v1/rental/admin/rentals/000000000000000000000001/inspection/photos/top")
      .set(bearer(token))
      .attach("file", Buffer.from([0xff, 0xd8, 0xff]), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });
});
