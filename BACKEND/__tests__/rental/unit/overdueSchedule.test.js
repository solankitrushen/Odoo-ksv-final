import { describe, expect, it } from "@jest/globals";
import { computeRentalLateFee, computeOverdueSchedule, buildMasterInvoiceParts } from "../../../src/Rental/services/lateFee.js";

const DAY = 24 * 60 * 60 * 1000;

function rentalFixture({ cap = { mode: "fixed", valuePaise: 100_000_000 }, days = 3, extraMs = 5 * 60 * 60 * 1000 } = {}) {
  const plannedEndAt = new Date("2026-01-01T00:00:00.000Z");
  const actualReturnedAt = new Date(plannedEndAt.getTime() + days * DAY + extraMs);
  return {
    plannedEndAt,
    actualReturnedAt,
    preTaxSubtotalPaise: 100000,
    bookedGstPaise: 18000,
    depositLiabilityPaise: 40000,
    paymentsPaise: 118000, // rent paid upfront
    lines: [
      {
        lineId: "L1",
        nameSnapshot: "Camera Kit",
        quantity: 1,
        periodCode: "day",
        lineGrossPaise: 118000,
        lateSnapshot: { enabled: true, ratePaise: 10000, periodCode: "day" },
        graceSnapshot: { minutes: 0 },
        capSnapshot: cap,
        taxSnapshot: { gstBps: 1800 },
      },
    ],
  };
}

describe("overdue per-day schedule reconciles with total late fee", () => {
  it("sum of per-day lines equals computeRentalLateFee (uncapped)", () => {
    const rental = rentalFixture();
    const total = computeRentalLateFee(rental);
    const sched = computeOverdueSchedule(rental);
    const sumFee = sched.reduce((s, l) => s + l.lateFeePaise, 0);
    const sumGst = sched.reduce((s, l) => s + l.lateGstPaise, 0);
    expect(sumFee).toBe(total.lateFeePaise);
    expect(sumGst).toBe(total.lateGstPaise);
    expect(sched.length).toBe(4); // 3 days + partial → 4 buckets
  });

  it("respects the cap: later days contribute 0, sum still equals capped total", () => {
    const rental = rentalFixture({ cap: { mode: "fixed", valuePaise: 15000 } });
    const total = computeRentalLateFee(rental);
    expect(total.lateFeePaise).toBe(15000);
    const sched = computeOverdueSchedule(rental);
    const sumFee = sched.reduce((s, l) => s + l.lateFeePaise, 0);
    expect(sumFee).toBe(15000);
    // once capped, at least one trailing day is zero
    expect(sched.some((l) => l.lateFeePaise === 0)).toBe(true);
  });

  it("master invoice deducts deposit as a credit, never as a charge line", () => {
    const rental = { ...rentalFixture(), status: "inspection" };
    const { lines, totals } = buildMasterInvoiceParts(rental);
    // no line is the deposit
    expect(lines.some((l) => /deposit/i.test(l.nameSnapshot))).toBe(false);
    // charges = rent + late(+gst); deposit applied against outstanding
    const late = computeRentalLateFee(rental);
    expect(totals.chargeGrossPaise).toBe(118000 + late.lateFeePaise + late.lateGstPaise);
    const outstanding = totals.chargeGrossPaise - totals.paymentsPaise;
    expect(totals.depositAppliedPaise).toBe(Math.min(40000, outstanding));
    expect(totals.finalPayablePaise).toBe(Math.max(0, outstanding - totals.depositAppliedPaise));
  });

  it("no overdue when returned on time", () => {
    const rental = rentalFixture({ days: 0, extraMs: 0 });
    rental.actualReturnedAt = rental.plannedEndAt;
    expect(computeOverdueSchedule(rental)).toEqual([]);
  });

  it("snapshot-less rental still gets a clear overdue penalty line from persisted totals", () => {
    const plannedEndAt = new Date("2026-01-01T00:00:00.000Z");
    const rental = {
      plannedEndAt,
      actualReturnedAt: new Date(plannedEndAt.getTime() + 3 * DAY),
      preTaxSubtotalPaise: 100000,
      bookedGstPaise: 18000,
      paymentsPaise: 118000,
      lateFeePaise: 45000,
      lateGstPaise: 8100,
      lines: [
        {
          lineId: "L1",
          nameSnapshot: "White Top",
          quantity: 1,
          lineGrossPaise: 118000,
          // no lateSnapshot — schedule days exist but fee deltas are 0
        },
      ],
    };
    const { lines, totals } = buildMasterInvoiceParts(rental);
    expect(totals.lateFeePaise).toBe(45000);
    expect(totals.lateGstPaise).toBe(8100);
    const overdue = lines.filter((l) => l.kind === "overdue");
    // Late fee and late GST are separate invoice lines so admin-entered GST is visible.
    expect(overdue.length).toBe(2);
    expect(overdue[0].nameSnapshot).toMatch(/Overdue penalty/i);
    expect(overdue[0].lineGrossPaise).toBe(45000);
    expect(overdue[1].nameSnapshot).toBe("Late GST");
    expect(overdue[1].lineGrossPaise).toBe(8100);
    expect(lines.some((l) => l.nameSnapshot === "White Top")).toBe(true);
  });
});
