// SPEC-005/010 quotation templates.
import { RentalQuotationTemplate } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { writeAudit } from "./infra.js";

export async function listTemplates(tenantId, { status = "active" } = {}) {
  const filter = { tenantId };
  if (status && status !== "all") filter.status = status;
  const items = await RentalQuotationTemplate.find(filter).sort({ isDefault: -1, name: 1 }).lean();
  return { items };
}

export async function getDefaultTemplate(tenantId) {
  const t =
    (await RentalQuotationTemplate.findOne({ tenantId, status: "active", isDefault: true }).lean()) ||
    (await RentalQuotationTemplate.findOne({ tenantId, status: "active" }).sort({ createdAt: 1 }).lean());
  return t;
}

export async function createTemplate(tenantId, input, actor) {
  if (input.isDefault) {
    await RentalQuotationTemplate.updateMany({ tenantId, isDefault: true }, { $set: { isDefault: false } });
  }
  const doc = await RentalQuotationTemplate.create({
    tenantId,
    code: input.code,
    name: input.name,
    headerText: input.headerText || "",
    footerText: input.footerText || "",
    isDefault: Boolean(input.isDefault),
  });
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "template.create",
    resourceType: "RentalQuotationTemplate", resourceId: String(doc._id), resourceVersion: 0,
  });
  return { template: doc.toObject() };
}

export async function updateTemplate(tenantId, id, patch, actor) {
  const doc = await RentalQuotationTemplate.findOne({ _id: id, tenantId });
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Template not found");
  if (patch.isDefault === true) {
    await RentalQuotationTemplate.updateMany(
      { tenantId, isDefault: true, _id: { $ne: doc._id } },
      { $set: { isDefault: false } }
    );
  }
  for (const k of ["name", "headerText", "footerText", "isDefault", "status"]) {
    if (patch[k] !== undefined) doc[k] = patch[k];
  }
  doc.version += 1;
  await doc.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "template.update",
    resourceType: "RentalQuotationTemplate", resourceId: String(doc._id), resourceVersion: doc.version,
  });
  return { template: doc.toObject() };
}
