/** @typedef {'percentage'|'fixed'} DiscountType */

/**
 * Round to 2 decimal places (currency-safe).
 * @param {number} amount
 */
export function roundMoney(amount) {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * @param {Date} now
 * @param {{ validFrom: Date, validUntil: Date, isActive?: boolean }} rule
 */
export function isDiscountActive(rule, now = new Date()) {
  if (rule.isActive === false) return false;
  const from = new Date(rule.validFrom);
  const until = new Date(rule.validUntil);
  return now >= from && now <= until;
}

/**
 * @param {number} basePrice
 * @param {{ type: DiscountType, value: number }} rule
 */
export function applyDiscountRule(basePrice, rule) {
  const price = roundMoney(basePrice);
  if (rule.type === "percentage") {
    const pct = Math.min(100, Math.max(0, rule.value));
    return roundMoney(price * (1 - pct / 100));
  }
  return roundMoney(Math.max(0, price - rule.value));
}

/**
 * Deterministic: lowest final price among applicable rules.
 * @param {number} basePrice
 * @param {Array<{ type: DiscountType, value: number, validFrom: Date, validUntil: Date, isActive?: boolean }>} rules
 */
export function resolveFinalPrice(basePrice, rules, now = new Date()) {
  const active = rules.filter((r) => isDiscountActive(r, now));
  if (!active.length) {
    return { originalPrice: roundMoney(basePrice), appliedPrice: roundMoney(basePrice), discountApplied: false };
  }

  let best = roundMoney(basePrice);
  for (const rule of active) {
    const next = applyDiscountRule(basePrice, rule);
    if (next < best) best = next;
  }

  const original = roundMoney(basePrice);
  return {
    originalPrice: original,
    appliedPrice: best,
    discountApplied: best < original,
  };
}
