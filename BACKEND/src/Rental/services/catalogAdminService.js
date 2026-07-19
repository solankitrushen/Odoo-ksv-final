// Catalog + asset admin CRUD. Mostly single-document; tenant-scoped throughout.
import mongoose from "mongoose";
import {
  RentalCategory,
  RentalProduct,
  RentalVariant,
  RentalPricelist,
  RentalRateEntry,
  RentalCommercialPolicyVersion,
  RentalAsset,
  RentalSettings,
  RentalOrder,
  RentalTaxCode,
} from "../schema/index.js";
import { writeAudit } from "./infra.js";
import { rentalError } from "../errors.js";
import { evaluateProviderOperation } from "../config.js";
import { PROVIDERS, RENTAL_TERMINAL, ASSET_STATE, PERIOD_CODES, UNIT_MINUTES } from "../constants.js";

function asOid(id) {
  if (id == null || id === "") return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

async function create(Model, tenantId, doc, actor, type) {
  try {
    const created = await Model.create({ ...doc, tenantId });
    await writeAudit({
      tenantId, actorType: actor.type, actorId: actor.id, action: `${type}.create`,
      resourceType: type, resourceId: String(created._id), resourceVersion: 0,
    });
    return created.toObject();
  } catch (err) {
    if (err?.code === 11000) throw rentalError("DUPLICATE_RESOURCE", `${type} already exists`);
    throw err;
  }
}

/** Default list = active only; ?status=archived|all overrides. */
function statusExtra(query = {}) {
  const status = query.status;
  if (status === "all") return {};
  if (status === "archived") return { status: "archived" };
  return { status: "active" };
}

async function list(Model, tenantId, { page = 1, limit = 25, extra = {} } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 25), 100);
  const skip = (Math.max(1, Number(page) || 1) - 1) * lim;
  const filter = { tenantId, ...extra };
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, total, page: Number(page) || 1, limit: lim };
}

async function getOne(Model, tenantId, id, label) {
  const doc = await Model.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", `${label} not found`);
  return doc;
}

async function updateOne(Model, tenantId, id, expectedVersion, patch, actor, type, allowedKeys) {
  const $set = {};
  for (const k of allowedKeys) {
    if (patch[k] !== undefined) $set[k] = patch[k];
  }
  if (!Object.keys($set).length) throw rentalError("VALIDATION_ERROR", "Nothing to update");

  let upd;
  try {
    upd = await Model.findOneAndUpdate(
      { _id: id, tenantId, version: expectedVersion },
      { $set, $inc: { version: 1 } },
      { new: true }
    );
  } catch (err) {
    if (err?.code === 11000) throw rentalError("DUPLICATE_RESOURCE", `${type} already exists`);
    throw err;
  }
  if (!upd) {
    const exists = await Model.exists({ _id: id, tenantId });
    if (!exists) throw rentalError("RESOURCE_NOT_FOUND", `${type} not found`);
    throw rentalError("VERSION_CONFLICT", `Stale ${type} version`);
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: `${type}.update`,
    resourceType: type, resourceId: String(id), resourceVersion: upd.version,
  });
  return upd.toObject();
}

async function archiveOne(Model, tenantId, id, expectedVersion, actor, type) {
  const upd = await Model.findOneAndUpdate(
    { _id: id, tenantId, version: expectedVersion, status: "active" },
    { $set: { status: "archived", archivedAt: new Date() }, $inc: { version: 1 } },
    { new: true }
  );
  if (!upd) {
    const existing = await Model.findOne({ _id: id, tenantId }).lean();
    if (!existing) throw rentalError("RESOURCE_NOT_FOUND", `${type} not found`);
    if (existing.status === "archived") throw rentalError("INVALID_STATE_TRANSITION", `${type} already archived`);
    throw rentalError("VERSION_CONFLICT", `Stale ${type} version`);
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: `${type}.archive`,
    resourceType: type, resourceId: String(id), resourceVersion: upd.version,
  });
  return upd.toObject();
}

async function assertNoActiveRentals(tenantId, lineFilter) {
  const active = await RentalOrder.exists({
    tenantId,
    status: { $nin: RENTAL_TERMINAL },
    ...lineFilter,
  });
  if (active) {
    throw rentalError("RESOURCE_IN_USE", "Referenced by active rental", { lineFilter });
  }
}

/** Product archive: lines may only carry variantId until confirm. */
async function assertProductNotInActiveRentals(tenantId, productId) {
  const variants = await RentalVariant.find({ tenantId, productId }).select("_id").lean();
  const variantIds = variants.map((v) => v._id);
  const or = [{ "lines.productId": productId }];
  if (variantIds.length) or.push({ "lines.variantId": { $in: variantIds } });
  const active = await RentalOrder.exists({
    tenantId,
    status: { $nin: RENTAL_TERMINAL },
    $or: or,
  });
  if (active) throw rentalError("RESOURCE_IN_USE", "Referenced by active rental");
}

// --- Categories ---
export const createCategory = (t, d, a) => create(RentalCategory, t, d, a, "RentalCategory");
export const listCategories = (t, o = {}) =>
  list(RentalCategory, t, { ...o, extra: { ...statusExtra(o), ...(o.extra || {}) } });
export const getCategory = async (t, id) => ({ category: await getOne(RentalCategory, t, id, "Category") });
export const updateCategory = (t, id, v, patch, a) =>
  updateOne(RentalCategory, t, id, v, patch, a, "RentalCategory", [
    "code", "name", "parentCategoryId", "sortOrder", "policies",
  ]);
export async function archiveCategory(tenantId, id, expectedVersion, actor) {
  const inUse = await RentalProduct.exists({ tenantId, categoryId: id, status: "active" });
  if (inUse) throw rentalError("RESOURCE_IN_USE", "Category has active products");
  return { category: await archiveOne(RentalCategory, tenantId, id, expectedVersion, actor, "RentalCategory") };
}

// --- Products ---
async function assertTaxClass(tenantId, taxClassId) {
  if (!taxClassId) throw rentalError("VALIDATION_ERROR", "taxClassId is required");
  const ok = await RentalTaxCode.exists({ _id: taxClassId, tenantId, status: "active" });
  if (!ok) throw rentalError("VALIDATION_ERROR", "taxClassId must reference an active tax code");
}

export async function createProduct(tenantId, doc, actor) {
  await assertTaxClass(tenantId, doc.taxClassId);
  return create(RentalProduct, tenantId, doc, actor, "RentalProduct");
}
export const listProducts = (t, o = {}) =>
  list(RentalProduct, t, { ...o, extra: { ...statusExtra(o), ...(o.extra || {}) } });
export const getProduct = async (t, id) => ({ product: await getOne(RentalProduct, t, id, "Product") });
export async function updateProduct(tenantId, id, expectedVersion, patch, actor) {
  if (patch.taxClassId !== undefined) await assertTaxClass(tenantId, patch.taxClassId);
  return updateOne(RentalProduct, tenantId, id, expectedVersion, patch, actor, "RentalProduct", [
    "productSku", "name", "categoryId", "taxClassId", "description", "brand", "images",
    "dimensions", "weightGrams", "fulfillment", "policies",
  ]);
}
export async function archiveProduct(tenantId, id, expectedVersion, actor) {
  await assertProductNotInActiveRentals(tenantId, id);
  return { product: await archiveOne(RentalProduct, tenantId, id, expectedVersion, actor, "RentalProduct") };
}

export async function restoreProduct(tenantId, id, expectedVersion, actor) {
  const upd = await RentalProduct.findOneAndUpdate(
    { _id: id, tenantId, version: expectedVersion, status: "archived" },
    { $set: { status: "active", archivedAt: null }, $inc: { version: 1 } },
    { new: true }
  );
  if (!upd) {
    const existing = await RentalProduct.findOne({ _id: id, tenantId }).lean();
    if (!existing) throw rentalError("RESOURCE_NOT_FOUND", "Product not found");
    if (existing.status === "active") throw rentalError("INVALID_STATE_TRANSITION", "Product already active");
    throw rentalError("VERSION_CONFLICT", "Stale product version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "RentalProduct.restore",
    resourceType: "RentalProduct", resourceId: String(id), resourceVersion: upd.version,
  });
  return { product: upd.toObject() };
}

// --- Variants ---
export const createVariant = (t, d, a) => create(RentalVariant, t, d, a, "RentalVariant");
export const listVariants = (t, o = {}) =>
  list(RentalVariant, t, {
    ...o,
    extra: {
      ...statusExtra(o),
      ...(o?.productId ? { productId: o.productId } : {}),
      ...(o.extra || {}),
    },
  });
export const getVariant = async (t, id) => ({ variant: await getOne(RentalVariant, t, id, "Variant") });
export const updateVariant = (t, id, v, patch, a) =>
  updateOne(RentalVariant, t, id, v, patch, a, "RentalVariant", [
    "variantSku", "variantSignature", "name", "attributes", "defaultPeriodCode",
  ]);
export async function archiveVariant(tenantId, id, expectedVersion, actor) {
  await assertNoActiveRentals(tenantId, { "lines.variantId": id });
  return { variant: await archiveOne(RentalVariant, tenantId, id, expectedVersion, actor, "RentalVariant") };
}

/** FR-1: at most one default pricelist per tenant among active lists. */
async function clearOtherDefaults(tenantId, keepId) {
  await RentalPricelist.updateMany(
    { tenantId, isDefault: true, ...(keepId ? { _id: { $ne: keepId } } : {}) },
    { $set: { isDefault: false }, $inc: { version: 1 } }
  );
}

export async function createPricelist(tenantId, doc, actor) {
  if (doc.isDefault) await clearOtherDefaults(tenantId, null);
  return create(RentalPricelist, tenantId, doc, actor, "RentalPricelist");
}
export const listPricelists = (t, o = {}) =>
  list(RentalPricelist, t, { ...o, extra: { ...statusExtra(o), ...(o.extra || {}) } });
export const getPricelist = async (t, id) => ({ pricelist: await getOne(RentalPricelist, t, id, "Pricelist") });
export async function updatePricelist(tenantId, id, expectedVersion, patch, actor) {
  if (patch.isDefault === true) await clearOtherDefaults(tenantId, id);
  if (patch.isDefault === false) {
    const current = await RentalPricelist.findOne({ _id: id, tenantId }).lean();
    if (!current) throw rentalError("RESOURCE_NOT_FOUND", "Pricelist not found");
    if (current.isDefault) {
      const other = await RentalPricelist.exists({
        tenantId, isDefault: true, status: "active", _id: { $ne: id },
      });
      if (!other) throw rentalError("RESOURCE_IN_USE", "Cannot unset the only default pricelist");
    }
  }
  return updateOne(
    RentalPricelist, tenantId, id, expectedVersion, patch, actor, "RentalPricelist",
    ["code", "name", "isDefault", "effectiveFrom", "effectiveTo"]
  );
}
export async function archivePricelist(tenantId, id, expectedVersion, actor) {
  const current = await RentalPricelist.findOne({ _id: id, tenantId }).lean();
  if (!current) throw rentalError("RESOURCE_NOT_FOUND", "Pricelist not found");
  if (current.isDefault) {
    throw rentalError("RESOURCE_IN_USE", "Cannot archive the default pricelist; promote another first");
  }
  return { pricelist: await archiveOne(RentalPricelist, tenantId, id, expectedVersion, actor, "RentalPricelist") };
}

export async function createRateEntry(tenantId, doc, actor) {
  const pl = await RentalPricelist.findOne({ _id: doc.pricelistId, tenantId }).lean();
  if (!pl) throw rentalError("RESOURCE_NOT_FOUND", "Pricelist not found");
  if (doc.targetType === "default") doc = { ...doc, targetId: null };
  return create(RentalRateEntry, tenantId, doc, actor, "RentalRateEntry");
}
export async function listRateEntries(tenantId, pricelistId, o = {}) {
  const pl = await RentalPricelist.findOne({ _id: pricelistId, tenantId }).lean();
  if (!pl) throw rentalError("RESOURCE_NOT_FOUND", "Pricelist not found");
  return list(RentalRateEntry, tenantId, {
    ...o,
    extra: {
      pricelistId,
      ...statusExtra(o),
      ...(o.targetType ? { targetType: o.targetType } : {}),
      ...(o.targetId ? { targetId: o.targetId } : {}),
      ...(o.periodCode ? { periodCode: o.periodCode } : {}),
    },
  });
}
export const getRateEntry = async (t, id) => ({ rate: await getOne(RentalRateEntry, t, id, "Rate entry") });
export async function updateRateEntry(tenantId, id, expectedVersion, patch, actor) {
  return updateOne(
    RentalRateEntry, tenantId, id, expectedVersion, patch, actor, "RentalRateEntry",
    ["ratePaise", "minimumBillingMinutes", "effectiveFrom", "effectiveTo", "periodCode"]
  );
}
export async function archiveRateEntry(tenantId, id, expectedVersion, actor) {
  return { rate: await archiveOne(RentalRateEntry, tenantId, id, expectedVersion, actor, "RentalRateEntry") };
}

/** SPEC-003 FR-4 MVP: periods are platform constants (not tenant CRUD). */
export function listRentalPeriods() {
  return {
    items: PERIOD_CODES.map((code) => ({
      code,
      unitMinutes: UNIT_MINUTES[code],
    })),
  };
}

export const createCommercialPolicy = (t, d, a) => create(RentalCommercialPolicyVersion, t, d, a, "RentalCommercialPolicyVersion");

export async function listCommercialPolicies(tenantId, query = {}) {
  const extra = {
    ...statusExtra(query),
    ...(query.policyType ? { policyType: query.policyType } : {}),
    ...(query.scopeType ? { scopeType: query.scopeType } : {}),
  };
  return list(RentalCommercialPolicyVersion, tenantId, { ...query, extra });
}

export async function getCommercialPolicy(tenantId, id) {
  return { policy: await getOne(RentalCommercialPolicyVersion, tenantId, id, "Commercial policy") };
}

export async function archiveCommercialPolicy(tenantId, id, expectedVersion, actor) {
  return {
    policy: await archiveOne(
      RentalCommercialPolicyVersion, tenantId, id, expectedVersion, actor, "RentalCommercialPolicyVersion"
    ),
  };
}

async function resolveProductId(tenantId, variantId, productId) {
  if (productId) return productId;
  const variant = await RentalVariant.findOne({ _id: variantId, tenantId }).select("productId").lean();
  if (!variant) throw rentalError("RESOURCE_NOT_FOUND", "Variant not found");
  return variant.productId;
}

export async function createAsset(tenantId, doc, actor) {
  const productId = await resolveProductId(tenantId, doc.variantId, doc.productId);
  return create(RentalAsset, tenantId, { ...doc, productId }, actor, "RentalAsset");
}

/** All-or-nothing batch asset creation (unique codes per tenant). */
export async function createAssetBatch(tenantId, assets, actor) {
  try {
    const docs = [];
    for (const a of assets) {
      const productId = await resolveProductId(tenantId, a.variantId, a.productId);
      docs.push({ ...a, tenantId, productId });
    }
    const created = await RentalAsset.insertMany(docs, { ordered: true });
    await writeAudit({
      tenantId, actorType: actor.type, actorId: actor.id, action: "RentalAsset.batchCreate",
      resourceType: "RentalAsset", resourceId: null, afterSummary: { count: created.length },
    });
    return { items: created.map((c) => c.toObject()), count: created.length };
  } catch (err) {
    if (err?.code === 11000) throw rentalError("DUPLICATE_RESOURCE", "Duplicate asset code in batch");
    throw err;
  }
}

export const listAssets = (t, o = {}) =>
  list(RentalAsset, t, {
    ...o,
    extra: {
      ...(o?.variantId ? { variantId: o.variantId } : {}),
      ...(o?.productId ? { productId: o.productId } : {}),
      ...(o.extra || {}),
    },
  });

export const getAsset = async (t, id) => ({ asset: await getOne(RentalAsset, t, id, "Asset") });

export async function patchAsset(tenantId, id, expectedVersion, patch, actor) {
  return {
    asset: await updateOne(
      RentalAsset, tenantId, id, expectedVersion, patch, actor, "RentalAsset",
      ["condition", "locationId", "notes", "serialNumber"]
    ),
  };
}

export async function retireAsset(tenantId, id, expectedVersion, reason, actor) {
  const upd = await RentalAsset.findOneAndUpdate(
    { _id: id, tenantId, version: expectedVersion, state: { $ne: ASSET_STATE.RETIRED } },
    {
      $set: {
        state: ASSET_STATE.RETIRED,
        condition: "unusable",
        archivedAt: new Date(),
        ...(reason ? { notes: reason } : {}),
      },
      $inc: { version: 1 },
    },
    { new: true }
  );
  if (!upd) {
    const existing = await RentalAsset.findOne({ _id: id, tenantId }).lean();
    if (!existing) throw rentalError("RESOURCE_NOT_FOUND", "Asset not found");
    if (existing.state === ASSET_STATE.RETIRED) {
      throw rentalError("INVALID_STATE_TRANSITION", "Asset already retired");
    }
    throw rentalError("VERSION_CONFLICT", "Stale asset version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "RentalAsset.retire", reason,
    resourceType: "RentalAsset", resourceId: String(id), resourceVersion: upd.version,
  });
  return { asset: upd.toObject() };
}

/** Stock rollup: counts of assets by product/variant/location/state/condition. */
export async function getStockRollup(tenantId, { productId, variantId, locationId } = {}) {
  const match = { tenantId: asOid(tenantId) || tenantId, state: { $ne: ASSET_STATE.RETIRED } };
  const pid = asOid(productId);
  const vid = asOid(variantId);
  if (pid) match.productId = pid;
  if (vid) match.variantId = vid;
  if (locationId) match.locationId = locationId;

  const rows = await RentalAsset.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          productId: "$productId",
          variantId: "$variantId",
          locationId: "$locationId",
          state: "$state",
          condition: "$condition",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.productId": 1, "_id.variantId": 1, "_id.locationId": 1 } },
  ]);

  const items = rows.map((r) => ({
    productId: r._id.productId,
    variantId: r._id.variantId,
    locationId: r._id.locationId,
    state: r._id.state,
    condition: r._id.condition,
    count: r.count,
  }));

  const availableCount = items
    .filter((i) => i.state === ASSET_STATE.AVAILABLE)
    .reduce((n, i) => n + i.count, 0);

  return { items, availableCount, totalCount: items.reduce((n, i) => n + i.count, 0) };
}

// --- Settings + provider readiness ---
export async function getSettings(tenantId) {
  let s = await RentalSettings.findOne({ tenantId }).lean();
  if (!s) s = (await RentalSettings.create({ tenantId })).toObject();
  const providers = {};
  for (const p of Object.values(PROVIDERS)) {
    const op = p === PROVIDERS.RAZORPAY ? "order" : p === PROVIDERS.BORZO ? "quote" : "otp_send";
    const e = evaluateProviderOperation({ provider: p, operation: op, tenantId, tenantProviderEnabled: s.providerEnabled?.[p] });
    providers[p] = {
      state: e.state,
      effectiveEnabled: e.effectiveEnabled,
      rolloutMode: e.rolloutMode,
      rolloutAllowsTenant: e.rolloutAllowsTenant,
      safeReasonCode: e.safeReasonCode,
      ...(p === PROVIDERS.RAZORPAY ? { publicKeyId: process.env.RAZORPAY_KEY_ID || null } : {}),
    };
  }
  return { settings: nonSecret(s), providers };
}

export async function patchSettings(tenantId, expectedVersion, patch, actor) {
  const s = await RentalSettings.findOneAndUpdate(
    { tenantId, version: expectedVersion },
    { $set: sanitizePatch(patch), $inc: { version: 1 } },
    { new: true, upsert: false }
  );
  if (!s) {
    const exists = await RentalSettings.exists({ tenantId });
    if (!exists) {
      // create then require version 0 on next call
      await RentalSettings.create({ tenantId });
      throw rentalError("VERSION_CONFLICT", "Settings initialized; retry with version 0");
    }
    throw rentalError("VERSION_CONFLICT", "Stale settings version");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "settings.patch",
    resourceType: "RentalSettings", resourceId: String(s._id), resourceVersion: s.version,
  });
  return { settings: nonSecret(s.toObject()) };
}

function sanitizePatch(patch) {
  const allowed = ["timezone", "dueWindowMinutes", "numberingPrefix", "paymentPolicy", "providerEnabled", "notificationPurposes"];
  const out = {};
  for (const k of allowed) if (patch[k] !== undefined) out[k] = patch[k];
  return out;
}

function nonSecret(s) {
  const { __v, ...rest } = s;
  void __v;
  return rest;
}
