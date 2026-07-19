// SPEC-014 tax code admin CRUD + resolve for catalog pricing.
import { RentalTaxCode, RentalProduct } from "../schema/index.js";
import { writeAudit } from "./infra.js";
import { rentalError } from "../errors.js";

async function create(tenantId, doc, actor) {
  try {
    const created = await RentalTaxCode.create({ ...doc, tenantId });
    await writeAudit({
      tenantId, actorType: actor.type, actorId: actor.id, action: "RentalTaxCode.create",
      resourceType: "RentalTaxCode", resourceId: String(created._id), resourceVersion: 0,
    });
    return created.toObject();
  } catch (err) {
    if (err?.code === 11000) throw rentalError("DUPLICATE_RESOURCE", "Tax code already exists");
    throw err;
  }
}

function statusExtra(query = {}) {
  if (query.status === "all") return {};
  if (query.status === "archived") return { status: "archived" };
  return { status: "active" };
}

export async function createTaxCode(tenantId, doc, actor) {
  // Default far-past effectiveFrom so historical rental quotes resolve tax.
  const payload = {
    ...doc,
    effectiveFrom: doc.effectiveFrom || new Date("2020-01-01T00:00:00.000Z"),
  };
  return create(tenantId, payload, actor);
}

export async function listTaxCodes(tenantId, { page = 1, limit = 25, status } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 25), 100);
  const skip = (Math.max(1, Number(page) || 1) - 1) * lim;
  const filter = { tenantId, ...statusExtra({ status }) };
  const [items, total] = await Promise.all([
    RentalTaxCode.find(filter).sort({ code: 1 }).skip(skip).limit(lim).lean(),
    RentalTaxCode.countDocuments(filter),
  ]);
  return { items, total, page: Number(page) || 1, limit: lim };
}

export async function getTaxCode(tenantId, id) {
  const doc = await RentalTaxCode.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Tax code not found");
  return { taxCode: doc };
}

export async function updateTaxCode(tenantId, id, expectedVersion, patch, actor) {
  const allowed = ["code", "name", "rateBps", "mode", "jurisdiction", "effectiveFrom", "effectiveTo"];
  const $set = {};
  for (const k of allowed) if (patch[k] !== undefined) $set[k] = patch[k];
  if (!Object.keys($set).length) throw rentalError("VALIDATION_ERROR", "Nothing to update");

  let upd;
  try {
    upd = await RentalTaxCode.findOneAndUpdate(
      { _id: id, tenantId, version: expectedVersion },
      { $set, $inc: { version: 1 } },
      { new: true }
    );
  } catch (err) {
    if (err?.code === 11000) throw rentalError("DUPLICATE_RESOURCE", "Tax code already exists");
    throw err;
  }
  if (!upd) {
    const exists = await RentalTaxCode.exists({ _id: id, tenantId });
    if (!exists) throw rentalError("RESOURCE_NOT_FOUND", "Tax code not found");
    throw rentalError("VERSION_CONFLICT", "Stale tax code version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "RentalTaxCode.update",
    resourceType: "RentalTaxCode", resourceId: String(id), resourceVersion: upd.version,
  });
  return { taxCode: upd.toObject() };
}

export async function archiveTaxCode(tenantId, id, expectedVersion, actor) {
  const inUse = await RentalProduct.exists({ tenantId, taxClassId: id, status: "active" });
  if (inUse) throw rentalError("RESOURCE_IN_USE", "Tax code assigned to active products");

  const upd = await RentalTaxCode.findOneAndUpdate(
    { _id: id, tenantId, version: expectedVersion, status: "active" },
    { $set: { status: "archived", archivedAt: new Date() }, $inc: { version: 1 } },
    { new: true }
  );
  if (!upd) {
    const existing = await RentalTaxCode.findOne({ _id: id, tenantId }).lean();
    if (!existing) throw rentalError("RESOURCE_NOT_FOUND", "Tax code not found");
    if (existing.status === "archived") throw rentalError("INVALID_STATE_TRANSITION", "Already archived");
    throw rentalError("VERSION_CONFLICT", "Stale tax code version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "RentalTaxCode.archive",
    resourceType: "RentalTaxCode", resourceId: String(id), resourceVersion: upd.version,
  });
  return { taxCode: upd.toObject() };
}

/** Active tax code at instant, or null. */
export async function resolveTaxCode(tenantId, taxClassId, at = new Date()) {
  if (!taxClassId) return null;
  return RentalTaxCode.findOne({
    _id: taxClassId,
    tenantId,
    status: "active",
    effectiveFrom: { $lte: at },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
  }).lean();
}
