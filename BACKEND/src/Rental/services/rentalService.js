// SPEC-RMS-001 rental workflow service. Transactional where multi-document.
import {
  RentalOrder,
  RentalCustomer,
  RentalAllocation,
  RentalAsset,
  RentalInvoice,
  RentalSettings,
  RentalCustomerAuth,
  RentalDepositEntry,
} from "../schema/index.js";
import VbUser from "../../Schema/VbUser.js";
import VbMembership from "../../Schema/VbMembership.js";
import { RENTAL_STATUS, ALLOCATION_STATUS, ASSET_STATE, DEPOSIT_EVENT } from "../constants.js";
import { canTransitionRental } from "./stateMachine.js";
import { quoteRental } from "./rentalPricing.js";
import { buildMasterInvoiceParts, computeRentalLateFee } from "./lateFee.js";
import { recomputeFinancials, recordManualPayment } from "./financeService.js";
import { withRentalTransaction } from "../db/tx.js";
import { writeAudit, nextSequence, formatNumber, guardIdempotency, storeIdempotency } from "./infra.js";
import { rentalError } from "../errors.js";
import { sendInvoiceEmail, sendSettlementShortfallAlert } from "./rentalMail.js";
import {
  getActiveTaxInvoice,
  recordInvoiceEmailDelivery,
  listInvoicesForRental,
  renderInvoicePdf,
  appendLedgerLineToInvoice,
  writeFinalInvoice,
} from "./invoiceService.js";

async function loadSettings(tenantId) {
  return (await RentalSettings.findOne({ tenantId }).lean()) || { numberingPrefix: "RENT", timezone: "Asia/Kolkata" };
}

async function loadRentalOr404(tenantId, rentalId, session = null) {
  const q = RentalOrder.findOne({ _id: rentalId, tenantId });
  const rental = session ? await q.session(session) : await q;
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  return rental;
}

/** Create a draft rental. Non-transactional single document. */
export async function createDraft(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "rental.create", key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const customer = await RentalCustomer.findOne({ _id: input.customerId, tenantId }).lean();
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");
  if (customer.status !== "active") {
    throw rentalError("INVALID_STATE_TRANSITION", "Customer is not active");
  }

  const settings = await loadSettings(tenantId);
  const seq = await nextSequence(tenantId, "rental");
  const lines = input.lines.map((l, i) => ({
    lineId: l.lineId || `L${i + 1}`,
    variantId: l.variantId,
    quantity: l.quantity,
    periodCode: l.periodCode || "day",
    startAt: l.startAt ? new Date(l.startAt) : null,
    endAt: l.endAt ? new Date(l.endAt) : null,
    locationId: l.locationId || null,
  }));
  const orderStart = input.startAt
    ? new Date(input.startAt)
    : new Date(Math.min(...lines.map((l) => (l.startAt || new Date()).getTime())));
  const orderEnd = input.endAt
    ? new Date(input.endAt)
    : new Date(Math.max(...lines.map((l) => (l.endAt || new Date()).getTime())));

  if (Number.isNaN(orderStart.getTime()) || Number.isNaN(orderEnd.getTime())) {
    throw rentalError("VALIDATION_ERROR", "Start and end must be valid dates");
  }
  if (orderEnd.getTime() <= orderStart.getTime()) {
    throw rentalError("VALIDATION_ERROR", "End / due back must be after start");
  }
  // Admin UI blocks past starts; allow historical windows for ops/backfill (tests + walk-in late).
  // ponytail: ceiling = no hard past ban here — FE enforces "from now" for new bookings.

  const rental = await RentalOrder.create({
    tenantId,
    rentalNumber: formatNumber(settings.numberingPrefix, "rental", seq),
    customerId: input.customerId,
    customerSnapshot: { displayName: customer.displayName, type: customer.type },
    status: RENTAL_STATUS.DRAFT,
    orderChannel: input.orderChannel || (actor.type === "customer" ? "customer" : "admin"),
    startAt: orderStart,
    endAt: orderEnd,
    plannedEndAt: orderEnd,
    timezone: input.timezone || settings.timezone,
    lines,
    addresses: input.addresses || null,
    fulfillment: input.fulfillment || null,
    notes: input.notes || null,
    version: 0,
  });

  let preview = null;
  try {
    preview = await quoteRental(tenantId, rental.toObject());
  } catch (e) {
    preview = { error: e.code || "PRICE_NOT_CONFIGURED" };
  }

  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "rental.create",
    resourceType: "RentalOrder", resourceId: String(rental._id), resourceVersion: 0,
  });

  const response = { rental: rental.toObject(), preview };
  await storeIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "rental.create",
    key: idempotencyKey, body: input, statusCode: 201, response,
  });
  return response;
}

/** Pure authoritative preview; no writes. */
export async function priceRental(tenantId, rentalId) {
  const rental = await loadRentalOr404(tenantId, rentalId);
  const preview = await quoteRental(tenantId, rental.toObject());
  return { preview };
}

/** Confirm a reserved rental: snapshot pricing, confirm allocations, invoice. */
export async function confirmRental(tenantId, { rentalId, expectedVersion, acknowledgedFingerprint, paymentPolicy }, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "rental.confirm", key: idempotencyKey,
    body: { rentalId, expectedVersion, acknowledgedFingerprint, paymentPolicy },
  });
  if (replay) return replay.response;

  const out = await withRentalTransaction(async (session) => {
    const rental = await loadRentalOr404(tenantId, rentalId, session);
    if (rental.status !== RENTAL_STATUS.RESERVED) {
      throw rentalError("INVALID_STATE_TRANSITION", "Only a reserved rental can be confirmed");
    }
    // SPEC-016: blacklist blocks confirm
    const { assertCustomerActive } = await import("./riskService.js");
    await assertCustomerActive(tenantId, rental.customerId);
    if (expectedVersion != null && rental.version !== expectedVersion) {
      throw rentalError("VERSION_CONFLICT", "Stale rental version", { currentVersion: rental.version });
    }
    if (rental.reservationExpiresAt && rental.reservationExpiresAt.getTime() < Date.now()) {
      throw rentalError("RESERVATION_EXPIRED", "Hold expired before confirmation");
    }
    const allocations = await RentalAllocation.find(
      { tenantId, rentalId: rental._id, status: ALLOCATION_STATUS.HELD },
      null,
      { session }
    );
    if (allocations.length === 0) {
      throw rentalError("RESERVATION_EXPIRED", "No active holds to confirm");
    }

    const quote = await quoteRental(tenantId, rental.toObject());
    if (acknowledgedFingerprint && acknowledgedFingerprint !== quote.fingerprint) {
      throw rentalError("PRICE_CHANGED", "Pricing changed since preview", { fingerprint: quote.fingerprint });
    }

    rental.lines = quote.lines;
    rental.preTaxSubtotalPaise = quote.preTaxSubtotalPaise;
    rental.bookedGstPaise = quote.bookedGstPaise;
    rental.confirmedBillableMinutesByLine = quote.billableByLine;
    rental.depositSnapshot = {
      mode: quote.deposit.mode,
      depositPaise: quote.deposit.depositPaise,
      selectedBps: quote.deposit.snapshot.selectedBps || null,
      sourceLevel: quote.deposit.snapshot.sourceLevel || null,
      inputs: quote.deposit.snapshot.inputs || [],
    };
    rental.pricingFingerprint = quote.fingerprint;
    rental.snapshotAt = new Date();
    rental.chargeGrossPaise = quote.preTaxSubtotalPaise + quote.bookedGstPaise;
    rental.balanceDuePaise = rental.chargeGrossPaise;
    rental.status = RENTAL_STATUS.CONFIRMED;
    rental.version += 1;

    for (const a of allocations) {
      a.status = ALLOCATION_STATUS.CONFIRMED;
      a.version += 1;
      await a.save({ session });
    }

    const settings = await loadSettings(tenantId);
    const invSeq = await nextSequence(tenantId, "invoice", session);
    const invoice = await RentalInvoice.create(
      [
        {
          tenantId,
          invoiceNumber: formatNumber(settings.numberingPrefix, "invoice", invSeq),
          rentalId: rental._id,
          customerId: rental.customerId,
          type: "tax_invoice",
          contentHash: quote.fingerprint,
          lines: quote.lines,
          totals: {
            preTaxSubtotalPaise: quote.preTaxSubtotalPaise,
            gstPaise: quote.bookedGstPaise,
            chargeGrossPaise: rental.chargeGrossPaise,
            taxBreakdown: quote.taxBreakdown || [],
          },
          depositSummary: { depositPaise: quote.deposit.depositPaise, mode: quote.deposit.mode },
          sourceVersion: rental.version,
        },
      ],
      { session }
    );
    rental.invoiceIds = [invoice[0]._id];
    await rental.save({ session });

    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "rental.confirm",
        resourceType: "RentalOrder", resourceId: String(rental._id), resourceVersion: rental.version,
      },
      session
    );

    const response = { rental: rental.toObject(), invoiceId: String(invoice[0]._id) };
    await storeIdempotency(
      {
        tenantId, actorType: actor.type, actorId: actor.id, scope: "rental.confirm", key: idempotencyKey,
        body: { rentalId, expectedVersion, acknowledgedFingerprint, paymentPolicy }, statusCode: 200, response,
      },
      session
    );
    return response;
  });
  // Best-effort invoice email after commit (never fail confirm).
  queueMicrotask(() => {
    emailInvoiceToCustomer(tenantId, out.invoiceId, out.rental).catch(() => {});
  });
  return out;
}

/** Generic guarded status transition helper for issue/return/inspect/close. */
async function transition(tenantId, rentalId, toStatus, mutate, actor, action) {
  return withRentalTransaction(async (session) => {
    const rental = await loadRentalOr404(tenantId, rentalId, session);
    if (!canTransitionRental(rental.status, toStatus)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot go ${rental.status} → ${toStatus}`);
    }
    await mutate(rental, session);
    rental.status = toStatus;
    rental.version += 1;
    await rental.save({ session });
    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action,
        resourceType: "RentalOrder", resourceId: String(rental._id), resourceVersion: rental.version,
      },
      session
    );
    return rental.toObject();
  });
}

export async function issueRental(tenantId, { rentalId }, actor) {
  return transition(tenantId, rentalId, RENTAL_STATUS.ACTIVE, async (rental, session) => {
    rental.actualIssuedAt = new Date();
    const allocs = await RentalAllocation.find({ tenantId, rentalId: rental._id, status: ALLOCATION_STATUS.CONFIRMED }, null, { session });
    for (const a of allocs) {
      a.status = ALLOCATION_STATUS.ACTIVE;
      a.version += 1;
      await a.save({ session });
      await RentalAsset.updateOne({ _id: a.assetId, tenantId }, { $set: { state: ASSET_STATE.RENTED }, $inc: { version: 1 } }, { session });
    }
  }, actor, "rental.issue");
}

export async function returnRental(tenantId, { rentalId, actualReturnedAt }, actor) {
  const rental = await withRentalTransaction(async (session) => {
    const doc = await loadRentalOr404(tenantId, rentalId, session);
    if (!canTransitionRental(doc.status, RENTAL_STATUS.RETURNED)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot go ${doc.status} → ${RENTAL_STATUS.RETURNED}`);
    }
    doc.actualReturnedAt = actualReturnedAt ? new Date(actualReturnedAt) : new Date();
    // Damage-only penalty policy: no late fee / late GST on return.
    doc.lateFeePaise = 0;
    doc.lateGstPaise = 0;
    doc.chargeGrossPaise =
      (doc.preTaxSubtotalPaise || 0) +
      (doc.bookedGstPaise || 0) +
      (doc.damagePreTaxPaise || 0) +
      (doc.damageGstPaise || 0);

    const allocs = await RentalAllocation.find(
      { tenantId, rentalId: doc._id, status: ALLOCATION_STATUS.ACTIVE },
      null,
      { session }
    );
    for (const a of allocs) {
      a.status = ALLOCATION_STATUS.COMPLETED;
      a.version += 1;
      await a.save({ session });
      await RentalAsset.updateOne(
        { _id: a.assetId, tenantId },
        { $set: { state: ASSET_STATE.INSPECTION }, $inc: { version: 1 } },
        { session }
      );
    }

    await recomputeFinancials(tenantId, doc, session);
    // Damage-only: keep late at zero after recompute.
    doc.lateFeePaise = 0;
    doc.lateGstPaise = 0;
    doc.chargeGrossPaise =
      (doc.preTaxSubtotalPaise || 0) +
      (doc.bookedGstPaise || 0) +
      (doc.damagePreTaxPaise || 0) +
      (doc.damageGstPaise || 0);
    // Deposit settlement happens on Clear & close / close — not on return.
    await appendLedgerLineToInvoice(
      tenantId,
      doc,
      {
        kind: "return",
        amountPaise: 0,
        chargePaise: 0,
        depositPaise: 0,
        reason: "recorded_return",
        lateFeePaise: 0,
        lateGstPaise: 0,
      },
      session
    );

    doc.status = RENTAL_STATUS.RETURNED;
    doc.version += 1;
    await doc.save({ session });
    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "rental.return",
        resourceType: "RentalOrder",
        resourceId: String(doc._id),
        resourceVersion: doc.version,
      },
      session
    );
    return doc.toObject();
  });

  // Email current tax invoice (with payment / deposit ledger lines) on Record return.
  queueMicrotask(() => {
    emailLatestInvoiceForRental(tenantId, rental).catch(() => {});
  });
  return rental;
}

/** Resend latest invoice email (admin action). */
export async function resendRentalInvoiceEmail(tenantId, rentalId) {
  const rental = await loadRentalOr404(tenantId, rentalId);
  return emailLatestInvoiceForRental(tenantId, rental);
}

async function emailLatestInvoiceForRental(tenantId, rental) {
  const inv = await getActiveTaxInvoice(tenantId, rental._id);
  const { items } = await listInvoicesForRental(tenantId, rental._id);
  const target = inv || items[0];
  if (!target) return { sent: false, skipped: true, reason: "no_invoice" };
  return emailInvoiceToCustomer(tenantId, String(target._id), rental);
}

export async function inspectRental(
  tenantId,
  {
    rentalId,
    damagePreTaxPaise = 0,
    damageGstPaise = 0,
    // lateFeePaise / lateGstPaise accepted by API for back-compat but ignored (damage-only).
    outcomes = [],
    photos,
    notes,
  },
  actor
) {
  if (!photos?.front || !photos?.side || !photos?.back) {
    throw rentalError("VALIDATION_ERROR", "Inspection requires photos.front, photos.side, photos.back");
  }
  const rental = await transition(tenantId, rentalId, RENTAL_STATUS.INSPECTION, async (doc, session) => {
    doc.damagePreTaxPaise = damagePreTaxPaise;
    doc.damageGstPaise = damageGstPaise;
    // Damage-only penalty policy: no late fee / late GST. Any values sent are ignored.
    doc.lateFeePaise = 0;
    doc.lateGstPaise = 0;
    doc.inspection = {
      photos: { front: photos.front, side: photos.side, back: photos.back },
      notes: notes || null,
      assessedAt: new Date(),
      assessedBy: actor?.id ? String(actor.id) : null,
    };
    doc.chargeGrossPaise =
      (doc.preTaxSubtotalPaise || 0) +
      (doc.bookedGstPaise || 0) +
      damagePreTaxPaise +
      damageGstPaise;
    await recomputeFinancials(tenantId, doc, session);
    // Damage-only: keep late at zero after recompute.
    doc.lateFeePaise = 0;
    doc.lateGstPaise = 0;
    const master = buildMasterInvoiceParts(doc);
    doc.chargeGrossPaise = master.totals.chargeGrossPaise;
    doc.balanceDuePaise = master.totals.finalPayablePaise;
    for (const o of outcomes) {
      if (o.assetId && o.assetState) {
        await RentalAsset.updateOne(
          { _id: o.assetId, tenantId },
          { $set: { state: o.assetState, condition: o.condition || undefined }, $inc: { version: 1 } },
          { session }
        );
      }
    }
  }, actor, "rental.inspect");

  // SPEC-007/016: damage → repair WO + risk incident (best-effort, outside txn)
  if (damagePreTaxPaise > 0) {
    try {
      const { ensureRepairForDamage } = await import("./repairService.js");
      await ensureRepairForDamage(tenantId, {
        rentalId,
        damagePreTaxPaise,
        notes,
        actor,
      });
    } catch {
      /* ponytail: repair WO failure must not roll back inspect */
    }
    try {
      const { ensureDamageIncident } = await import("./riskService.js");
      await ensureDamageIncident(tenantId, {
        rentalId,
        customerId: rental.customerId,
        amountPaise: damagePreTaxPaise,
        notes,
        actor,
      });
    } catch {
      /* ponytail: incident failure must not roll back inspect */
    }
  }
  return rental;
}

// computeRentalLateFee now lives in ./lateFee.js (leaf module); re-exported below.
export { computeRentalLateFee } from "./lateFee.js";

export async function closeRental(tenantId, { rentalId }, actor) {
  const out = await withRentalTransaction(async (session) => {
    const rental = await loadRentalOr404(tenantId, rentalId, session);
    if (!canTransitionRental(rental.status, RENTAL_STATUS.CLOSED)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot close from ${rental.status}`);
    }

    // Damage-only penalty policy: no late fee / late GST at close.
    rental.lateFeePaise = 0;
    rental.lateGstPaise = 0;
    rental.chargeGrossPaise =
      (rental.preTaxSubtotalPaise || 0) +
      (rental.bookedGstPaise || 0) +
      (rental.damagePreTaxPaise || 0) +
      (rental.damageGstPaise || 0);

    await recomputeFinancials(tenantId, rental, session);
    // Damage-only: keep late at zero after recompute.
    rental.lateFeePaise = 0;
    rental.lateGstPaise = 0;
    rental.chargeGrossPaise =
      (rental.preTaxSubtotalPaise || 0) +
      (rental.bookedGstPaise || 0) +
      (rental.damagePreTaxPaise || 0) +
      (rental.damageGstPaise || 0);

    // Deposit at close covers remaining late/damage (and any unpaid charges) via ledger apply.
    const outstandingBeforeDeposit = Math.max(
      0,
      (rental.chargeGrossPaise || 0) - (rental.paymentsPaise || 0) - (rental.deductionsPaise || 0)
    );
    if (outstandingBeforeDeposit > 0 && rental.depositLiabilityPaise > 0) {
      const applyPaise = Math.min(outstandingBeforeDeposit, rental.depositLiabilityPaise);
      await RentalDepositEntry.create(
        [
          {
            tenantId, rentalId: rental._id, eventType: DEPOSIT_EVENT.APPLIED, amountPaise: applyPaise,
            reason: "penalty_settlement", idempotencyKey: `close:${rental._id}:apply`, actorId: actor.id,
          },
        ],
        { session }
      );
      await recomputeFinancials(tenantId, rental, session);
    }
    if (rental.refundableDepositPaise > 0) {
      const refundPaise = rental.refundableDepositPaise;
      await RentalDepositEntry.create(
        [
          {
            tenantId, rentalId: rental._id, eventType: DEPOSIT_EVENT.REFUND_REQUESTED, amountPaise: refundPaise,
            reason: "return_refund", idempotencyKey: `close:${rental._id}:refundreq`, actorId: actor.id,
          },
          {
            tenantId, rentalId: rental._id, eventType: DEPOSIT_EVENT.REFUND_COMPLETED, amountPaise: refundPaise,
            reason: "return_refund_cash", idempotencyKey: `close:${rental._id}:refunddone`, actorId: actor.id,
          },
        ],
        { session }
      );
      await recomputeFinancials(tenantId, rental, session);
    }

    // Release any assets still in inspection back to available.
    const allocs = await RentalAllocation.find({ tenantId, rentalId: rental._id }, null, { session });
    for (const a of allocs) {
      await RentalAsset.updateOne(
        { _id: a.assetId, tenantId, state: ASSET_STATE.INSPECTION },
        { $set: { state: ASSET_STATE.AVAILABLE }, $inc: { version: 1 } },
        { session }
      );
    }
    const shortfall = Math.max(0, rental.balanceDuePaise || 0);
    rental.settlementShortfallPaise = shortfall;
    rental.status = RENTAL_STATUS.CLOSED;
    rental.version += 1;
    await rental.save({ session });

    // Master/settlement invoice (deposit applied as a credit); carries the payment ledger.
    const priorTax = await getActiveTaxInvoice(tenantId, rental._id, session);
    const finalInv = await writeFinalInvoice(tenantId, rental, { session });
    finalInv.totals = { ...(finalInv.totals || {}), settlementShortfallPaise: shortfall };
    if (priorTax?.paymentLines?.length) {
      finalInv.paymentLines = [...priorTax.paymentLines];
    }
    await finalInv.save({ session });
    if (!(rental.invoiceIds || []).some((id) => String(id) === String(finalInv._id))) {
      rental.invoiceIds = [...(rental.invoiceIds || []), finalInv._id];
      await rental.save({ session });
    }

    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "rental.close",
        resourceType: "RentalOrder", resourceId: String(rental._id), resourceVersion: rental.version,
      },
      session
    );

    return {
      rental: rental.toObject(),
      finalInvoiceId: String(finalInv._id),
      shortfall,
    };
  });
  // After commit — email final invoice + shortfall alert (never fail close).
  queueMicrotask(() => {
    emailInvoiceToCustomer(tenantId, out.finalInvoiceId, out.rental).catch(() => {});
    if (out.shortfall > 0) notifySettlementShortfall(tenantId, out.rental).catch(() => {});
  });
  return out.rental;
}

/**
 * Explicit "Generate invoice" — build/refresh the master invoice from current
 * numbers and add it to the rental's invoice history. Does not change status.
 */
export async function generateMasterInvoice(tenantId, { rentalId }, actor) {
  const rental = await loadRentalOr404(tenantId, rentalId);
  // Recompute syncs late fees + balanceDue from buildMasterInvoiceParts (SSOT).
  await recomputeFinancials(tenantId, rental);
  await rental.save();
  const inv = await writeFinalInvoice(tenantId, rental);
  if (!(rental.invoiceIds || []).some((id) => String(id) === String(inv._id))) {
    rental.invoiceIds = [...(rental.invoiceIds || []), inv._id];
    await rental.save();
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "rental.invoice.generate",
    resourceType: "RentalInvoice", resourceId: String(inv._id),
  });
  return { rental: rental.toObject(), invoice: inv.toObject(), invoiceId: String(inv._id) };
}

/**
 * "Clear" — settle outstanding payable and close.
 * Allowed from `inspection` (close + settle) or already-`closed` with a balance
 * (settle only — idempotent if someone closed without collecting cash).
 */
export async function clearRental(tenantId, { rentalId }, actor) {
  const current = await loadRentalOr404(tenantId, rentalId);
  let closed;
  if (current.status === RENTAL_STATUS.INSPECTION) {
    closed = await closeRental(tenantId, { rentalId }, actor);
  } else if (current.status === RENTAL_STATUS.CLOSED) {
    closed = current.toObject();
  } else {
    throw rentalError(
      "INVALID_STATE_TRANSITION",
      `Clear requires inspection photos saved first (status inspection), or closed with balance. Current: ${current.status}`
    );
  }
  // Payable after deposit credit — same number as PDF TOTAL PAYABLE.
  const outstanding = Math.max(0, buildMasterInvoiceParts(closed).totals.finalPayablePaise);
  if (outstanding > 0) {
    await recordManualPayment(
      tenantId,
      {
        rentalId,
        amountPaise: outstanding,
        allocation: { chargePaise: outstanding, depositPaise: 0 },
        method: "cash",
        reason: "settlement_clear",
      },
      actor,
      `clear:${rentalId}:${closed.version}`
    );
  }
  const fresh = await loadRentalOr404(tenantId, rentalId);
  await recomputeFinancials(tenantId, fresh);
  await fresh.save();
  await writeFinalInvoice(tenantId, fresh);
  return fresh.toObject();
}

async function emailInvoiceToCustomer(tenantId, invoiceId, rental) {
  const auth = await RentalCustomerAuth.findOne({ tenantId, customerId: rental.customerId })
    .select("email")
    .lean();
  if (!auth?.email) {
    await recordInvoiceEmailDelivery(tenantId, invoiceId, {
      sent: false,
      skipped: true,
      reason: "no_email",
    });
    return { sent: false, skipped: true, reason: "no_email" };
  }
  let pdfBuffer = null;
  let filename = null;
  let invoiceNumber = invoiceId;
  let invoiceType = "tax_invoice";
  let totals = {};
  try {
    const rendered = await renderInvoicePdf(tenantId, invoiceId);
    pdfBuffer = rendered.pdf;
    filename = rendered.filename;
    invoiceNumber = rendered.invoice?.invoiceNumber || invoiceNumber;
    invoiceType = rendered.invoice?.type || invoiceType;
    totals = rendered.invoice?.totals || {};
  } catch {
    /* ponytail: still send text summary if PDF build fails */
  }
  // SSOT: same master settlement numbers as PDF / dashboard.
  const master = buildMasterInvoiceParts(rental);
  totals = {
    ...totals,
    ...master.totals,
    balanceDuePaise: master.totals.finalPayablePaise,
  };
  let overdueLabel = null;
  try {
    const { getPenaltyBreakdown } = await import("./scheduleService.js");
    const breakdown = await getPenaltyBreakdown(tenantId, rental._id || rental.id);
    overdueLabel = breakdown.overdueMinutes > 0 ? breakdown.overdueLabel : null;
  } catch {
    /* ignore — email still useful without overdue label */
  }
  const mail = await sendInvoiceEmail({
    customerEmail: auth.email,
    rentalNumber: rental.rentalNumber,
    invoiceNumber,
    invoiceType,
    totals,
    overdueLabel,
    pdfBuffer,
    filename,
  });
  const result = {
    sent: Boolean(mail?.sent),
    skipped: Boolean(mail?.skipped),
    error: mail?.error || null,
    reason: mail?.reason || null,
    to: auth.email,
  };
  await recordInvoiceEmailDelivery(tenantId, invoiceId, result);
  return result;
}

async function notifySettlementShortfall(tenantId, rental) {
  const auth = await RentalCustomerAuth.findOne({ tenantId, customerId: rental.customerId })
    .select("email")
    .lean();
  const memberships = await VbMembership.find({ tenantId, status: "active" }).select("userId").limit(5).lean();
  const admins = memberships.length
    ? await VbUser.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("email").lean()
    : [];
  const adminEmail = admins[0]?.email || null;
  const damagePaise = (rental.damagePreTaxPaise || 0) + (rental.damageGstPaise || 0);
  await sendSettlementShortfallAlert({
    customerEmail: auth?.email || null,
    adminEmail,
    rentalNumber: rental.rentalNumber,
    shortfallPaise: rental.settlementShortfallPaise || rental.balanceDuePaise || 0,
    lateFeePaise: (rental.lateFeePaise || 0) + (rental.lateGstPaise || 0),
    damagePaise,
    depositCollectedPaise: rental.depositCollectedPaise || 0,
  });
  await RentalOrder.updateOne(
    { _id: rental._id, tenantId },
    { $set: { settlementAlertSentAt: new Date() } }
  );
}

export async function cancelRental(tenantId, { rentalId, reason }, actor) {
  return withRentalTransaction(async (session) => {
    const rental = await loadRentalOr404(tenantId, rentalId, session);
    if (rental.actualIssuedAt) {
      throw rentalError("INVALID_STATE_TRANSITION", "Issued rental cannot be plainly cancelled");
    }
    if (!canTransitionRental(rental.status, RENTAL_STATUS.CANCELLED)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot cancel from ${rental.status}`);
    }
    const allocs = await RentalAllocation.find(
      { tenantId, rentalId: rental._id, status: { $in: [ALLOCATION_STATUS.HELD, ALLOCATION_STATUS.CONFIRMED] } },
      null,
      { session }
    );
    for (const a of allocs) {
      a.status = ALLOCATION_STATUS.CANCELLED;
      a.version += 1;
      await a.save({ session });
      await RentalAsset.updateOne(
        { _id: a.assetId, tenantId, state: ASSET_STATE.HELD },
        { $set: { state: ASSET_STATE.AVAILABLE }, $inc: { version: 1 } },
        { session }
      );
    }
    rental.status = RENTAL_STATUS.CANCELLED;
    rental.notes = reason ? `${rental.notes || ""}\nCANCELLED: ${reason}` : rental.notes;
    rental.version += 1;
    await rental.save({ session });
    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "rental.cancel", reason,
        resourceType: "RentalOrder", resourceId: String(rental._id), resourceVersion: rental.version,
      },
      session
    );
    return rental.toObject();
  });
}
