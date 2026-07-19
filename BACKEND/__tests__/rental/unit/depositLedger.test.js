import { describe, it, expect } from "@jest/globals";
import { projectDeposit, projectCharge } from "../../../src/Rental/services/depositLedger.js";
import { DEPOSIT_EVENT } from "../../../src/Rental/constants.js";

const E = DEPOSIT_EVENT;

describe("deposit ledger — conservation", () => {
  it("collected only", () => {
    const p = projectDeposit([{ eventType: E.COLLECTED, amountPaise: 5000 }]);
    expect(p.depositLiabilityPaise).toBe(5000);
    expect(p.refundableDepositPaise).toBe(5000);
  });

  it("applied + forfeited reduce liability, conservation holds", () => {
    const p = projectDeposit([
      { eventType: E.COLLECTED, amountPaise: 5000 },
      { eventType: E.APPLIED, amountPaise: 3000 },
      { eventType: E.FORFEITED, amountPaise: 1500 },
    ]);
    expect(p.deductionsPaise).toBe(3000);
    expect(p.forfeitedDepositPaise).toBe(1500);
    expect(p.depositLiabilityPaise).toBe(500);
    expect(
      p.depositLiabilityPaise + p.deductionsPaise + p.forfeitedDepositPaise + p.depositRefundsCompletedPaise
    ).toBe(p.depositCollectedPaise);
  });

  it("pending refund remains liability, refundable excludes pending", () => {
    const p = projectDeposit([
      { eventType: E.COLLECTED, amountPaise: 5000 },
      { eventType: E.APPLIED, amountPaise: 1000 },
      { eventType: E.REFUND_REQUESTED, amountPaise: 4000 },
    ]);
    expect(p.depositLiabilityPaise).toBe(4000);
    expect(p.depositRefundsPendingPaise).toBe(4000);
    expect(p.refundableDepositPaise).toBe(0);
  });

  it("completed refund conserves", () => {
    const p = projectDeposit([
      { eventType: E.COLLECTED, amountPaise: 5000 },
      { eventType: E.APPLIED, amountPaise: 1000 },
      { eventType: E.REFUND_REQUESTED, amountPaise: 4000 },
      { eventType: E.REFUND_COMPLETED, amountPaise: 4000 },
    ]);
    expect(p.depositLiabilityPaise).toBe(0);
    expect(p.depositRefundsCompletedPaise).toBe(4000);
  });

  it("failed refund releases pending, keeps liability", () => {
    const p = projectDeposit([
      { eventType: E.COLLECTED, amountPaise: 5000 },
      { eventType: E.APPLIED, amountPaise: 1000 },
      { eventType: E.REFUND_REQUESTED, amountPaise: 4000 },
      { eventType: E.REFUND_FAILED, amountPaise: 4000 },
    ]);
    expect(p.depositLiabilityPaise).toBe(4000);
    expect(p.depositRefundsPendingPaise).toBe(0);
    expect(p.refundableDepositPaise).toBe(4000);
  });

  it("over-application throws", () => {
    let err;
    try {
      projectDeposit([
        { eventType: E.COLLECTED, amountPaise: 1000 },
        { eventType: E.APPLIED, amountPaise: 2000 },
      ]);
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe("DEPOSIT_LEDGER_MISMATCH");
  });
});

describe("charge projection", () => {
  it("balance due excludes deposit + forfeiture", () => {
    const c = projectCharge({ chargeGrossPaise: 15000, paymentsPaise: 10000, refundsPaise: 0, deductionsPaise: 3000 });
    expect(c.balanceDuePaise).toBe(2000);
  });
  it("charge refund raises balance again", () => {
    const c = projectCharge({ chargeGrossPaise: 10000, paymentsPaise: 10000, refundsPaise: 2500, deductionsPaise: 0 });
    expect(c.balanceDuePaise).toBe(2500);
  });
});
