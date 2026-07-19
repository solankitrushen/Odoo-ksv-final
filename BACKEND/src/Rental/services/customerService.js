// SPEC-RMS-001-IDC customer records + identity claims (transactional uniqueness).
import {
  RentalCustomer,
  RentalIdentityClaim,
  RentalCustomerAuth,
  RentalOrder,
  RentalInvoice,
} from "../schema/index.js";
import { withRentalTransaction } from "../db/tx.js";
import { writeAudit, nextSequence, formatNumber, guardIdempotency, storeIdempotency } from "./infra.js";
import { rentalError } from "../errors.js";

export function normalizeEmail(v) {
  return String(v).trim().toLowerCase();
}

/** E.164-ish: keep leading +, strip other non-digits; IN 10-digit → +91… */
export function normalizePhone(v) {
  const cleaned = String(v ?? "").replace(/[\s\-()]/g, "");
  if (!cleaned) return "";
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  const digits = cleaned.replace(/[^\d+]/g, "");
  if (!digits || digits === "+") return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}
export function normalizeGstin(v) {
  return String(v).trim().toUpperCase();
}

function mask(value, keep = 2) {
  const s = String(value || "");
  if (s.length <= keep) return "*".repeat(s.length);
  return s.slice(0, keep) + "*".repeat(Math.max(2, s.length - keep - 2)) + s.slice(-2);
}

/** Build the active claim documents for a customer create/update. */
export function buildClaims(tenantId, customerId, { email, phone, gstin }) {
  const claims = [];
  if (email) claims.push({ tenantId, customerId, claimType: "email", normalizedValue: normalizeEmail(email), state: "active" });
  if (phone) claims.push({ tenantId, customerId, claimType: "phone", normalizedValue: normalizePhone(phone), state: "active" });
  if (gstin) claims.push({ tenantId, customerId, claimType: "gstin", normalizedValue: normalizeGstin(gstin), state: "active" });
  return claims;
}

export async function createCustomer(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "customer.create", key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const out = await withRentalTransaction(async (session) => {
    const seq = await nextSequence(tenantId, "customer", session);
    const doc = {
      tenantId,
      customerNumber: formatNumber("CUST", "customer", seq),
      type: input.type || "person",
      displayName: input.displayName,
      legalName: input.legalName || null,
      emailMasked: input.email ? mask(input.email) : null,
      phoneMasked: input.phone ? mask(input.phone) : null,
      gstinMasked: input.gstin ? mask(input.gstin) : null,
      contacts: input.contacts || [],
      addresses: input.addresses || [],
      tags: input.tags || [],
      notes: input.notes || null,
      externalRef: input.externalRef || null,
      status: "active",
      version: 0,
    };
    const [customer] = await RentalCustomer.create([doc], { session });
    const claims = buildClaims(tenantId, customer._id, input);
    try {
      if (claims.length) await RentalIdentityClaim.create(claims, { session });
    } catch (err) {
      if (err?.code === 11000) {
        throw rentalError("CUSTOMER_DUPLICATE", "Identity already in use", { claimType: detectDupClaim(err) });
      }
      throw err;
    }
    await writeAudit(
      { tenantId, actorType: actor.type, actorId: actor.id, action: "customer.create", resourceType: "RentalCustomer", resourceId: String(customer._id), resourceVersion: 0 },
      session
    );
    const response = { customer: customer.toObject() };
    await storeIdempotency(
      { tenantId, actorType: actor.type, actorId: actor.id, scope: "customer.create", key: idempotencyKey, body: input, statusCode: 201, response },
      session
    );
    return response;
  });
  return out;
}

function detectDupClaim(err) {
  const key = err?.keyValue || {};
  return key.claimType || "identity";
}

/** Admin list/detail: join clear email/phone/gstin from identity claims (+ auth). */
async function hydrateClearContacts(tenantId, items) {
  if (!items.length) return items;
  const ids = items.map((c) => c._id);
  const [claims, auths] = await Promise.all([
    RentalIdentityClaim.find({ tenantId, customerId: { $in: ids }, state: "active" }).lean(),
    RentalCustomerAuth.find({ tenantId, customerId: { $in: ids } }).select("customerId email phone").lean(),
  ]);
  const claimMap = new Map();
  for (const c of claims) {
    const key = String(c.customerId);
    if (!claimMap.has(key)) claimMap.set(key, {});
    claimMap.get(key)[c.claimType] = c.normalizedValue;
  }
  const authMap = new Map(auths.map((a) => [String(a.customerId), a]));
  return items.map((c) => {
    const id = String(c._id);
    const byType = claimMap.get(id) || {};
    const auth = authMap.get(id);
    return {
      ...c,
      email: byType.email || auth?.email || null,
      phone: byType.phone || auth?.phone || null,
      gstin: byType.gstin || null,
      portalAccess: Boolean(auth),
    };
  });
}

async function buildCustomerActivity(tenantId, customerId) {
  const rentals = await RentalOrder.find({ tenantId, customerId })
    .select(
      "rentalNumber status startAt endAt plannedEndAt actualReturnedAt balanceDuePaise settlementShortfallPaise depositLiabilityPaise lateFeePaise lateGstPaise lines chargeGrossPaise paymentsPaise createdAt"
    )
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  let overdueCount = 0;
  let openBalancePaise = 0;
  let rentCollectedPaise = 0;
  let depositHeldPaise = 0;
  let lateFeeTotalPaise = 0;
  const productMap = new Map();
  for (const r of rentals) {
    if (r.status === "overdue") overdueCount += 1;
    // Live ledger balance is source of truth (shortfall is kept in sync on closed rentals).
    const due = Math.max(0, r.balanceDuePaise || 0);
    if (due > 0 && !["cancelled", "draft"].includes(r.status)) {
      openBalancePaise += due;
    }
    if (!["cancelled", "draft"].includes(r.status)) {
      rentCollectedPaise += Math.max(0, r.paymentsPaise || 0);
    }
    if ((r.depositLiabilityPaise || 0) > 0 && !["cancelled", "draft", "closed"].includes(r.status)) {
      depositHeldPaise += r.depositLiabilityPaise || 0;
    }
    lateFeeTotalPaise += (r.lateFeePaise || 0) + (r.lateGstPaise || 0);
    for (const line of r.lines || []) {
      const name = line.nameSnapshot || "Item";
      const cur = productMap.get(name) || { name, units: 0, rentalCount: 0 };
      cur.units += line.quantity || 0;
      cur.rentalCount += 1;
      productMap.set(name, cur);
    }
  }
  const lastInvoice = await RentalInvoice.findOne({ tenantId, customerId })
    .sort({ issuedAt: -1, createdAt: -1 })
    .select("invoiceNumber type issuedAt totals rentalId status")
    .lean();

  let lastInvoiceDuePaise = lastInvoice?.totals?.balanceDuePaise ?? null;
  let lastInvoiceChargePaise = lastInvoice?.totals?.chargeGrossPaise ?? null;
  // Prefer live rental outstanding over frozen invoice snapshot (avoids Due ₹999 vs Balance due ₹0).
  if (lastInvoice?.rentalId) {
    const live = await RentalOrder.findOne({ _id: lastInvoice.rentalId, tenantId })
      .select("balanceDuePaise settlementShortfallPaise status")
      .lean();
    if (live) {
      lastInvoiceDuePaise = Math.max(0, live.balanceDuePaise || 0);
    }
  }

  return {
    rentalCount: rentals.length,
    overdueCount,
    openBalancePaise,
    rentCollectedPaise,
    depositHeldPaise,
    lateFeeTotalPaise,
    productHistory: [...productMap.values()].sort((a, b) => b.units - a.units).slice(0, 20),
    lastInvoice: lastInvoice
      ? {
          _id: String(lastInvoice._id),
          invoiceNumber: lastInvoice.invoiceNumber,
          type: lastInvoice.type,
          issuedAt: lastInvoice.issuedAt,
          rentalId: lastInvoice.rentalId ? String(lastInvoice.rentalId) : null,
          balanceDuePaise: lastInvoiceDuePaise,
          chargeGrossPaise: lastInvoiceChargePaise,
        }
      : null,
  };
}

export async function listCustomers(tenantId, { page = 1, limit = 25, status, q } = {}) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { displayName: { $regex: escapeRegex(q), $options: "i" } },
      { customerNumber: { $regex: escapeRegex(q), $options: "i" } },
    ];
  }
  const lim = Math.min(Math.max(1, Number(limit) || 25), 100);
  const skip = (Math.max(1, Number(page) || 1) - 1) * lim;
  const [raw, total] = await Promise.all([
    RentalCustomer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    RentalCustomer.countDocuments(filter),
  ]);
  const items = await hydrateClearContacts(tenantId, raw);
  return { items, total, page: Number(page) || 1, limit: lim };
}

export async function getCustomer(tenantId, id) {
  const customer = await RentalCustomer.findOne({ _id: id, tenantId }).lean();
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  if (customer.status === "merged" && customer.mergedInto) {
    throw rentalError("CUSTOMER_MERGED", "Customer merged", { survivorId: String(customer.mergedInto) });
  }
  const [hydrated] = await hydrateClearContacts(tenantId, [customer]);
  const activity = await buildCustomerActivity(tenantId, customer._id);
  return {
    customer: {
      ...hydrated,
      addresses: (customer.addresses || []).map(mapAddressOut),
      statusReason: customer.statusReason || null,
    },
    activity,
  };
}

export async function updateCustomer(tenantId, id, expectedVersion, input, actor) {
  await withRentalTransaction(async (session) => {
    const customer = await RentalCustomer.findOne({ _id: id, tenantId }).session(session);
    if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
    if (customer.version !== expectedVersion) {
      throw rentalError("VERSION_CONFLICT", "Stale customer version", { currentVersion: customer.version });
    }
    if (["merged", "pseudonymized"].includes(customer.status)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot edit ${customer.status} customer`);
    }

    if (input.displayName != null) customer.displayName = String(input.displayName).trim();
    if (input.type != null) customer.type = input.type;
    if (input.legalName !== undefined) customer.legalName = input.legalName || null;
    if (input.notes !== undefined) customer.notes = input.notes || null;
    if (input.tags !== undefined) customer.tags = input.tags;

    const touchIdentity =
      input.email !== undefined || input.phone !== undefined || input.gstin !== undefined;
    if (touchIdentity) {
      const email = input.email === undefined ? undefined : input.email ? normalizeEmail(input.email) : null;
      const phone = input.phone === undefined ? undefined : input.phone ? normalizePhone(input.phone) : null;
      const gstin = input.gstin === undefined ? undefined : input.gstin ? normalizeGstin(input.gstin) : null;

      for (const [claimType, value] of [
        ["email", email],
        ["phone", phone],
        ["gstin", gstin],
      ]) {
        if (value === undefined) continue;
        await RentalIdentityClaim.updateMany(
          { tenantId, customerId: customer._id, claimType, state: "active" },
          { $set: { state: "released", releasedAt: new Date(), releaseReason: "admin_update" }, $inc: { version: 1 } },
          { session }
        );
        if (value) {
          try {
            await RentalIdentityClaim.create(
              [{ tenantId, customerId: customer._id, claimType, normalizedValue: value, state: "active" }],
              { session }
            );
          } catch (err) {
            if (err?.code === 11000) {
              throw rentalError("CUSTOMER_DUPLICATE", `${claimType} already in use`);
            }
            throw err;
          }
        }
        if (claimType === "email") customer.emailMasked = value ? mask(value) : null;
        if (claimType === "phone") customer.phoneMasked = value ? mask(value) : null;
        if (claimType === "gstin") customer.gstinMasked = value ? mask(value) : null;
      }

      const auth = await RentalCustomerAuth.findOne({ tenantId, customerId: customer._id }).session(session);
      if (auth) {
        if (email !== undefined) auth.email = email;
        if (phone !== undefined) auth.phone = phone;
        auth.version += 1;
        await auth.save({ session });
      }
    }

    customer.version += 1;
    await customer.save({ session });
    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "customer.update",
        resourceType: "RentalCustomer",
        resourceId: String(customer._id),
        resourceVersion: customer.version,
      },
      session
    );
  });
  return getCustomer(tenantId, id);
}

export async function setCustomerStatus(tenantId, id, expectedVersion, status, reason, actor) {
  const reasonText = reason != null && String(reason).trim() ? String(reason).trim().slice(0, 2000) : null;
  const $set = {
    status,
    statusReason: status === "active" ? null : reasonText,
    ...(status === "archived" ? { archivedAt: new Date() } : {}),
  };
  const upd = await RentalCustomer.findOneAndUpdate(
    { _id: id, tenantId, version: expectedVersion },
    { $set, $inc: { version: 1 } },
    { new: true }
  );
  if (!upd) {
    const exists = await RentalCustomer.exists({ _id: id, tenantId });
    if (!exists) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
    throw rentalError("VERSION_CONFLICT", "Stale customer version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: `customer.${status}`, reason: reasonText,
    resourceType: "RentalCustomer", resourceId: String(id), resourceVersion: upd.version,
  });
  const [hydrated] = await hydrateClearContacts(tenantId, [upd.toObject()]);
  return { customer: hydrated };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskTail(s) {
  const str = String(s || "");
  return str.length <= 4 ? "***" : `***${str.slice(-4)}`;
}

function mapAddressOut(a) {
  return {
    id: String(a._id),
    label: a.label || "",
    fullName: a.recipient || "",
    phone: a.phone || "",
    line1: a.line1 || "",
    line2: a.line2 || "",
    city: a.city || "",
    state: a.state || "",
    pincode: a.postalCode || "",
    isDefault: Boolean(a.isDefault),
  };
}

function mapAddressIn(a) {
  return {
    ...(a.id ? { _id: a.id } : {}),
    type: "service",
    label: String(a.label || "").slice(0, 60),
    recipient: String(a.fullName || a.recipient || "").slice(0, 200),
    phone: a.phone ? normalizePhone(a.phone) : null,
    line1: String(a.line1 || "").slice(0, 300),
    line2: a.line2 ? String(a.line2).slice(0, 300) : "",
    city: String(a.city || "").slice(0, 120),
    state: String(a.state || "").slice(0, 120),
    postalCode: String(a.pincode || a.postalCode || "").slice(0, 20),
    country: "IN",
    isDefault: Boolean(a.isDefault),
  };
}

/** Customer self profile for the storefront (/customer/me). */
export async function getSelfProfile(tenantId, customerId) {
  const [customer, auth] = await Promise.all([
    RentalCustomer.findOne({ _id: customerId, tenantId }).lean(),
    RentalCustomerAuth.findOne({ customerId, tenantId }).lean(),
  ]);
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  return {
    customer: {
      id: String(customer._id),
      displayName: customer.displayName,
      type: customer.type,
      status: customer.status,
      email: auth?.email || null,
      phone: auth?.phone || null,
      emailVerified: Boolean(auth?.emailVerified),
      emailMasked: customer.emailMasked ?? null,
      phoneMasked: customer.phoneMasked ?? null,
      photoUrl: customer.photoUrl ?? null,
      addresses: (customer.addresses || []).map(mapAddressOut),
    },
  };
}

/** SPEC-001 profile photo via Cloudinary. */
export async function setSelfPhoto(tenantId, customerId, { url }, actor) {
  if (!url) throw rentalError("VALIDATION_ERROR", "photo url required");
  const customer = await RentalCustomer.findOne({ _id: customerId, tenantId });
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  if (customer.status !== "active") {
    throw rentalError("INVALID_STATE_TRANSITION", "Customer is not active");
  }
  customer.photoUrl = String(url).slice(0, 500);
  customer.version += 1;
  await customer.save();
  await writeAudit({
    tenantId,
    actorType: actor.type,
    actorId: actor.id,
    action: "customer.photo",
    resourceType: "RentalCustomer",
    resourceId: String(customer._id),
    resourceVersion: customer.version,
  });
  return getSelfProfile(tenantId, customerId);
}

/** Self-service: update display name and/or phone (login email stays immutable). */
export async function updateSelfProfile(tenantId, customerId, input, actor) {
  const displayName = input.displayName != null ? String(input.displayName).trim().slice(0, 200) : undefined;
  const phone = input.phone != null && String(input.phone).trim()
    ? normalizePhone(input.phone)
    : input.phone === "" || input.phone === null
      ? null
      : undefined;

  if (displayName !== undefined && !displayName) {
    throw rentalError("VALIDATION_ERROR", "Name is required");
  }

  return withRentalTransaction(async (session) => {
    const customer = await RentalCustomer.findOne({ _id: customerId, tenantId }).session(session);
    if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
    if (customer.status !== "active") {
      throw rentalError("INVALID_STATE_TRANSITION", "Customer is not active");
    }

    if (displayName !== undefined) customer.displayName = displayName;

    if (phone !== undefined) {
      const auth = await RentalCustomerAuth.findOne({ customerId, tenantId }).session(session);
      if (!auth) throw rentalError("RESOURCE_NOT_FOUND", "Auth record not found");

      if (phone) {
        const clash = await RentalCustomerAuth.findOne({
          tenantId,
          phone,
          customerId: { $ne: customerId },
        }).session(session);
        if (clash) throw rentalError("CUSTOMER_DUPLICATE", "Phone already in use");
      }

      // Release old phone claim, then claim the new one when set.
      await RentalIdentityClaim.updateMany(
        { tenantId, customerId, claimType: "phone", state: "active" },
        { $set: { state: "released", releasedAt: new Date(), releaseReason: "self_update" }, $inc: { version: 1 } },
        { session }
      );
      if (phone) {
        try {
          await RentalIdentityClaim.create(
            [{ tenantId, customerId, claimType: "phone", normalizedValue: phone, state: "active" }],
            { session }
          );
        } catch (err) {
          if (err?.code === 11000) throw rentalError("CUSTOMER_DUPLICATE", "Phone already in use");
          throw err;
        }
      }
      auth.phone = phone;
      auth.version += 1;
      await auth.save({ session });
      customer.phoneMasked = phone ? maskTail(phone) : null;
    }

    customer.version += 1;
    await customer.save({ session });
    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "customer.self_update",
        resourceType: "RentalCustomer", resourceId: String(customerId), resourceVersion: customer.version,
      },
      session
    );
    const authDoc = await RentalCustomerAuth.findOne({ customerId, tenantId }).session(session);
    return {
      customer: {
        id: String(customer._id),
        displayName: customer.displayName,
        type: customer.type,
        status: customer.status,
        email: authDoc?.email || null,
        phone: authDoc?.phone || null,
        emailVerified: Boolean(authDoc?.emailVerified),
        emailMasked: customer.emailMasked ?? null,
        phoneMasked: customer.phoneMasked ?? null,
        addresses: (customer.addresses || []).map(mapAddressOut),
      },
    };
  });
}

/** Replace the customer's saved address book (max 20). */
export async function replaceSelfAddresses(tenantId, customerId, addresses, actor) {
  if (!Array.isArray(addresses)) throw rentalError("VALIDATION_ERROR", "addresses must be an array");
  if (addresses.length > 20) throw rentalError("VALIDATION_ERROR", "At most 20 addresses");

  const mapped = addresses.map(mapAddressIn);
  // Exactly one default when any addresses exist.
  if (mapped.length > 0) {
    const defaults = mapped.filter((a) => a.isDefault);
    if (defaults.length === 0) mapped[0].isDefault = true;
    if (defaults.length > 1) {
      let seen = false;
      for (const a of mapped) {
        if (a.isDefault) {
          if (seen) a.isDefault = false;
          else seen = true;
        }
      }
    }
  }

  const customer = await RentalCustomer.findOneAndUpdate(
    { _id: customerId, tenantId, status: "active" },
    { $set: { addresses: mapped }, $inc: { version: 1 } },
    { new: true }
  );
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");

  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "customer.addresses_replace",
    resourceType: "RentalCustomer", resourceId: String(customerId), resourceVersion: customer.version,
  });

  return { addresses: (customer.addresses || []).map(mapAddressOut) };
}
