// SPEC-RMS-AUTH-001: portal customer register, email verify, password + OTP login.
import crypto from "crypto";
import { RentalCustomer, RentalCustomerAuth, RentalIdentityClaim } from "../schema/index.js";
import { generateTokens } from "../../Auth/jwtUtils.js";
import { withRentalTransaction } from "../db/tx.js";
import { nextSequence, formatNumber, writeAudit } from "./infra.js";
import { normalizePhone, normalizeEmail } from "./customerService.js";
import { RENTAL_REALM, RENTAL_CUSTOMER_ROLE } from "../constants.js";
import { rentalError } from "../errors.js";
import { isSmtpConfigured, sendRentalAuthEmail } from "./rentalMail.js";
import { logger } from "../../Utils/logger.js";

const VERIFY_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function otpPepper() {
  return process.env.RENTAL_OTP_PEPPER || process.env.JWT_SECRET || "rental";
}

function hashChallenge(tenantId, email, code, purpose) {
  // Always stringify tenantId — ObjectId vs string must not diverge between issue/verify.
  return crypto
    .createHmac("sha256", otpPepper())
    .update(`${purpose}:${String(tenantId)}:${email}:${String(code).trim()}`)
    .digest("hex");
}

function normalizeOtpDigits(code) {
  return String(code ?? "").replace(/\D/g, "");
}

function timingSafeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function sixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function allowDevEcho() {
  return process.env.NODE_ENV !== "production" && process.env.RENTAL_OTP_DEV_ECHO === "true";
}

function requireSmtpForSend() {
  if (process.env.NODE_ENV === "test") return;
  if (!isSmtpConfigured()) {
    throw rentalError("PROVIDER_NOT_CONFIGURED", "Email delivery is not configured");
  }
}

function issueToken(auth) {
  const sessionId = crypto.randomUUID();
  const tokens = generateTokens(
    String(auth._id),
    RENTAL_CUSTOMER_ROLE,
    auth.email || null,
    sessionId,
    auth.credentialsVersion || 0,
    { realm: RENTAL_REALM.CUSTOMER, tenantId: String(auth.tenantId), customerId: String(auth.customerId) }
  );
  return { tokens, sessionId };
}

function maskTail(s) {
  const str = String(s);
  return str.length <= 4 ? "***" : `***${str.slice(-4)}`;
}

async function deliverCode({ to, code, name, purpose }) {
  requireSmtpForSend();
  const result = await sendRentalAuthEmail({ to, code, name, purpose });
  return result.skipped ? "skipped" : "sent";
}

/**
 * Deliver an auth code without blocking the HTTP response.
 *
 * The code is always persisted BEFORE this is called, so we must never make the
 * client wait on SMTP. Hostinger sends take ~6s and can exceed the client's
 * request timeout — when that happened during register the account was created
 * but the signup UI stayed stuck on the details step (the fetch aborted, so the
 * verify transition never ran). Failures are logged; the client can "Resend code".
 */
function deliverCodeInBackground({ to, code, name, purpose }) {
  Promise.resolve()
    .then(() => deliverCode({ to, code, name, purpose }))
    .catch((err) => {
      logger.error("Auth code delivery failed (async)", {
        to,
        purpose,
        error: err?.message,
      });
    });
}

function withDevEcho(payload, code) {
  if (allowDevEcho()) payload.devCode = code;
  return payload;
}

/** Ensure claim is free; reclaim orphans (customer with no portal auth). */
async function assertClaimAvailable(tenantId, claimType, normalizedValue, session) {
  const claim = await RentalIdentityClaim.findOne({
    tenantId,
    claimType,
    normalizedValue,
    state: "active",
  }).session(session || null);
  if (!claim) return;

  const auth = await RentalCustomerAuth.findOne({ tenantId, customerId: claim.customerId }).session(
    session || null
  );
  if (!auth) {
    claim.state = "released";
    claim.releasedAt = new Date();
    claim.releaseReason = "orphan_reclaim";
    claim.version = (claim.version || 0) + 1;
    await claim.save(session ? { session } : undefined);
    return;
  }

  const label = claimType === "phone" ? "Phone" : "Email";
  throw rentalError("CUSTOMER_DUPLICATE", `${label} already registered`, { claimType });
}

async function issueAndDeliverVerify(tenantId, auth, customer, email) {
  const code = sixDigitCode();
  const emailVerifyHash = hashChallenge(tenantId, email, code, "email-verify");
  const emailVerifyExpiresAt = new Date(Date.now() + VERIFY_TTL_MS);
  auth.emailVerifyHash = emailVerifyHash;
  auth.emailVerifyExpiresAt = emailVerifyExpiresAt;
  auth.emailVerifyAttempts = 0;
  await auth.save();

  deliverCodeInBackground({
    to: email,
    code,
    name: customer?.displayName || "Customer",
    purpose: "email-verify",
  });

  return withDevEcho(
    {
      customerId: String(auth.customerId),
      tenantId: String(tenantId),
      emailVerified: false,
      verification: { requested: true, channel: "email", delivery: "pending", resumed: true },
    },
    code
  );
}

/**
 * Unverified email already registered: refresh password/name/phone and resend verify code
 * instead of 409 (retry after SMTP hiccup / abandoned verify step).
 */
async function resumeUnverifiedRegister(tenantId, auth, input, phone) {
  requireSmtpForSend();

  const email = auth.email;
  await withRentalTransaction(async (session) => {
    const customer = await RentalCustomer.findOne({ _id: auth.customerId, tenantId }).session(session);
    if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");

    if (input.displayName?.trim()) {
      customer.displayName = input.displayName.trim();
    }

    if (phone && phone !== auth.phone) {
      await assertClaimAvailable(tenantId, "phone", phone, session);
      await RentalIdentityClaim.updateMany(
        { tenantId, customerId: customer._id, claimType: "phone", state: "active" },
        {
          $set: { state: "released", releasedAt: new Date(), releaseReason: "register_resume" },
          $inc: { version: 1 },
        },
        { session }
      );
      try {
        await RentalIdentityClaim.create(
          [{ tenantId, customerId: customer._id, claimType: "phone", normalizedValue: phone, state: "active" }],
          { session }
        );
      } catch (err) {
        if (err?.code === 11000) {
          throw rentalError("CUSTOMER_DUPLICATE", "Phone already registered", { claimType: "phone" });
        }
        throw err;
      }
      auth.phone = phone;
      customer.phoneMasked = maskTail(phone);
    }

    auth.password = input.password;
    auth.emailVerified = false;
    auth.isActive = true;
    auth.credentialsVersion = (auth.credentialsVersion || 0) + 1;
    auth.version = (auth.version || 0) + 1;
    await auth.save({ session });
    customer.version = (customer.version || 0) + 1;
    await customer.save({ session });

    await writeAudit(
      {
        tenantId,
        actorType: "customer",
        actorId: String(customer._id),
        action: "customer.register_resume",
        resourceType: "RentalCustomerAuth",
        resourceId: String(auth._id),
      },
      session
    );
  });

  const customer = await RentalCustomer.findById(auth.customerId).select("displayName").lean();
  // Reload auth for challenge write outside the tx (select secrets).
  const fresh = await RentalCustomerAuth.findById(auth._id).select("+emailVerifyHash +password");
  return issueAndDeliverVerify(tenantId, fresh, customer, email);
}

/** Register customer + auth. Does not issue tokens until email is verified. */
export async function registerCustomer(tenantId, input) {
  const email = normalizeEmail(input.email);
  if (!email) throw rentalError("VALIDATION_ERROR", "Email is required");
  const phoneRaw = input.phone ? normalizePhone(input.phone) : null;
  const phone = phoneRaw || null;
  if (input.phone && !phone) {
    throw rentalError("VALIDATION_ERROR", "Phone number is invalid");
  }
  if (!input.password || String(input.password).length < 8) {
    throw rentalError("VALIDATION_ERROR", "Password must be at least 8 characters");
  }

  // Non-test: refuse register if we cannot deliver verification email.
  requireSmtpForSend();

  const existing = await RentalCustomerAuth.findOne({ tenantId, email }).select("+emailVerifyHash +password");
  if (existing) {
    if (!existing.isActive) {
      throw rentalError("CUSTOMER_DUPLICATE", "Email already registered", { claimType: "email" });
    }
    if (existing.emailVerified) {
      throw rentalError("CUSTOMER_DUPLICATE", "Email already registered", { claimType: "email" });
    }
    return resumeUnverifiedRegister(tenantId, existing, input, phone);
  }

  const code = sixDigitCode();
  const verifyHash = hashChallenge(tenantId, email, code, "email-verify");
  const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS);

  const out = await withRentalTransaction(async (session) => {
    await assertClaimAvailable(tenantId, "email", email, session);
    if (phone) await assertClaimAvailable(tenantId, "phone", phone, session);

    const seq = await nextSequence(tenantId, "customer", session);
    const [customer] = await RentalCustomer.create(
      [
        {
          tenantId,
          customerNumber: formatNumber("CUST", "customer", seq),
          type: input.type || "person",
          displayName: input.displayName || email.split("@")[0],
          phoneMasked: phone ? maskTail(phone) : null,
          emailMasked: maskTail(email),
          status: "active",
        },
      ],
      { session }
    );

    try {
      await RentalIdentityClaim.create(
        [{ tenantId, customerId: customer._id, claimType: "email", normalizedValue: email, state: "active" }],
        { session }
      );
    } catch (err) {
      if (err?.code === 11000) {
        throw rentalError("CUSTOMER_DUPLICATE", "Email already registered", { claimType: "email" });
      }
      throw err;
    }

    if (phone) {
      try {
        await RentalIdentityClaim.create(
          [{ tenantId, customerId: customer._id, claimType: "phone", normalizedValue: phone, state: "active" }],
          { session }
        );
      } catch (err) {
        if (err?.code === 11000) {
          throw rentalError("CUSTOMER_DUPLICATE", "Phone already registered", { claimType: "phone" });
        }
        throw err;
      }
    }

    const [auth] = await RentalCustomerAuth.create(
      [
        {
          tenantId,
          customerId: customer._id,
          email,
          phone,
          password: input.password,
          emailVerified: false,
          emailVerifyHash: verifyHash,
          emailVerifyExpiresAt: verifyExpires,
          emailVerifyAttempts: 0,
        },
      ],
      { session }
    );
    await writeAudit(
      {
        tenantId,
        actorType: "customer",
        actorId: String(customer._id),
        action: "customer.register",
        resourceType: "RentalCustomerAuth",
        resourceId: String(auth._id),
      },
      session
    );
    return { customer, auth };
  });

  // Deliver the code without blocking the response — the account and verify code
  // are already committed above. Blocking on SMTP (~6s, sometimes >8s) caused the
  // client request to abort, leaving the account created but the signup UI stuck
  // on the details step (never advancing to email verification).
  deliverCodeInBackground({
    to: email,
    code,
    name: out.customer.displayName,
    purpose: "email-verify",
  });

  return withDevEcho(
    {
      customerId: String(out.customer._id),
      tenantId: String(tenantId),
      emailVerified: false,
      verification: { requested: true, channel: "email", delivery: "pending" },
    },
    code
  );
}

/** Verify email with code; on success issues customer tokens. */
export async function verifyCustomerEmail(tenantId, { email, code }) {
  const norm = normalizeEmail(email);
  const auth = await RentalCustomerAuth.findOne({ tenantId, email: norm }).select(
    "+emailVerifyHash +password"
  );
  if (!auth || !auth.isActive) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "Verification code invalid or expired");
  }
  // Already verified: issue tokens without requiring a leftover challenge hash.
  if (auth.emailVerified) {
    const { tokens } = issueToken(auth);
    return { customerId: String(auth.customerId), tokens, tenantId: String(tenantId), emailVerified: true };
  }
  if (!auth.emailVerifyHash || !auth.emailVerifyExpiresAt) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "Verification code invalid or expired");
  }
  if (auth.emailVerifyExpiresAt.getTime() < Date.now() || auth.emailVerifyAttempts >= MAX_ATTEMPTS) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "Verification code invalid or expired");
  }
  const digits = normalizeOtpDigits(code);
  if (digits.length < 4) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "Verification code invalid or expired");
  }
  const expected = hashChallenge(tenantId, norm, digits, "email-verify");
  if (!timingSafeEqualHex(expected, auth.emailVerifyHash)) {
    auth.emailVerifyAttempts += 1;
    await auth.save();
    throw rentalError("OTP_INVALID_OR_EXPIRED", "Verification code invalid or expired");
  }
  auth.emailVerified = true;
  auth.emailVerifyHash = null;
  auth.emailVerifyExpiresAt = null;
  auth.emailVerifyAttempts = 0;
  auth.lastLoginAt = new Date();
  await auth.save();
  await writeAudit({
    tenantId,
    actorType: "customer",
    actorId: String(auth.customerId),
    action: "customer.email_verified",
    resourceType: "RentalCustomerAuth",
    resourceId: String(auth._id),
  });
  const { tokens } = issueToken(auth);
  return { customerId: String(auth.customerId), tokens, tenantId: String(tenantId), emailVerified: true };
}

/** Resend verification email. Generic accepted when account missing/already verified. */
export async function resendCustomerVerification(tenantId, { email }) {
  const norm = normalizeEmail(email);
  const generic = { requested: true, channel: "email" };
  const auth = await RentalCustomerAuth.findOne({ tenantId, email: norm }).select("+emailVerifyHash");
  if (!auth || !auth.isActive || auth.emailVerified || !norm) {
    return generic;
  }

  requireSmtpForSend();

  const code = sixDigitCode();
  const emailVerifyHash = hashChallenge(tenantId, norm, code, "email-verify");
  const emailVerifyExpiresAt = new Date(Date.now() + VERIFY_TTL_MS);
  await RentalCustomerAuth.updateOne(
    { _id: auth._id },
    { $set: { emailVerifyHash, emailVerifyExpiresAt, emailVerifyAttempts: 0 } },
  );

  try {
    const customer = await RentalCustomer.findById(auth.customerId).select("displayName").lean();
    const delivery = await deliverCode({
      to: norm,
      code,
      name: customer?.displayName || "Customer",
      purpose: "email-verify",
    });
    await writeAudit({
      tenantId,
      actorType: "customer",
      actorId: String(auth.customerId),
      action: "customer.verification_resent",
      resourceType: "RentalCustomerAuth",
      resourceId: String(auth._id),
    });
    return withDevEcho({ ...generic, issued: true, delivery }, code);
  } catch (err) {
    await RentalCustomerAuth.updateOne(
      { _id: auth._id, emailVerifyHash },
      { $set: { emailVerifyHash: null, emailVerifyExpiresAt: null, emailVerifyAttempts: 0 } },
    );
    throw err;
  }
}

export async function loginCustomer(tenantId, { email, password }) {
  const norm = normalizeEmail(email);
  const auth = await RentalCustomerAuth.findOne({ tenantId, email: norm }).select("+password");
  if (!auth || !auth.isActive || !auth.password) {
    throw rentalError("UNAUTHORIZED", "Invalid credentials");
  }
  const ok = await auth.comparePassword(password);
  if (!ok) throw rentalError("UNAUTHORIZED", "Invalid credentials");
  if (!auth.emailVerified) {
    throw rentalError("EMAIL_NOT_VERIFIED", "Verify your email before logging in");
  }
  auth.lastLoginAt = new Date();
  await auth.save();
  await writeAudit({
    tenantId,
    actorType: "customer",
    actorId: String(auth.customerId),
    action: "customer.login",
    resourceType: "RentalCustomerAuth",
    resourceId: String(auth._id),
  });
  const { tokens } = issueToken(auth);
  return { customerId: String(auth.customerId), tokens, tenantId: String(tenantId), emailVerified: true };
}

/**
 * Request login OTP.
 * Only issues + emails a code when the account exists, is active, and emailVerified.
 * Otherwise returns a generic `{ issued: false }` (no existence leak, no email).
 */
export async function requestCustomerOtp(tenantId, { email }) {
  const norm = normalizeEmail(email);
  const generic = { requested: true, issued: false, channel: "email" };
  const auth = await RentalCustomerAuth.findOne({ tenantId, email: norm }).select("+otpHash");
  if (!auth || !auth.isActive || !auth.emailVerified || !norm) {
    return generic;
  }

  requireSmtpForSend();

  const otp = sixDigitCode();
  const otpHash = hashChallenge(tenantId, norm, otp, "login-otp");
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Atomic write so the emailed code is exactly what verify will accept.
  await RentalCustomerAuth.updateOne(
    { _id: auth._id },
    { $set: { otpHash, otpExpiresAt, otpAttempts: 0 } },
  );

  try {
    const customer = await RentalCustomer.findById(auth.customerId).select("displayName").lean();
    const delivery = await deliverCode({
      to: norm,
      code: otp,
      name: customer?.displayName || "Customer",
      purpose: "login-otp",
    });
    await writeAudit({
      tenantId,
      actorType: "customer",
      actorId: String(auth.customerId),
      action: "customer.otp_requested",
      resourceType: "RentalCustomerAuth",
      resourceId: String(auth._id),
    });
    return withDevEcho({ ...generic, issued: true, delivery }, otp);
  } catch (err) {
    // Roll back only this issue — don't wipe a newer concurrent OTP.
    await RentalCustomerAuth.updateOne(
      { _id: auth._id, otpHash },
      { $set: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } },
    );
    throw err;
  }
}

export async function verifyCustomerOtp(tenantId, { email, otp }) {
  const norm = normalizeEmail(email);
  const digits = normalizeOtpDigits(otp);
  const auth = await RentalCustomerAuth.findOne({ tenantId, email: norm }).select("+otpHash");
  if (!auth || !auth.isActive || !auth.emailVerified) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "OTP invalid or expired");
  }
  if (!auth.otpHash || !auth.otpExpiresAt) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "OTP invalid or expired");
  }
  if (auth.otpExpiresAt.getTime() < Date.now() || auth.otpAttempts >= MAX_ATTEMPTS) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "OTP invalid or expired");
  }
  if (digits.length < 4) {
    throw rentalError("OTP_INVALID_OR_EXPIRED", "OTP invalid or expired");
  }
  const expected = hashChallenge(tenantId, norm, digits, "login-otp");
  if (!timingSafeEqualHex(expected, auth.otpHash)) {
    auth.otpAttempts += 1;
    await auth.save();
    throw rentalError("OTP_INVALID_OR_EXPIRED", "OTP invalid or expired");
  }
  auth.otpHash = null;
  auth.otpExpiresAt = null;
  auth.otpAttempts = 0;
  auth.lastLoginAt = new Date();
  await auth.save();
  await writeAudit({
    tenantId,
    actorType: "customer",
    actorId: String(auth.customerId),
    action: "customer.otp_login",
    resourceType: "RentalCustomerAuth",
    resourceId: String(auth._id),
  });
  const { tokens } = issueToken(auth);
  return { customerId: String(auth.customerId), tokens, tenantId: String(tenantId), emailVerified: true };
}

/**
 * Admin provisions portal login for a customer (create or reset auth credentials).
 * Sends SMTP email-verify code; account cannot login until verified.
 */
export async function provisionPortalAccess(tenantId, customerId, { email, password }, actor) {
  const norm = normalizeEmail(email);
  if (!norm) throw rentalError("VALIDATION_ERROR", "Email is required");
  if (!password || String(password).length < 8) {
    throw rentalError("VALIDATION_ERROR", "Password must be at least 8 characters");
  }

  requireSmtpForSend();

  const customer = await RentalCustomer.findOne({ _id: customerId, tenantId });
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  if (customer.status !== "active") {
    throw rentalError("INVALID_STATE_TRANSITION", "Customer is not active");
  }

  const code = sixDigitCode();
  const verifyHash = hashChallenge(tenantId, norm, code, "email-verify");
  const verifyExpires = new Date(Date.now() + VERIFY_TTL_MS);

  await withRentalTransaction(async (session) => {
    let auth = await RentalCustomerAuth.findOne({ tenantId, customerId }).session(session);
    if (auth) {
      const emailClash = await RentalCustomerAuth.findOne({
        tenantId,
        email: norm,
        customerId: { $ne: customerId },
      }).session(session);
      if (emailClash) throw rentalError("CUSTOMER_DUPLICATE", "Email already registered");

      await RentalIdentityClaim.updateMany(
        { tenantId, customerId, claimType: "email", state: "active" },
        { $set: { state: "released", releasedAt: new Date(), releaseReason: "admin_portal_provision" }, $inc: { version: 1 } },
        { session }
      );
      try {
        await RentalIdentityClaim.create(
          [{ tenantId, customerId, claimType: "email", normalizedValue: norm, state: "active" }],
          { session }
        );
      } catch (err) {
        if (err?.code === 11000) throw rentalError("CUSTOMER_DUPLICATE", "Email already registered");
        throw err;
      }

      auth.email = norm;
      auth.password = password;
      auth.emailVerified = false;
      auth.emailVerifyHash = verifyHash;
      auth.emailVerifyExpiresAt = verifyExpires;
      auth.emailVerifyAttempts = 0;
      auth.credentialsVersion = (auth.credentialsVersion || 0) + 1;
      auth.isActive = true;
      auth.version += 1;
      await auth.save({ session });
    } else {
      const existingClaim = await RentalIdentityClaim.findOne({
        tenantId,
        claimType: "email",
        normalizedValue: norm,
        state: "active",
      }).session(session);
      if (existingClaim && String(existingClaim.customerId) !== String(customerId)) {
        throw rentalError("CUSTOMER_DUPLICATE", "Email already registered");
      }
      if (!existingClaim) {
        await RentalIdentityClaim.create(
          [{ tenantId, customerId, claimType: "email", normalizedValue: norm, state: "active" }],
          { session }
        );
      }
      const [created] = await RentalCustomerAuth.create(
        [
          {
            tenantId,
            customerId,
            email: norm,
            password,
            emailVerified: false,
            emailVerifyHash: verifyHash,
            emailVerifyExpiresAt: verifyExpires,
            emailVerifyAttempts: 0,
          },
        ],
        { session }
      );
      auth = created;
    }

    customer.emailMasked = maskTail(norm);
    customer.version += 1;
    await customer.save({ session });

    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "customer.portal_provision",
        resourceType: "RentalCustomerAuth",
        resourceId: String(auth._id),
      },
      session
    );
  });

  const delivery = await deliverCode({
    to: norm,
    code,
    name: customer.displayName,
    purpose: "email-verify",
  });

  return withDevEcho(
    {
      customerId: String(customerId),
      emailVerified: false,
      verification: { requested: true, channel: "email", delivery },
    },
    code
  );
}

