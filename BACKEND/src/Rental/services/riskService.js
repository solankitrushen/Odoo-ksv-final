// SPEC-016 risk: blacklist gate helpers + incident CRUD.
import { RentalIncident, RentalCustomer, RentalOrder } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { writeAudit } from "./infra.js";

export async function assertCustomerActive(tenantId, customerId) {
  const c = await RentalCustomer.findOne({ _id: customerId, tenantId }).select("status").lean();
  if (!c) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  if (c.status === "blocked") {
    throw rentalError("CUSTOMER_BLOCKED", "Customer is blacklisted");
  }
  if (c.status !== "active") {
    throw rentalError("INVALID_STATE_TRANSITION", "Customer is not active");
  }
  return c;
}

export async function listIncidents(tenantId, { status, customerId, rentalId, limit = 50 } = {}) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (rentalId) filter.rentalId = rentalId;
  const lim = Math.min(Math.max(1, Number(limit) || 50), 100);
  const items = await RentalIncident.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
  return { items };
}

export async function createIncident(tenantId, input, actor) {
  if (input.rentalId) {
    const r = await RentalOrder.findOne({ _id: input.rentalId, tenantId }).select("customerId").lean();
    if (!r) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    if (!input.customerId) input.customerId = r.customerId;
  }
  const doc = await RentalIncident.create({
    tenantId,
    customerId: input.customerId || null,
    rentalId: input.rentalId || null,
    type: input.type,
    notes: input.notes || null,
    amountPaise: input.amountPaise || 0,
    status: "open",
  });
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "incident.create",
    resourceType: "RentalIncident", resourceId: String(doc._id), resourceVersion: 0,
  });
  return { incident: doc.toObject() };
}

/** Open incident for damage if none open for rental. */
export async function ensureDamageIncident(tenantId, { rentalId, customerId, amountPaise, notes, actor }) {
  if (!amountPaise || amountPaise <= 0) return null;
  const existing = await RentalIncident.findOne({
    tenantId,
    rentalId,
    type: "damage",
    status: { $in: ["open", "investigating"] },
  }).lean();
  if (existing) return { incident: existing, created: false };
  const out = await createIncident(
    tenantId,
    { rentalId, customerId, type: "damage", amountPaise, notes },
    actor || { type: "system", id: "inspect" }
  );
  return { ...out, created: true };
}

export async function resolveIncident(tenantId, id, { status = "resolved", resolution, amountPaise }, actor) {
  const doc = await RentalIncident.findOne({ _id: id, tenantId });
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Incident not found");
  doc.status = status;
  if (resolution !== undefined) doc.resolution = resolution;
  if (amountPaise != null) doc.amountPaise = amountPaise;
  doc.version += 1;
  await doc.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "incident.resolve",
    resourceType: "RentalIncident", resourceId: String(doc._id), resourceVersion: doc.version,
  });
  return { incident: doc.toObject() };
}
