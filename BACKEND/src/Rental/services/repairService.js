// SPEC-007 FR-12 repair work-orders.
import { RentalRepairWorkOrder, RentalOrder, RentalAsset } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { writeAudit } from "./infra.js";

export async function listRepairs(tenantId, { status, rentalId, limit = 50 } = {}) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (rentalId) filter.rentalId = rentalId;
  const lim = Math.min(Math.max(1, Number(limit) || 50), 100);
  const items = await RentalRepairWorkOrder.find(filter).sort({ createdAt: -1 }).limit(lim).lean();
  return { items };
}

export async function createRepair(tenantId, input, actor) {
  const rental = await RentalOrder.findOne({ _id: input.rentalId, tenantId }).select("_id").lean();
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  if (input.assetId) {
    const asset = await RentalAsset.findOne({ _id: input.assetId, tenantId }).select("_id").lean();
    if (!asset) throw rentalError("RESOURCE_NOT_FOUND", "Asset not found");
  }
  const doc = await RentalRepairWorkOrder.create({
    tenantId,
    rentalId: input.rentalId,
    assetId: input.assetId || null,
    notes: input.notes || null,
    damagePreTaxPaise: input.damagePreTaxPaise || 0,
    status: "open",
  });
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "repair.create",
    resourceType: "RentalRepairWorkOrder", resourceId: String(doc._id), resourceVersion: 0,
  });
  return { repair: doc.toObject() };
}

/** Idempotent: one open WO per rental when damage assessed. */
export async function ensureRepairForDamage(tenantId, { rentalId, damagePreTaxPaise, notes, actor }) {
  if (!damagePreTaxPaise || damagePreTaxPaise <= 0) return null;
  const existing = await RentalRepairWorkOrder.findOne({
    tenantId,
    rentalId,
    status: { $in: ["open", "in_repair"] },
  }).lean();
  if (existing) return { repair: existing, created: false };
  const out = await createRepair(
    tenantId,
    { rentalId, damagePreTaxPaise, notes },
    actor || { type: "system", id: "inspect" }
  );
  return { ...out, created: true };
}

export async function updateRepair(tenantId, id, patch, actor) {
  const doc = await RentalRepairWorkOrder.findOne({ _id: id, tenantId });
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Repair work order not found");
  if (patch.status != null) doc.status = patch.status;
  if (patch.notes !== undefined) doc.notes = patch.notes;
  doc.version += 1;
  await doc.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "repair.update",
    resourceType: "RentalRepairWorkOrder", resourceId: String(doc._id), resourceVersion: doc.version,
  });
  return { repair: doc.toObject() };
}
