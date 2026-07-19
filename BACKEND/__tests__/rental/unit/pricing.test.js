import { describe, it, expect } from "@jest/globals";
import {
  roundHalfUp,
  computeActualMinutes,
  computeBillableMinutes,
  computeLine,
  computeDeposit,
  computeLateFee,
  resolveRate,
  resolvePolicy,
} from "../../../src/Rental/services/pricing.js";
import { POLICY_MODE, POLICY_SOURCE } from "../../../src/Rental/constants.js";

/** Assert a thrown RentalError carries the expected stable code. */
function expectCode(fn, code) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  expect(err.code).toBe(code);
}

describe("rental pricing — rounding", () => {
  it("half-up: 100/60 → 2", () => {
    expect(Number(roundHalfUp(100n, 60n))).toBe(2);
  });
  it("exact half rounds up: 1/2 → 1", () => {
    expect(Number(roundHalfUp(1n, 2n))).toBe(1);
  });
  it("just below half rounds down: 149/300 → 0", () => {
    expect(Number(roundHalfUp(149n, 300n))).toBe(0);
  });
});

describe("rental pricing — minutes", () => {
  it("equal timestamps → 0", () => {
    expect(computeActualMinutes(0, 0)).toBe(0);
  });
  it("positive partial minute → 1", () => {
    expect(computeActualMinutes(0, 1)).toBe(1);
  });
  it("61 minutes exact", () => {
    expect(computeActualMinutes(0, 61 * 60000)).toBe(61);
  });
  it("minimum billing floor applies", () => {
    expect(computeBillableMinutes(45, 60)).toBe(60);
    expect(computeBillableMinutes(61, 0)).toBe(61);
  });
});

describe("rental pricing — line + deposit executable examples", () => {
  it("inclusive GST18% on ₹118: preTax 100 + gst 18", () => {
    const { linePreTaxPaise, lineGstPaise, lineGrossPaise } = computeLine({
      ratePaise: 11800,
      quantity: 1,
      billableMinutes: 60,
      unitMinutes: 60,
      gstBps: 1800,
      mode: "inclusive",
    });
    expect(lineGrossPaise).toBe(11800);
    expect(linePreTaxPaise).toBe(10000);
    expect(lineGstPaise).toBe(1800);
  });

  it("minimum hour: ₹120/hr, 45min, min60, GST18%, deposit25%", () => {
    const billable = computeBillableMinutes(computeActualMinutes(0, 45 * 60000), 60);
    const { linePreTaxPaise, lineGstPaise } = computeLine({
      ratePaise: 12000,
      quantity: 1,
      billableMinutes: billable,
      unitMinutes: 60,
      gstBps: 1800,
    });
    expect(linePreTaxPaise).toBe(12000);
    expect(lineGstPaise).toBe(2160);
    const dep = computeDeposit({
      lineDeposits: [{ mode: POLICY_MODE.PERCENTAGE, valueBps: 2500, sourceLevel: POLICY_SOURCE.PRODUCT }],
      preTaxSubtotalPaise: 12000,
    });
    expect(dep.depositPaise).toBe(3000);
  });

  it("partial hour: ₹120/hr, 61min → 12200", () => {
    const { linePreTaxPaise } = computeLine({
      ratePaise: 12000,
      quantity: 1,
      billableMinutes: 61,
      unitMinutes: 60,
      gstBps: 0,
    });
    expect(linePreTaxPaise).toBe(12200);
  });

  it("fixed month 30 vs 31 days", () => {
    const d30 = computeLine({ ratePaise: 3000000, quantity: 1, billableMinutes: 43200, unitMinutes: 43200, gstBps: 0 });
    expect(d30.linePreTaxPaise).toBe(3000000);
    const d31 = computeLine({ ratePaise: 3000000, quantity: 1, billableMinutes: 44640, unitMinutes: 43200, gstBps: 0 });
    expect(d31.linePreTaxPaise).toBe(3100000); // 3000000*44640/43200
  });

  it("fixed deposit is sum of per-unit × quantity, not max", () => {
    const dep = computeDeposit({
      lineDeposits: [
        { mode: POLICY_MODE.FIXED, valuePaise: 1000, quantity: 2, sourceLevel: POLICY_SOURCE.PRODUCT },
        { mode: POLICY_MODE.FIXED, valuePaise: 500, quantity: 3, sourceLevel: POLICY_SOURCE.PRODUCT },
      ],
      preTaxSubtotalPaise: 99999,
    });
    expect(dep.depositPaise).toBe(3500);
  });

  it("percentage deposit applied once to subtotal", () => {
    const dep = computeDeposit({
      lineDeposits: [
        { mode: POLICY_MODE.PERCENTAGE, valueBps: 2500, sourceLevel: POLICY_SOURCE.PRODUCT },
        { mode: POLICY_MODE.PERCENTAGE, valueBps: 2500, sourceLevel: POLICY_SOURCE.PRODUCT },
      ],
      preTaxSubtotalPaise: 30000,
    });
    expect(dep.depositPaise).toBe(7500);
  });

  it("mixed deposit modes reject", () => {
    expectCode(
      () =>
        computeDeposit({
          lineDeposits: [
            { mode: POLICY_MODE.FIXED, valuePaise: 0, quantity: 1, sourceLevel: POLICY_SOURCE.PRODUCT },
            { mode: POLICY_MODE.PERCENTAGE, valueBps: 2500, sourceLevel: POLICY_SOURCE.PRODUCT },
          ],
          preTaxSubtotalPaise: 30000,
        }),
      "DEPOSIT_MODE_CONFLICT"
    );
  });

  it("same-rank differing percentage rejects", () => {
    expectCode(
      () =>
        computeDeposit({
          lineDeposits: [
            { mode: POLICY_MODE.PERCENTAGE, valueBps: 2000, sourceLevel: POLICY_SOURCE.PRODUCT },
            { mode: POLICY_MODE.PERCENTAGE, valueBps: 2500, sourceLevel: POLICY_SOURCE.PRODUCT },
          ],
          preTaxSubtotalPaise: 30000,
        }),
      "DEPOSIT_POLICY_CONFLICT"
    );
  });
});

describe("rental pricing — late fee cap + allocation", () => {
  it("percentage cap limits fee and taxes on capped amount", () => {
    const res = computeLateFee({
      lateLines: [
        { lineId: "a", lateRatePaise: 12000, lateQuantity: 1, lateActualMinutes: 90, graceMinutes: 0, lateUnitMinutes: 60, gstBps: 1800 },
      ],
      cap: { mode: POLICY_MODE.PERCENTAGE, valueBps: 5000 },
      originalPreTaxSubtotalPaise: 12000,
    });
    expect(res.lateFeePaise).toBe(6000);
    expect(res.lateGstPaise).toBe(1080);
  });

  it("grace reduces chargeable minutes", () => {
    const res = computeLateFee({
      lateLines: [
        { lineId: "a", lateRatePaise: 6000, lateQuantity: 1, lateActualMinutes: 45, graceMinutes: 15, lateUnitMinutes: 60, gstBps: 0 },
      ],
      cap: { mode: POLICY_MODE.FIXED, valuePaise: 10000 },
      originalPreTaxSubtotalPaise: 12000,
    });
    expect(res.lateFeePaise).toBe(3000);
  });

  it("largest-remainder allocation sums exactly to capped fee", () => {
    const res = computeLateFee({
      lateLines: [
        { lineId: "a", lateRatePaise: 100, lateQuantity: 1, lateActualMinutes: 60, graceMinutes: 0, lateUnitMinutes: 60, gstBps: 0 },
        { lineId: "b", lateRatePaise: 100, lateQuantity: 1, lateActualMinutes: 60, graceMinutes: 0, lateUnitMinutes: 60, gstBps: 0 },
        { lineId: "c", lateRatePaise: 100, lateQuantity: 1, lateActualMinutes: 60, graceMinutes: 0, lateUnitMinutes: 60, gstBps: 0 },
      ],
      cap: { mode: POLICY_MODE.FIXED, valuePaise: 100 }, // 300 uncapped → capped to 100
      originalPreTaxSubtotalPaise: 100000,
    });
    const sum = res.lines.reduce((s, l) => s + l.allocatedLatePaise, 0);
    expect(sum).toBe(100);
  });
});

describe("rental pricing — rate & policy precedence", () => {
  it("present zero rate wins over lower level", () => {
    const r = resolveRate({ variantItem: { ratePaise: 0 }, productItem: { ratePaise: 5000 } });
    expect(r).toEqual({ ratePaise: 0, source: "variant" });
  });
  it("missing rate everywhere → PRICE_NOT_CONFIGURED", () => {
    expectCode(() => resolveRate({}), "PRICE_NOT_CONFIGURED");
  });
  it("negotiated ignored unless authorized", () => {
    const r = resolveRate({ negotiated: { ratePaise: 1 }, productItem: { ratePaise: 5000 } });
    expect(r.source).toBe("product");
    const r2 = resolveRate({ negotiated: { ratePaise: 1 }, productItem: { ratePaise: 5000 }, negotiatedAuthorized: true });
    expect(r2.source).toBe("negotiated");
  });
  it("explicit zero GST at product stops fallback to category", () => {
    const { policy, sourceLevel } = resolvePolicy("tax", {
      product: { gstBps: 0 },
      categories: [{ gstBps: 1800 }],
      organization: { gstBps: 1200 },
    });
    expect(policy.gstBps).toBe(0);
    expect(sourceLevel).toBe(POLICY_SOURCE.PRODUCT);
  });
  it("absent policy falls through to system safe default", () => {
    const { policy, sourceLevel } = resolvePolicy("late", {});
    expect(policy).toEqual({ enabled: false });
    expect(sourceLevel).toBe(POLICY_SOURCE.SYSTEM);
  });
});
