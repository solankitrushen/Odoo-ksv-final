// Public storefront catalog reads — active products + default-pricelist rates.
// Rate ladder for display matches checkout: variant → product → default (SPEC-003).
import {
  RentalProduct,
  RentalVariant,
  RentalPricelist,
  RentalRateEntry,
} from "../schema/index.js";
import { PERIOD_CODES, UNIT_MINUTES } from "../constants.js";
import { rentalError } from "../errors.js";

function activeAt(at) {
  return {
    status: "active",
    effectiveFrom: { $lte: at },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
  };
}

async function loadDefaultPricelist(tenantId, at) {
  return RentalPricelist.findOne({
    tenantId,
    isDefault: true,
    ...activeAt(at),
  })
    .sort({ effectiveFrom: -1 })
    .lean();
}

/**
 * Resolve display rates per variant using variant → product → default ladder.
 * @returns {Map<string, Array<{ periodCode, ratePaise, source }>>}
 */
async function ratesByVariant(tenantId, pricelistId, productId, variantIds, at) {
  const rates = await RentalRateEntry.find({
    tenantId,
    pricelistId,
    ...activeAt(at),
    $or: [
      { targetType: "variant", targetId: { $in: variantIds } },
      { targetType: "product", targetId: productId },
      { targetType: "default", targetId: null },
    ],
  })
    .select("targetType targetId periodCode ratePaise")
    .lean();

  const byPeriod = {
    default: new Map(),
    product: new Map(),
    variant: new Map(), // key: `${variantId}:${period}`
  };
  for (const r of rates) {
    if (r.targetType === "default") byPeriod.default.set(r.periodCode, r.ratePaise);
    else if (r.targetType === "product") byPeriod.product.set(r.periodCode, r.ratePaise);
    else if (r.targetType === "variant") {
      byPeriod.variant.set(`${r.targetId}:${r.periodCode}`, r.ratePaise);
    }
  }

  const out = new Map();
  for (const vid of variantIds) {
    const list = [];
    for (const periodCode of PERIOD_CODES) {
      const vk = `${vid}:${periodCode}`;
      let ratePaise;
      let source;
      if (byPeriod.variant.has(vk)) {
        ratePaise = byPeriod.variant.get(vk);
        source = "variant";
      } else if (byPeriod.product.has(periodCode)) {
        ratePaise = byPeriod.product.get(periodCode);
        source = "product";
      } else if (byPeriod.default.has(periodCode)) {
        ratePaise = byPeriod.default.get(periodCode);
        source = "default";
      }
      if (ratePaise != null) list.push({ periodCode, ratePaise, source });
    }
    out.set(String(vid), list);
  }
  return out;
}

export async function listPublicVariantsWithRates(tenantId, productId) {
  const product = await RentalProduct.findOne({ _id: productId, tenantId, status: "active" })
    .select("_id")
    .lean();
  if (!product) throw rentalError("RESOURCE_NOT_FOUND", "Product not found");

  const variants = await RentalVariant.find({ tenantId, productId, status: "active" })
    .select("name variantSku defaultPeriodCode attributes")
    .lean();

  const now = new Date();
  const pricelist = await loadDefaultPricelist(tenantId, now);
  if (pricelist && variants.length) {
    const map = await ratesByVariant(
      tenantId,
      pricelist._id,
      product._id,
      variants.map((v) => v._id),
      now
    );
    for (const v of variants) v.rates = map.get(String(v._id)) || [];
  } else {
    for (const v of variants) v.rates = [];
  }
  return { items: variants };
}

export async function getPublicProductDetail(tenantId, productId) {
  const product = await RentalProduct.findOne({ _id: productId, tenantId, status: "active" })
    .select("name productSku categoryId description brand images")
    .lean();
  if (!product) throw rentalError("RESOURCE_NOT_FOUND", "Product not found");

  const { items: variants } = await listPublicVariantsWithRates(tenantId, productId);
  const now = new Date();
  const pricelist = await loadDefaultPricelist(tenantId, now);

  return {
    product,
    variants,
    periods: PERIOD_CODES.map((code) => ({ code, unitMinutes: UNIT_MINUTES[code] })),
    pricelist: pricelist
      ? { _id: pricelist._id, code: pricelist.code, name: pricelist.name, currency: pricelist.currency }
      : null,
  };
}
