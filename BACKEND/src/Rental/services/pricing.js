// SPEC-RMS-001 normative pricing. Pure, deterministic, integer paise / bps only.
// BigInt intermediates; half-up rounding once per component; no binary float.
import {
  UNIT_MINUTES,
  POLICY_MODE,
  POLICY_SOURCE,
  SYSTEM_SAFE_POLICY,
  MAX_SAFE_PAISE,
} from "../constants.js";
import { rentalError } from "../errors.js";

const BPS_DEN = 10000n;

/** roundHalfUp(n/d) = floor((2n + d) / 2d) for non-negative integers, in BigInt. */
export function roundHalfUp(numerator, denominator) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (d <= 0n) throw new Error("roundHalfUp denominator must be positive");
  if (n < 0n) throw new Error("roundHalfUp numerator must be non-negative");
  return (2n * n + d) / (2n * d);
}

/** Validate a BigInt result fits the safe persistable paise range, else 422. */
export function assertSafePaise(value) {
  const v = BigInt(value);
  if (v < 0n || v > BigInt(MAX_SAFE_PAISE)) {
    throw rentalError("PRICING_RANGE_EXCEEDED", "Amount exceeds safe integer range");
  }
  return Number(v);
}

/** whole elapsed minutes; any positive partial minute rounds up. */
export function computeActualMinutes(startAtMs, endAtMs) {
  const start = Number(startAtMs);
  const end = Number(endAtMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw rentalError("INVALID_INTERVAL", "Invalid interval timestamps");
  }
  if (end < start) throw rentalError("INVALID_INTERVAL", "endAt must be >= startAt");
  const diffMs = end - start;
  return Math.max(0, Math.ceil(diffMs / 60000));
}

export function computeBillableMinutes(actualMinutes, minimumBillingMinutes = 0) {
  const min = Number.isInteger(minimumBillingMinutes) ? minimumBillingMinutes : 0;
  if (min < 0) throw rentalError("VALIDATION_ERROR", "minimumBillingMinutes must be >= 0");
  return Math.max(actualMinutes, min);
}

export function unitMinutesFor(periodCode) {
  const m = UNIT_MINUTES[periodCode];
  if (!m) throw rentalError("VALIDATION_ERROR", `Unknown period code: ${periodCode}`);
  return m;
}

/**
 * Separate, strict rate resolution. Each candidate is either absent (undefined)
 * or an object with an integer `ratePaise`. A present zero wins. No fabrication.
 * negotiated only participates when authorized === true.
 * @returns {{ratePaise:number, source:string}}
 */
export function resolveRate({ negotiated, variantItem, productItem, defaultItem, negotiatedAuthorized = false }) {
  const candidates = [
    negotiatedAuthorized && isPresentRate(negotiated) ? ["negotiated", negotiated] : null,
    isPresentRate(variantItem) ? ["variant", variantItem] : null,
    isPresentRate(productItem) ? ["product", productItem] : null,
    isPresentRate(defaultItem) ? ["default", defaultItem] : null,
  ].filter(Boolean);
  if (candidates.length === 0) {
    throw rentalError("PRICE_NOT_CONFIGURED", "No applicable rate for line");
  }
  const [source, item] = candidates[0];
  const ratePaise = item.ratePaise;
  if (!Number.isInteger(ratePaise) || ratePaise < 0) {
    throw rentalError("PRICE_NOT_CONFIGURED", "Resolved rate is invalid");
  }
  return { ratePaise, source };
}

function isPresentRate(item) {
  return item != null && Object.hasOwn(item, "ratePaise");
}

const SOURCE_RANK = {
  [POLICY_SOURCE.LINE]: 0,
  [POLICY_SOURCE.PRODUCT]: 1,
  [POLICY_SOURCE.CATEGORY]: 2,
  [POLICY_SOURCE.ORGANIZATION]: 3,
  [POLICY_SOURCE.SYSTEM]: 4,
};

/**
 * Resolve one complete commercial policy object through the precedence chain.
 * `chain` is an ordered array highest→lowest of { level, policy } where policy
 * is present (own object) or absent (undefined/null). categoryChain may be an
 * array of category policies (nearest ancestor first).
 * Never merges fields across levels; explicit zero/false stops fallback.
 * @returns {{ policy: object, sourceLevel: string }}
 */
export function resolvePolicy(type, { line, product, categories = [], organization } = {}) {
  const ordered = [
    [POLICY_SOURCE.LINE, line],
    [POLICY_SOURCE.PRODUCT, product],
    ...categories.map((c) => [POLICY_SOURCE.CATEGORY, c]),
    [POLICY_SOURCE.ORGANIZATION, organization],
  ];
  for (const [level, policy] of ordered) {
    if (isPresentPolicy(policy)) {
      return { policy: { ...policy }, sourceLevel: level };
    }
  }
  return { policy: { ...SYSTEM_SAFE_POLICY[type] }, sourceLevel: POLICY_SOURCE.SYSTEM };
}

function isPresentPolicy(policy) {
  return policy != null && typeof policy === "object";
}

/**
 * Base rental line: pre-tax and GST paise.
 * mode=exclusive: rate is pre-tax; GST added.
 * mode=inclusive: rate is tax-inclusive; back-calc pre-tax + GST.
 */
export function computeLine({
  ratePaise,
  quantity,
  billableMinutes,
  unitMinutes,
  gstBps,
  mode = "exclusive",
}) {
  validateNonNegInt(ratePaise, "ratePaise");
  validateNonNegInt(quantity, "quantity");
  validateNonNegInt(billableMinutes, "billableMinutes");
  if (!Number.isInteger(unitMinutes) || unitMinutes <= 0) {
    throw rentalError("VALIDATION_ERROR", "unitMinutes must be positive");
  }
  validateBps(gstBps);
  const base = roundHalfUp(
    BigInt(ratePaise) * BigInt(quantity) * BigInt(billableMinutes),
    BigInt(unitMinutes)
  );
  if (mode === "inclusive") {
    // preTax = base * 10000 / (10000 + gstBps); gst = base - preTax
    const preTax = roundHalfUp(base * BPS_DEN, BPS_DEN + BigInt(gstBps));
    const gst = base - preTax;
    return {
      linePreTaxPaise: assertSafePaise(preTax),
      lineGstPaise: assertSafePaise(gst),
      lineGrossPaise: assertSafePaise(base),
      taxMode: "inclusive",
    };
  }
  const gst = roundHalfUp(base * BigInt(gstBps), BPS_DEN);
  return {
    linePreTaxPaise: assertSafePaise(base),
    lineGstPaise: assertSafePaise(gst),
    lineGrossPaise: assertSafePaise(base + gst),
    taxMode: "exclusive",
  };
}

/**
 * Order-level deposit, computed once. `lineDeposits` is an array of resolved
 * per-line deposit policy winners: { mode, valuePaise?|valueBps?, sourceLevel, quantity }.
 * preTaxSubtotalPaise is the finalized order subtotal.
 * Fixed → sum(quantity × valuePaise). Percentage → single highest-rank policy once.
 */
export function computeDeposit({ lineDeposits, preTaxSubtotalPaise }) {
  if (!Array.isArray(lineDeposits) || lineDeposits.length === 0) {
    return { depositPaise: 0, mode: POLICY_MODE.FIXED, snapshot: { mode: POLICY_MODE.FIXED, inputs: [] } };
  }
  const modes = new Set(lineDeposits.map((d) => d.mode));
  if (modes.has(POLICY_MODE.FIXED) && modes.has(POLICY_MODE.PERCENTAGE)) {
    throw rentalError("DEPOSIT_MODE_CONFLICT", "Lines resolve both fixed and percentage deposit modes");
  }
  if (modes.has(POLICY_MODE.FIXED)) {
    let sum = 0n;
    const inputs = [];
    for (const d of lineDeposits) {
      validateNonNegInt(d.valuePaise, "deposit.valuePaise");
      validateNonNegInt(d.quantity, "deposit.quantity");
      sum += BigInt(d.valuePaise) * BigInt(d.quantity);
      inputs.push({
        lineId: d.lineId ?? null,
        quantity: d.quantity,
        fixedPaisePerUnit: d.valuePaise,
        sourceLevel: d.sourceLevel,
      });
    }
    return {
      depositPaise: assertSafePaise(sum),
      mode: POLICY_MODE.FIXED,
      snapshot: { mode: POLICY_MODE.FIXED, inputs },
    };
  }
  // all percentage: pick the highest-precedence source rank present.
  const minRank = Math.min(...lineDeposits.map((d) => SOURCE_RANK[d.sourceLevel] ?? 99));
  const topWinners = lineDeposits.filter((d) => (SOURCE_RANK[d.sourceLevel] ?? 99) === minRank);
  const bpsValues = new Set(topWinners.map((d) => d.valueBps));
  if (bpsValues.size > 1) {
    throw rentalError("DEPOSIT_POLICY_CONFLICT", "Conflicting percentage deposit values at highest precedence");
  }
  const selectedBps = topWinners[0].valueBps;
  validateBps(selectedBps);
  const depositPaise = assertSafePaise(
    roundHalfUp(BigInt(preTaxSubtotalPaise) * BigInt(selectedBps), BPS_DEN)
  );
  return {
    depositPaise,
    mode: POLICY_MODE.PERCENTAGE,
    snapshot: {
      mode: POLICY_MODE.PERCENTAGE,
      selectedBps,
      sourceLevel: topWinners[0].sourceLevel,
    },
  };
}

/**
 * Late fee with a single order cap and largest-remainder allocation.
 * lateLines: [{ lineId, lateRatePaise, lateQuantity, lateActualMinutes, graceMinutes,
 *               lateUnitMinutes, gstBps }]
 * cap: resolved order cap { mode, valuePaise?|valueBps? } (must be identical across lines).
 */
export function computeLateFee({ lateLines, cap, originalPreTaxSubtotalPaise }) {
  const uncapped = lateLines.map((l) => {
    validateNonNegInt(l.lateRatePaise, "lateRatePaise");
    validateNonNegInt(l.lateQuantity, "lateQuantity");
    validateNonNegInt(l.lateActualMinutes, "lateActualMinutes");
    validateNonNegInt(l.graceMinutes, "graceMinutes");
    if (!Number.isInteger(l.lateUnitMinutes) || l.lateUnitMinutes <= 0) {
      throw rentalError("VALIDATION_ERROR", "lateUnitMinutes must be positive");
    }
    validateBps(l.gstBps);
    const chargeable = Math.max(0, l.lateActualMinutes - l.graceMinutes);
    const paise = roundHalfUp(
      BigInt(l.lateRatePaise) * BigInt(l.lateQuantity) * BigInt(chargeable),
      BigInt(l.lateUnitMinutes)
    );
    return { lineId: l.lineId, gstBps: l.gstBps, uncappedPaise: paise };
  });

  const totalUncapped = uncapped.reduce((s, u) => s + u.uncappedPaise, 0n);
  let capPaise;
  if (cap.mode === POLICY_MODE.FIXED) {
    validateNonNegInt(cap.valuePaise, "cap.valuePaise");
    capPaise = BigInt(cap.valuePaise);
  } else if (cap.mode === POLICY_MODE.PERCENTAGE) {
    validateBps(cap.valueBps);
    capPaise = roundHalfUp(BigInt(originalPreTaxSubtotalPaise) * BigInt(cap.valueBps), BPS_DEN);
  } else {
    throw rentalError("VALIDATION_ERROR", "Invalid cap mode");
  }

  const lateFeePaise = totalUncapped < capPaise ? totalUncapped : capPaise;

  // Largest-remainder allocation of lateFeePaise across lines proportional to uncapped.
  const allocations = allocateProportional(uncapped, totalUncapped, lateFeePaise);
  let lateGst = 0n;
  const perLine = allocations.map((a) => {
    const g = roundHalfUp(a.allocatedPaise * BigInt(a.gstBps), BPS_DEN);
    lateGst += g;
    return {
      lineId: a.lineId,
      allocatedLatePaise: assertSafePaise(a.allocatedPaise),
      lateGstPaise: assertSafePaise(g),
    };
  });

  return {
    lateFeePaise: assertSafePaise(lateFeePaise),
    lateGstPaise: assertSafePaise(lateGst),
    capPaise: assertSafePaise(capPaise),
    lines: perLine,
  };
}

/** Deterministic largest-remainder split, tie-break by lineId ascending. */
function allocateProportional(items, total, target) {
  if (target <= 0n || total <= 0n) {
    return items.map((i) => ({ ...i, allocatedPaise: 0n }));
  }
  if (target >= total) {
    return items.map((i) => ({ ...i, allocatedPaise: i.uncappedPaise }));
  }
  const withShares = items.map((i) => {
    const exact = i.uncappedPaise * target; // /total pending
    const floorVal = exact / total;
    const remainder = exact - floorVal * total;
    return { ...i, floorVal, remainder };
  });
  let allocated = withShares.reduce((s, i) => s + i.floorVal, 0n);
  let leftover = target - allocated;
  // distribute leftover paise to largest remainders, tie-break lineId asc.
  const order = [...withShares].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder > a.remainder ? 1 : -1;
    return String(a.lineId) < String(b.lineId) ? -1 : 1;
  });
  const bump = new Set();
  for (const item of order) {
    if (leftover <= 0n) break;
    bump.add(item.lineId);
    leftover -= 1n;
  }
  return withShares.map((i) => ({
    lineId: i.lineId,
    gstBps: i.gstBps,
    allocatedPaise: i.floorVal + (bump.has(i.lineId) ? 1n : 0n),
  }));
}

function validateNonNegInt(v, name) {
  if (!Number.isInteger(v) || v < 0) {
    throw rentalError("VALIDATION_ERROR", `${name} must be a non-negative integer`);
  }
}

function validateBps(v) {
  if (!Number.isInteger(v) || v < 0 || v > 10000) {
    throw rentalError("VALIDATION_ERROR", "GST/bps must be an integer 0..10000");
  }
}
