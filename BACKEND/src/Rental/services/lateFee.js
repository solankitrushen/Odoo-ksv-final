// Settlement invoice builder. Penalty policy: DAMAGE ONLY.
// Late fees, per-day overdue accrual, and late GST are intentionally disabled —
// the only penalty is an admin-entered damage charge at inspection.
function plain(rental) {
  return typeof rental?.toObject === "function" ? rental.toObject() : rental;
}

/**
 * Late fees are disabled (damage-only policy). Always zero.
 * Kept as a stable export so callers (return/inspect/schedule) need no changes.
 */
export function computeRentalLateFee() {
  return { lateFeePaise: 0, lateGstPaise: 0 };
}

/** Overdue day accrual is disabled (damage-only policy). Always empty. */
export function computeOverdueSchedule() {
  return [];
}

/**
 * Build the master/settlement invoice parts from a rental's current numbers.
 * Deposit is a HELD CREDIT applied against outstanding charges (never a charge line).
 * finalPayable = charges − charge payments − deposit applied.
 */
export function buildMasterInvoiceParts(rental) {
  const r = plain(rental);
  // Damage-only penalty policy: no overdue accrual, no late fee, no late GST.
  const lateFeePaise = 0;
  const lateGstPaise = 0;

  const rentLines = (r.lines || []).map((line) => {
    const gross =
      line.lineGrossPaise != null
        ? Number(line.lineGrossPaise)
        : Number(line.linePreTaxPaise || 0) + Number(line.lineGstPaise || 0);
    return {
      kind: "rent",
      nameSnapshot: line.nameSnapshot || "Rental item",
      quantity: line.quantity || 1,
      lineGrossPaise: gross,
    };
  });

  // Damage is the only penalty. Admin enters it (with its own GST) at inspection.
  const damagePreTaxPaise = Number(r.damagePreTaxPaise || 0);
  const damageGstPaise = Number(r.damageGstPaise || 0);
  const damageGross = damagePreTaxPaise + damageGstPaise;
  const damageLines =
    damageGross > 0
      ? [{ kind: "damage", nameSnapshot: "Damage / penalty charge", quantity: 1, lineGrossPaise: damageGross }]
      : [];

  const preTaxSubtotalPaise = Number(r.preTaxSubtotalPaise || 0);
  const rentGstPaise = Number(r.bookedGstPaise || 0);
  const chargeGrossPaise = preTaxSubtotalPaise + rentGstPaise + damageGross;
  const paymentsPaise = Number(r.paymentsPaise || 0);
  // deductionsPaise = deposit ALREADY applied to charges (post-close);
  // depositLiabilityPaise = deposit still held — only credits payable at settlement.
  // Never read r.balanceDuePaise here — it is an output and would double-apply deposit.
  const deductionsPaise = Number(r.deductionsPaise || 0);
  const depositHeldPaise = Number(r.depositLiabilityPaise || 0);
  const outstandingPaise = Math.max(0, chargeGrossPaise - paymentsPaise - deductionsPaise);
  const settlementStatuses = new Set([
    "overdue",
    "return_pending",
    "returned",
    "inspection",
    "closed",
    "exception",
  ]);
  const applyHeldNow = settlementStatuses.has(String(r.status || ""));
  const applyNowPaise = applyHeldNow ? Math.min(depositHeldPaise, outstandingPaise) : 0;
  const depositAppliedPaise = deductionsPaise + applyNowPaise;
  const finalPayablePaise = Math.max(0, outstandingPaise - applyNowPaise);
  const depositRefundablePaise = Math.max(0, depositHeldPaise - applyNowPaise);

  return {
    lines: [...rentLines, ...damageLines],
    totals: {
      preTaxSubtotalPaise,
      gstPaise: rentGstPaise,
      lateFeePaise,
      lateGstPaise,
      damagePreTaxPaise,
      damageGstPaise,
      chargeGrossPaise,
      paymentsPaise,
      depositHeldPaise,
      depositAppliedPaise,
      depositRefundablePaise,
      finalPayablePaise,
      balanceDuePaise: finalPayablePaise,
    },
  };
}
