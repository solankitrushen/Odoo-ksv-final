import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { getRentalApp, registerTenant, bearer, uniqueSlug } from "../helpers/rentalApp.js";

async function registerAndVerify(app, slug, { email, phone, password = "Customer@1234", displayName = "Portal User" }) {
  process.env.RENTAL_OTP_DEV_ECHO = "true";
  const reg = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/register`)
    .send({ email, phone, password, displayName });
  expect(reg.status).toBe(201);
  expect(reg.body.data.tokens).toBeUndefined();
  expect(reg.body.data.emailVerified).toBe(false);
  expect(reg.body.data.devCode).toMatch(/^\d{6}$/);

  const verify = await request(app)
    .post(`/api/v1/rental/public/${slug}/auth/verify-email`)
    .send({ email, code: reg.body.data.devCode });
  expect(verify.status).toBe(200);
  expect(verify.body.data.tokens.accessToken).toBeTruthy();
  expect(verify.body.data.emailVerified).toBe(true);
  return { reg: reg.body.data, verify: verify.body.data, token: verify.body.data.tokens.accessToken };
}

describe("Rental customer auth realm (SPEC-RMS-AUTH-001)", () => {
  let app;
  beforeAll(async () => {
    app = await getRentalApp();
  });

  it("registers without tokens, requires email verify, then login + /me", async () => {
    const { slug } = await registerTenant(app);
    const phone = `+91900${Math.floor(Math.random() * 10000000)}`;
    const email = `user${Math.floor(Math.random() * 10000000)}@test.com`;
    const { token, verify } = await registerAndVerify(app, slug, { email, phone });

    const login = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/login`)
      .send({ email, password: "Customer@1234" });
    expect(login.status).toBe(200);
    expect(login.body.data.customerId).toBe(verify.customerId);

    const me = await request(app).get("/api/v1/rental/customer/me").set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data.customer.id).toBe(verify.customerId);
    expect(me.body.data.customer.emailVerified).toBe(true);
  });

  it("blocks password login until email is verified", async () => {
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const { slug } = await registerTenant(app);
    const email = `unverified${Math.floor(Math.random() * 10000000)}@test.com`;
    const reg = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email, password: "Customer@1234" });
    expect(reg.status).toBe(201);

    const login = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/login`)
      .send({ email, password: "Customer@1234" });
    expect(login.status).toBe(403);
    expect(login.body.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("registers with email only and supports resend verification", async () => {
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const { slug } = await registerTenant(app);
    const email = `emailonly${Math.floor(Math.random() * 10000000)}@test.com`;
    const reg = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email, password: "Customer@1234", displayName: "Email Only" });
    expect(reg.status).toBe(201);

    const resend = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/resend-verification`)
      .send({ email });
    expect(resend.status).toBe(200);
    expect(resend.body.data.devCode).toMatch(/^\d{6}$/);

    const verify = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/verify-email`)
      .send({ email, code: resend.body.data.devCode });
    expect(verify.status).toBe(200);

    const login = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/login`)
      .send({ email, password: "Customer@1234" });
    expect(login.status).toBe(200);
  });

  it("rejects wrong password and an admin token on customer routes", async () => {
    const { slug, token: adminToken } = await registerTenant(app);
    const email = `user${Math.floor(Math.random() * 10000000)}@test.com`;
    await registerAndVerify(app, slug, { email });

    const bad = await request(app).post(`/api/v1/rental/public/${slug}/auth/login`).send({ email, password: "wrong" });
    expect(bad.status).toBe(401);

    const me = await request(app).get("/api/v1/rental/customer/me").set(bearer(adminToken));
    expect(me.status).toBe(401);
  });

  it("OTP login works after email verification (dev echo)", async () => {
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const { slug } = await registerTenant(app);
    const email = `otp${Math.floor(Math.random() * 10000000)}@test.com`;
    await registerAndVerify(app, slug, { email });

    const reqOtp = await request(app).post(`/api/v1/rental/public/${slug}/auth/otp/request`).send({ email });
    expect(reqOtp.status).toBe(200);
    expect(reqOtp.body.data.channel).toBe("email");
    expect(reqOtp.body.data.devCode).toMatch(/^\d{6}$/);

    const verify = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/otp/verify`)
      .send({ email, otp: reqOtp.body.data.devCode });
    expect(verify.status).toBe(200);
    expect(verify.body.data.tokens.accessToken).toBeTruthy();
  });

  it("OTP request for unverified account does not leak a code", async () => {
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const { slug } = await registerTenant(app);
    const email = `otpblock${Math.floor(Math.random() * 10000000)}@test.com`;
    await request(app).post(`/api/v1/rental/public/${slug}/auth/register`).send({ email, password: "Customer@1234" });

    const reqOtp = await request(app).post(`/api/v1/rental/public/${slug}/auth/otp/request`).send({ email });
    expect(reqOtp.status).toBe(200);
    expect(reqOtp.body.data.devCode).toBeUndefined();
  });

  it("rejects customer JWT on admin routes", async () => {
    const { slug } = await registerTenant(app);
    const email = `custadmin${Math.floor(Math.random() * 10000000)}@test.com`;
    const { token } = await registerAndVerify(app, slug, { email });

    const res = await request(app).get("/api/v1/rental/admin/customers").set(bearer(token));
    expect(res.status).toBe(401);
  });

  it("re-register unverified email resends verify code; verified email → 409", async () => {
    const { slug } = await registerTenant(app);
    const email = `dup${Math.floor(Math.random() * 10000000)}@test.com`;
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const first = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email, password: "Customer@1234" });
    expect(first.status).toBe(201);

    const resume = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email, password: "Customer@9999", displayName: "Resumed" });
    expect(resume.status).toBe(201);
    expect(resume.body.data.verification.resumed).toBe(true);
    expect(resume.body.data.devCode).toMatch(/^\d{6}$/);

    const verify = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/verify-email`)
      .send({ email, code: resume.body.data.devCode });
    expect(verify.status).toBe(200);

    const afterVerified = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email, password: "Customer@1234" });
    expect(afterVerified.status).toBe(409);
    expect(afterVerified.body.message).toMatch(/Email already registered/i);
  });

  it("duplicate phone across accounts → 409 with phone message", async () => {
    const { slug } = await registerTenant(app);
    process.env.RENTAL_OTP_DEV_ECHO = "true";
    const phone = `+91988${Math.floor(Math.random() * 10000000)}`;
    const a = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email: `phona${Math.floor(Math.random() * 1e7)}@test.com`, phone, password: "Customer@1234" });
    expect(a.status).toBe(201);
    const b = await request(app)
      .post(`/api/v1/rental/public/${slug}/auth/register`)
      .send({ email: `phonb${Math.floor(Math.random() * 1e7)}@test.com`, phone, password: "Customer@1234" });
    expect(b.status).toBe(409);
    expect(b.body.message).toMatch(/Phone already registered/i);
  });

  it("public catalog is readable by tenant slug, unknown slug → 404", async () => {
    const { slug } = await registerTenant(app);
    const ok = await request(app).get(`/api/v1/rental/public/${slug}/catalog`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.tenantSlug).toBe(slug);
    const missing = await request(app).get(`/api/v1/rental/public/${uniqueSlug("zz")}/catalog`);
    expect(missing.status).toBe(404);
  });
});
