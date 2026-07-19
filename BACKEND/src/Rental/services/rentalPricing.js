// Compute an authoritative rental quote/preview from draft lines. Server truth.
import crypto from "crypto";
import { resolveLinePricing } from "./catalogResolver.js";
import {
  computeActualMinutes,
  computeBillableMinutes,
  computeLine,
  computeDeposit,
} from "./pricing.js";

/**
 * @returns {{ lines, preTaxSubtotalPaise, bookedGstPaise, deposit, totalPaise,
 *             fingerprint, billableByLine, taxBreakdown }}
 */
export async function quoteRental(tenantId, rental) {
  const orderStartMs = rental.startAt ? new Date(rental.startAt).getTime() : Date.now();
  const orderEndMs = rental.endAt ? new Date(rental.endAt).getTime() : orderStartMs;

  const resolvedLines = [];
  const lineDeposits = [];
  const billableByLine = {};
  const taxBreakdownMap = new Map();
  let subtotal = 0;
  let gst = 0;

  for (const line of rental.lines) {
    const startMs = line.startAt ? new Date(line.startAt).getTime() : orderStartMs;
    const endMs = line.endAt ? new Date(line.endAt).getTime() : orderEndMs;
    const at = new Date(startMs);

    const r = await resolveLinePricing(tenantId, {
      variantId: line.variantId,
      periodCode: line.periodCode,
      at,
      overrides: line.overrides || {},
      negotiated: line.negotiatedRatePaise,
    });
    const actual = computeActualMinutes(startMs, endMs);
    const billable = computeBillableMinutes(actual, r.minimumBillingMinutes);
    billableByLine[line.lineId] = billable;

    const taxPol = r.policies.tax.policy || {};
    const gstBps = Number(taxPol.gstBps || 0);
    const mode = taxPol.mode === "inclusive" ? "inclusive" : "exclusive";
    const { linePreTaxPaise, lineGstPaise, lineGrossPaise, taxMode } = computeLine({
      ratePaise: r.ratePaise,
      quantity: line.quantity,
      billableMinutes: billable,
      unitMinutes: r.unitMinutes,
      gstBps,
      mode,
    });
    subtotal += linePreTaxPaise;
    gst += lineGstPaise;

    const taxKey = `${taxPol.code || "GST"}:${gstBps}:${taxMode}`;
    const prev = taxBreakdownMap.get(taxKey) || {
      code: taxPol.code || null,
      taxCodeId: taxPol.taxCodeId || null,
      rateBps: gstBps,
      mode: taxMode,
      taxablePaise: 0,
      taxPaise: 0,
    };
    prev.taxablePaise += linePreTaxPaise;
    prev.taxPaise += lineGstPaise;
    taxBreakdownMap.set(taxKey, prev);

    const depPolicy = r.policies.deposit.policy;
    lineDeposits.push({
      lineId: line.lineId,
      mode: depPolicy.mode,
      valuePaise: depPolicy.valuePaise,
      valueBps: depPolicy.valueBps,
      quantity: line.quantity,
      sourceLevel: r.policies.deposit.sourceLevel,
    });

    resolvedLines.push({
      lineId: line.lineId,
      productId: r.product._id,
      variantId: r.variant._id,
      nameSnapshot: r.variant.name,
      quantity: line.quantity,
      periodCode: r.periodCode,
      unitMinutes: r.unitMinutes,
      ratePaise: r.ratePaise,
      minimumBillingMinutes: r.minimumBillingMinutes,
      startAt: new Date(startMs),
      endAt: new Date(endMs),
      pricelistId: r.pricelistId,
      pricelistCode: r.pricelistCode,
      taxSnapshot: { ...taxPol, mode: taxMode },
      lateSnapshot: r.policies.late.policy,
      graceSnapshot: r.policies.grace.policy,
      capSnapshot: r.policies.cap.policy,
      linePreTaxPaise,
      lineGstPaise,
      lineGrossPaise,
    });
  }

  const deposit = computeDeposit({ lineDeposits, preTaxSubtotalPaise: subtotal });
  const totalPaise = subtotal + gst + deposit.depositPaise;
  const taxBreakdown = [...taxBreakdownMap.values()];

  const fpInput = {
    lines: resolvedLines.map((l) => ({
      lineId: l.lineId,
      variantId: String(l.variantId),
      quantity: l.quantity,
      ratePaise: l.ratePaise,
      billable: billableByLine[l.lineId],
      gstBps: l.taxSnapshot.gstBps,
      mode: l.taxSnapshot.mode,
      linePreTaxPaise: l.linePreTaxPaise,
      startAt: l.startAt?.toISOString?.() || l.startAt,
      endAt: l.endAt?.toISOString?.() || l.endAt,
    })),
    subtotal,
    gst,
    deposit: deposit.depositPaise,
  };
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(fpInput))
    .digest("hex");

  return {
    lines: resolvedLines,
    preTaxSubtotalPaise: subtotal,
    bookedGstPaise: gst,
    deposit,
    totalPaise,
    fingerprint,
    billableByLine,
    taxBreakdown,
  };
}
