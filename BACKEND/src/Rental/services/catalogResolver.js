// Catalog CRUD + rate/policy resolution bridging DB records to the pure engine.
import {
  RentalCategory,
  RentalProduct,
  RentalVariant,
  RentalPricelist,
  RentalRateEntry,
  RentalCommercialPolicyVersion,
} from "../schema/index.js";
import { POLICY_TYPES, POLICY_SOURCE } from "../constants.js";
import { resolveRate, resolvePolicy, unitMinutesFor } from "./pricing.js";
import { resolveTaxCode } from "./taxService.js";
import { rentalError } from "../errors.js";

const activeRate = (at) => ({
  status: "active",
  effectiveFrom: { $lte: at },
  $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
});

async function loadCategoryChain(tenantId, categoryId) {
  const chain = [];
  let current = categoryId;
  let guard = 0;
  while (current && guard < 10) {
    const cat = await RentalCategory.findOne({ _id: current, tenantId }).lean();
    if (!cat) break;
    chain.push(cat);
    current = cat.parentCategoryId;
    guard += 1;
  }
  return chain;
}

async function loadOrgPolicy(tenantId, policyType, at) {
  const doc = await RentalCommercialPolicyVersion.findOne({
    tenantId,
    scopeType: "organization",
    policyType,
    ...activeRate(at),
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  return doc?.policy;
}

/**
 * Resolve rate + all five policies for a single order line at an instant.
 * @returns {{ ratePaise, rateSource, unitMinutes, minimumBillingMinutes, policies }}
 */
export async function resolveLinePricing(tenantId, { variantId, periodCode, at, overrides = {}, negotiated }) {
  const variant = await RentalVariant.findOne({ _id: variantId, tenantId }).lean();
  if (!variant) throw rentalError("RESOURCE_NOT_FOUND", "Variant not found");
  const product = await RentalProduct.findOne({ _id: variant.productId, tenantId }).lean();
  if (!product) throw rentalError("RESOURCE_NOT_FOUND", "Product not found");
  const categories = product.categoryId ? await loadCategoryChain(tenantId, product.categoryId) : [];

  const period = periodCode || variant.defaultPeriodCode || "day";
  const unitMinutes = unitMinutesFor(period);

  // Prefer active non-default pricelist that has any rate for this target/period; else default.
  const pricelist = await resolveActivePricelist(tenantId, at, {
    variantId,
    productId: product._id,
    periodCode: period,
  });

  const rateFor = async (targetType, targetId) => {
    const r = await RentalRateEntry.findOne({
      tenantId,
      pricelistId: pricelist._id,
      targetType,
      ...(targetId ? { targetId } : {}),
      periodCode: period,
      ...activeRate(at),
    })
      .sort({ effectiveFrom: -1 })
      .lean();
    return r ? { ratePaise: r.ratePaise, minimumBillingMinutes: r.minimumBillingMinutes } : undefined;
  };

  const variantItem = await rateFor("variant", variantId);
  const productItem = await rateFor("product", product._id);
  const defaultItem = await rateFor("default", null);
  const { ratePaise, source } = resolveRate({
    negotiated: negotiated != null ? { ratePaise: negotiated } : undefined,
    negotiatedAuthorized: overrides.negotiatedAuthorized === true,
    variantItem,
    productItem,
    defaultItem,
  });
  const chosenRate = [variantItem, productItem, defaultItem].find(
    (x) => x && x.ratePaise === ratePaise
  );
  const minimumBillingMinutes = chosenRate?.minimumBillingMinutes ?? 0;

  // SPEC-014: product tax class wins over inline/org gstBps when assigned.
  const taxCode = await resolveTaxCode(tenantId, product.taxClassId, at);
  const taxFromClass = taxCode
    ? { gstBps: taxCode.rateBps, mode: taxCode.mode, taxCodeId: String(taxCode._id), code: taxCode.code }
    : undefined;

  const policies = {};
  for (const type of POLICY_TYPES) {
    const productTax =
      type === "tax" && taxFromClass ? taxFromClass : presence(product.policies?.[type]);
    const { policy, sourceLevel } = resolvePolicy(type, {
      line: presence(overrides[type]),
      product: productTax,
      categories: categories.map((c) => presence(c.policies?.[type])).filter(Boolean),
      organization: presence(await loadOrgPolicy(tenantId, type, at)),
    });
    policies[type] = { policy, sourceLevel: taxFromClass && type === "tax" ? "product" : sourceLevel };
  }

  return {
    variant,
    product,
    pricelistId: pricelist._id,
    pricelistCode: pricelist.code,
    ratePaise,
    rateSource: source,
    unitMinutes,
    periodCode: period,
    minimumBillingMinutes,
    policies,
    sourceLevelDeposit: policies.deposit.sourceLevel,
  };
}

/** Active pricelist with rates for target; non-default wins over default when both active. */
async function resolveActivePricelist(tenantId, at, { variantId, productId, periodCode }) {
  const lists = await RentalPricelist.find({
    tenantId,
    status: "active",
    ...activeRate(at),
  }).lean();
  lists.sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? 1 : -1;
    return new Date(b.effectiveFrom) - new Date(a.effectiveFrom);
  });
  for (const pl of lists) {
    const has = await RentalRateEntry.exists({
      tenantId,
      pricelistId: pl._id,
      periodCode,
      ...activeRate(at),
      $or: [
        { targetType: "variant", targetId: variantId },
        { targetType: "product", targetId: productId },
        { targetType: "default" },
      ],
    });
    if (has) return pl;
  }
  throw rentalError("PRICE_NOT_CONFIGURED", "No active pricelist with rates for period");
}

function presence(v) {
  return v == null ? undefined : v;
}

void POLICY_SOURCE;
