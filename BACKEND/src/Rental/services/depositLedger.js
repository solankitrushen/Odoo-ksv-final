// SPEC-RMS-001 / SPEC-RMS-PAY-002 deposit + accounting projections. Pure.
import { DEPOSIT_EVENT } from "../constants.js";
import { rentalError } from "../errors.js";

/**
 * Project deposit buckets from an append-only list of deposit entries.
 * Each entry: { eventType, amountPaise, state? }. Refund requests use state
 * pending|completed|failed|cancelled via their event types.
 * Enforces conservation and pending bounds; throws DEPOSIT_LEDGER_MISMATCH.
 */
export function projectDeposit(entries) {
  let collected = 0;
  let deductions = 0;
  let forfeited = 0;
  let refundsCompleted = 0;
  let refundsPending = 0;

  for (const e of entries) {
    const amt = e.amountPaise;
    if (!Number.isInteger(amt) || amt < 0) {
      throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Invalid deposit entry amount");
    }
    switch (e.eventType) {
      case DEPOSIT_EVENT.COLLECTED:
        collected += amt;
        break;
      case DEPOSIT_EVENT.APPLIED:
        deductions += amt;
        break;
      case DEPOSIT_EVENT.FORFEITED:
        forfeited += amt;
        break;
      case DEPOSIT_EVENT.REFUND_REQUESTED:
        refundsPending += amt;
        break;
      case DEPOSIT_EVENT.REFUND_COMPLETED:
        refundsPending -= amt;
        refundsCompleted += amt;
        break;
      case DEPOSIT_EVENT.REFUND_FAILED:
      case DEPOSIT_EVENT.REFUND_CANCELLED:
        refundsPending -= amt;
        break;
      default:
        throw rentalError("DEPOSIT_LEDGER_MISMATCH", `Unknown deposit event: ${e.eventType}`);
    }
  }

  const liability = collected - deductions - forfeited - refundsCompleted;
  if (liability < 0) {
    throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Deposit liability negative");
  }
  if (refundsPending < 0 || refundsPending > liability) {
    throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Deposit pending refund out of bounds");
  }
  // Conservation invariant.
  if (collected !== liability + deductions + forfeited + refundsCompleted) {
    throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Deposit conservation violated");
  }

  return {
    depositCollectedPaise: collected,
    deductionsPaise: deductions,
    forfeitedDepositPaise: forfeited,
    depositRefundsPendingPaise: refundsPending,
    depositRefundsCompletedPaise: refundsCompleted,
    depositLiabilityPaise: liability,
    refundableDepositPaise: Math.max(0, liability - refundsPending),
  };
}

/**
 * Portal-facing deposit status enum from projected buckets (+ optional expected deposit).
 * pending | held | partially_refunded | refunded | forfeited | applied
 */
export function deriveDepositStatus(proj, { expectedDepositPaise = 0 } = {}) {
  const collected = proj.depositCollectedPaise || 0;
  const forfeited = proj.forfeitedDepositPaise || 0;
  const deductions = proj.deductionsPaise || 0;
  const refunded = proj.depositRefundsCompletedPaise || 0;
  const liability = proj.depositLiabilityPaise || 0;
  const pendingRefund = proj.depositRefundsPendingPaise || 0;

  if (collected === 0 && expectedDepositPaise > 0) return "pending";
  if (collected === 0) return "pending";
  if (forfeited > 0 && liability === 0 && refunded === 0 && deductions === 0) return "forfeited";
  if (forfeited > 0 && liability === 0) return "forfeited";
  if (refunded > 0 && liability === 0 && pendingRefund === 0) return "refunded";
  if (refunded > 0 || pendingRefund > 0) return "partially_refunded";
  if (deductions > 0 && liability === 0) return "applied";
  if (liability > 0) return "held";
  return "held";
}

/**
 * Charge-side balance. paymentsPaise/refundsPaise are charge-allocated only.
 * balanceDue excludes forfeiture and deposit entirely.
 */
export function projectCharge({ chargeGrossPaise, paymentsPaise, refundsPaise, deductionsPaise }) {
  for (const [k, v] of Object.entries({ chargeGrossPaise, paymentsPaise, refundsPaise, deductionsPaise })) {
    if (!Number.isInteger(v) || v < 0) {
      throw rentalError("DEPOSIT_LEDGER_MISMATCH", `Invalid charge projection input: ${k}`);
    }
  }
  const balanceDuePaise = Math.max(0, chargeGrossPaise - paymentsPaise + refundsPaise - deductionsPaise);
  const chargeCreditPaise = Math.max(0, paymentsPaise - refundsPaise + deductionsPaise - chargeGrossPaise);
  return { balanceDuePaise, chargeCreditPaise };
}
