// SPEC-RMS-PAY-002 payments, deposit ledger, refunds, and projections.
import crypto from "crypto";
import { RentalOrder, RentalPayment, RentalDepositEntry } from "../schema/index.js";
import {
  PAYMENT_DIRECTION,
  DEPOSIT_EVENT,
  FORFEIT_CATEGORIES,
  PROVIDERS,
  RENTAL_STATUS,
} from "../constants.js";
import { projectDeposit, projectCharge } from "./depositLedger.js";
import { buildMasterInvoiceParts, computeRentalLateFee } from "./lateFee.js";
import { withRentalTransaction } from "../db/tx.js";
import { writeAudit, guardIdempotency, storeIdempotency } from "./infra.js";
import { rentalError } from "../errors.js";
import { evaluateProviderOperation } from "../config.js";
import { quoteRental } from "./rentalPricing.js";
import * as razorpay from "../integrations/payments/razorpayAdapter.js";
import { appendLedgerLineToInvoice } from "./invoiceService.js";

/**
 * Recompute all financial projections on the order from immutable ledgers.
 * Total payable (balanceDuePaise) is SSOT from buildMasterInvoiceParts:
 * charges − charge payments − deposit credit (held or already applied).
 */
export async function recomputeFinancials(tenantId, rental, session) {
  const opt = session ? { session } : {};
  const payments = await RentalPayment.find({ tenantId, rentalId: rental._id }, null, opt).lean();
  const deposits = await RentalDepositEntry.find({ tenantId, rentalId: rental._id }, null, opt).lean();

  let paymentsPaise = 0;
  let refundsPaise = 0;
  for (const p of payments) {
    if (p.direction === PAYMENT_DIRECTION.CHARGE && ["captured", "processed"].includes(p.status)) {
      paymentsPaise += p.allocation?.chargePaise || 0;
    }
    if (p.direction === PAYMENT_DIRECTION.CHARGE && p.status === "voided") {
      paymentsPaise -= p.allocation?.chargePaise || 0;
    }
    if (p.direction === PAYMENT_DIRECTION.REFUND && ["processed", "captured"].includes(p.status)) {
      refundsPaise += p.allocation?.chargePaise || 0;
    }
  }

  const dep = projectDeposit(deposits);

  rental.paymentsPaise = Math.max(0, paymentsPaise);
  rental.refundsPaise = refundsPaise;
  rental.depositCollectedPaise = dep.depositCollectedPaise;
  rental.deductionsPaise = dep.deductionsPaise;
  rental.forfeitedDepositPaise = dep.forfeitedDepositPaise;
  rental.depositRefundsPendingPaise = dep.depositRefundsPendingPaise;
  rental.depositRefundsCompletedPaise = dep.depositRefundsCompletedPaise;
  rental.depositLiabilityPaise = dep.depositLiabilityPaise;
  rental.refundableDepositPaise = dep.refundableDepositPaise;

  // Sync live late/damage into charge gross, then settle payable (PDF / dashboard / email).
  // After inspection, keep admin-adjusted late fee / late GST (do not recompute over them).
  const inspected =
    rental.status === RENTAL_STATUS.INSPECTION ||
    rental.status === RENTAL_STATUS.CLOSED ||
    Boolean(rental.inspection?.assessedAt);
  const master = buildMasterInvoiceParts(rental);
  if (inspected) {
    rental.chargeGrossPaise = master.totals.chargeGrossPaise;
  } else if (rental.actualReturnedAt) {
    // Damage-only penalty policy: no late fee / late GST.
    rental.lateFeePaise = 0;
    rental.lateGstPaise = 0;
    rental.chargeGrossPaise =
      (rental.preTaxSubtotalPaise || 0) +
      (rental.bookedGstPaise || 0) +
      (rental.damagePreTaxPaise || 0) +
      (rental.damageGstPaise || 0);
  } else {
    rental.lateFeePaise = master.totals.lateFeePaise;
    rental.lateGstPaise = master.totals.lateGstPaise;
    rental.chargeGrossPaise = master.totals.chargeGrossPaise;
  }
  const payable = buildMasterInvoiceParts(rental).totals.finalPayablePaise;
  rental.balanceDuePaise = payable;

  const charge = projectCharge({
    chargeGrossPaise: rental.chargeGrossPaise || 0,
    paymentsPaise: rental.paymentsPaise,
    refundsPaise,
    deductionsPaise: dep.deductionsPaise,
  });

  if (rental.status === RENTAL_STATUS.CLOSED || (rental.settlementShortfallPaise || 0) > 0) {
    rental.settlementShortfallPaise = rental.balanceDuePaise;
  }
  return { dep, charge, master };
}

async function loadRental(tenantId, rentalId, session) {
  const rental = await RentalOrder.findOne({ _id: rentalId, tenantId }).session(session);
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  return rental;
}

/** Record a cleared cash/bank manual payment with explicit allocation. */
export async function recordManualPayment(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "payment.manual", key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const { amountPaise, allocation, method, reference, reason } = input;
  const chargePaise = allocation?.chargePaise || 0;
  const depositPaise = allocation?.depositPaise || 0;
  if (chargePaise + depositPaise !== amountPaise) {
    throw rentalError("PAYMENT_AMOUNT_MISMATCH", "Allocation must sum to amount");
  }

  const out = await withRentalTransaction(async (session) => {
    const rental = await loadRental(tenantId, rentalId(input), session);
    const payment = await RentalPayment.create(
      [
        {
          tenantId,
          rentalId: rental._id,
          direction: PAYMENT_DIRECTION.CHARGE,
          method,
          amountPaise,
          allocation: { chargePaise, depositPaise },
          status: "captured",
          reference,
          reason,
          idempotencyKey,
          verifiedAt: new Date(),
        },
      ],
      { session }
    );
    if (depositPaise > 0) {
      await RentalDepositEntry.create(
        [
          {
            tenantId,
            rentalId: rental._id,
            eventType: DEPOSIT_EVENT.COLLECTED,
            amountPaise: depositPaise,
            paymentId: payment[0]._id,
            idempotencyKey: `${idempotencyKey}:collect`,
            actorId: actor.id,
          },
        ],
        { session }
      );
    }
    await recomputeFinancials(tenantId, rental, session);

    // Append payment (+ deposit collect) onto the existing tax invoice — one PDF, many ledger lines.
    await appendLedgerLineToInvoice(
      tenantId,
      rental,
      {
        kind: depositPaise > 0 && chargePaise === 0 ? "deposit_collect" : "payment",
        paymentId: String(payment[0]._id),
        amountPaise,
        chargePaise,
        depositPaise,
        method,
        reference: reference || null,
        reason: reason || null,
      },
      session
    );

    // Deposit apply is Clear & close / close only — manual pay just records cash.
    const depositAppliedPaise = 0;

    rental.version += 1;
    await rental.save({ session });
    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "payment.manual",
        resourceType: "RentalPayment", resourceId: String(payment[0]._id),
      },
      session
    );
    const response = {
      payment: payment[0].toObject(),
      rental: rental.toObject(),
      depositAppliedPaise,
    };
    await storeIdempotency(
      { tenantId, actorType: actor.type, actorId: actor.id, scope: "payment.manual", key: idempotencyKey, body: input, statusCode: 201, response },
      session
    );
    return response;
  });
  return out;
}

function rentalId(input) {
  return input.rentalId;
}

/** Apply deposit to eligible posted charges. */
export async function depositApply(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "deposit.apply", key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const { amountPaise, chargeAllocations = [], reason } = input;
  const allocSum = chargeAllocations.reduce((s, a) => s + (a.amountPaise || 0), 0);
  if (chargeAllocations.length && allocSum !== amountPaise) {
    throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Charge allocations must sum to amount");
  }

  return withRentalTransaction(async (session) => {
    const rental = await loadRental(tenantId, input.rentalId, session);
    const existing = await RentalDepositEntry.find({ tenantId, rentalId: rental._id }, null, { session }).lean();
    const pre = projectDeposit(existing);
    if (amountPaise > pre.depositLiabilityPaise) {
      throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Deposit application exceeds liability");
    }
    await RentalDepositEntry.create(
      [
        {
          tenantId, rentalId: rental._id, eventType: DEPOSIT_EVENT.APPLIED, amountPaise,
          chargeAllocations, reason, idempotencyKey, actorId: actor.id,
        },
      ],
      { session }
    );
    await recomputeFinancials(tenantId, rental, session);
    await appendLedgerLineToInvoice(
      tenantId,
      rental,
      {
        kind: "deposit_apply",
        amountPaise,
        chargePaise: amountPaise,
        depositPaise: 0,
        reason: reason || "deposit_apply",
      },
      session
    );
    rental.version += 1;
    await rental.save({ session });
    await writeAudit(
      { tenantId, actorType: actor.type, actorId: actor.id, action: "deposit.apply", reason, resourceType: "RentalOrder", resourceId: String(rental._id) },
      session
    );
    const response = { rental: rental.toObject() };
    await storeIdempotency(
      { tenantId, actorType: actor.type, actorId: actor.id, scope: "deposit.apply", key: idempotencyKey, body: input, statusCode: 200, response },
      session
    );
    return response;
  });
}

/** Forfeit deposit with allowlisted category + signed approval. Never settles charge. */
export async function depositForfeit(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "deposit.forfeit", key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const { amountPaise, category, reason, approvalArtifactId } = input;
  if (!FORFEIT_CATEGORIES.includes(category)) {
    throw rentalError("VALIDATION_ERROR", "Invalid forfeiture category");
  }
  if (!approvalArtifactId) {
    throw rentalError("VALIDATION_ERROR", "Signed approval artifact required for forfeiture");
  }

  return withRentalTransaction(async (session) => {
    const rental = await loadRental(tenantId, input.rentalId, session);
    const existing = await RentalDepositEntry.find({ tenantId, rentalId: rental._id }, null, { session }).lean();
    const pre = projectDeposit(existing);
    if (amountPaise <= 0 || amountPaise > pre.refundableDepositPaise) {
      throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Forfeiture exceeds available deposit");
    }
    await RentalDepositEntry.create(
      [
        {
          tenantId, rentalId: rental._id, eventType: DEPOSIT_EVENT.FORFEITED, amountPaise,
          category, reason, approvalArtifactId, idempotencyKey, actorId: actor.id,
        },
      ],
      { session }
    );
    const balanceBefore = rental.balanceDuePaise;
    await recomputeFinancials(tenantId, rental, session);
    // Forfeiture must not change charge balance.
    if (rental.balanceDuePaise !== balanceBefore) {
      throw rentalError("DEPOSIT_LEDGER_MISMATCH", "Forfeiture must not change balance due");
    }
    rental.version += 1;
    await rental.save({ session });
    await writeAudit(
      { tenantId, actorType: actor.type, actorId: actor.id, action: "deposit.forfeit", reason, resourceType: "RentalOrder", resourceId: String(rental._id) },
      session
    );
    const response = { rental: rental.toObject() };
    await storeIdempotency(
      { tenantId, actorType: actor.type, actorId: actor.id, scope: "deposit.forfeit", key: idempotencyKey, body: input, statusCode: 200, response },
      session
    );
    return response;
  });
}

/**
 * Create a Razorpay order for the eligible outstanding charge amount. Provider
 * call is post-commit style but performed here; enablement-gated (424 when off).
 */
export async function createRazorpayOrder(tenantId, input, actor) {
  const rental = await RentalOrder.findOne({ _id: input.rentalId, tenantId });
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  if (input.amountPaise !== rental.balanceDuePaise) {
    throw rentalError("PAYMENT_AMOUNT_MISMATCH", "Amount must equal outstanding balance");
  }
  const res = await razorpay.createOrder({
    amountPaise: input.amountPaise,
    receipt: `rnt-${rental.rentalNumber}`,
    notes: { purpose: input.purpose || "initial_confirmation" },
    tenantId,
  });
  if (res.kind !== "success") {
    if (res.kind === "unknown") throw rentalError("PROVIDER_OUTCOME_UNKNOWN", "Razorpay order uncertain");
    if (res.kind === "retryable") throw rentalError("PROVIDER_UNAVAILABLE", "Razorpay unavailable");
    throw rentalError("PROVIDER_REJECTED", "Razorpay rejected order");
  }
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "payment.razorpay_order",
    resourceType: "RentalOrder", resourceId: String(rental._id),
  });
  return {
    provider: PROVIDERS.RAZORPAY,
    orderId: res.data.orderId,
    amountPaise: res.data.amount,
    currency: res.data.currency,
    publicKeyId: process.env.RAZORPAY_KEY_ID,
  };
}

function useMockRazorpay(tenantId) {
  if (process.env.RAZORPAY_MOCK === "true") return true;
  const e = evaluateProviderOperation({ provider: PROVIDERS.RAZORPAY, operation: "order", tenantId });
  return !e.effectiveEnabled;
}

async function quotePayable(tenantId, rental) {
  const quote = await quoteRental(tenantId, rental.toObject ? rental.toObject() : rental);
  const chargePaise = (quote.preTaxSubtotalPaise || 0) + (quote.bookedGstPaise || 0);
  const depositPaise = quote.deposit?.depositPaise || 0;
  const amountPaise = chargePaise + depositPaise;
  if (amountPaise <= 0) throw rentalError("PAYMENT_AMOUNT_MISMATCH", "Nothing to pay for this rental");
  return { quote, chargePaise, depositPaise, amountPaise };
}

/**
 * Customer delivery checkout: create a Razorpay (or mock) order for charge + deposit.
 * Delivery fulfilment only. Stashes pending payment on rental.fulfillment.
 */
export async function createCustomerCheckoutOrder(tenantId, { rentalId, customerId }, actor) {
  const rental = await RentalOrder.findOne({ _id: rentalId, tenantId, customerId });
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  const method = rental.fulfillment?.method;
  if (method !== "delivery") {
    throw rentalError("VALIDATION_ERROR", "Online payment is required only for delivery orders");
  }
  if (rental.fulfillment?.paymentStatus === "paid") {
    throw rentalError("INVALID_STATE_TRANSITION", "Rental is already paid");
  }

  const { quote, chargePaise, depositPaise, amountPaise } = await quotePayable(tenantId, rental);
  const mock = useMockRazorpay(tenantId);

  let orderId;
  let publicKeyId;
  if (mock) {
    orderId = `order_mock_${crypto.randomBytes(12).toString("hex")}`;
    publicKeyId = process.env.RAZORPAY_KEY_ID || "rzp_test_mock";
  } else {
    const res = await razorpay.createOrder({
      amountPaise,
      receipt: `rnt-${rental.rentalNumber}`.slice(0, 40),
      notes: { purpose: "customer_delivery_checkout", rentalId: String(rental._id) },
      tenantId,
    });
    if (res.kind !== "success") {
      if (res.kind === "unknown") throw rentalError("PROVIDER_OUTCOME_UNKNOWN", "Razorpay order uncertain");
      if (res.kind === "retryable") throw rentalError("PROVIDER_UNAVAILABLE", "Razorpay unavailable");
      throw rentalError("PROVIDER_REJECTED", "Razorpay rejected order");
    }
    orderId = res.data.orderId;
    publicKeyId = process.env.RAZORPAY_KEY_ID;
  }

  const fulfillment = { ...(rental.fulfillment?.toObject?.() || rental.fulfillment || {}) };
  fulfillment.pendingPayment = {
    provider: PROVIDERS.RAZORPAY,
    orderId,
    amountPaise,
    chargePaise,
    depositPaise,
    currency: "INR",
    mock,
    fingerprint: quote.fingerprint,
    createdAt: new Date().toISOString(),
  };
  rental.fulfillment = fulfillment;
  // Stamp quoted totals so post-payment projections have a charge base.
  rental.preTaxSubtotalPaise = quote.preTaxSubtotalPaise;
  rental.bookedGstPaise = quote.bookedGstPaise;
  rental.chargeGrossPaise = chargePaise;
  rental.depositSnapshot = {
    mode: quote.deposit.mode,
    depositPaise,
    selectedBps: quote.deposit.snapshot?.selectedBps ?? null,
    sourceLevel: quote.deposit.snapshot?.sourceLevel ?? null,
    inputs: quote.deposit.snapshot?.inputs ?? [],
  };
  rental.pricingFingerprint = quote.fingerprint;
  rental.lines = quote.lines;
  rental.version += 1;
  await rental.save();

  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "payment.customer_checkout_order",
    resourceType: "RentalOrder", resourceId: String(rental._id),
  });

  return {
    mock,
    provider: PROVIDERS.RAZORPAY,
    orderId,
    amountPaise,
    currency: "INR",
    publicKeyId,
    breakdown: { chargePaise, depositPaise },
    rentalNumber: rental.rentalNumber,
    rentalId: String(rental._id),
  };
}

/**
 * Confirm customer Razorpay (or mock) payment and capture charge + deposit allocation.
 */
export async function confirmCustomerCheckoutPayment(tenantId, input, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId, actorType: actor.type, actorId: actor.id, scope: "payment.customer_checkout",
    key: idempotencyKey, body: input,
  });
  if (replay) return replay.response;

  const { rentalId, customerId, orderId, paymentId, signature } = input;

  const out = await withRentalTransaction(async (session) => {
    const rental = await RentalOrder.findOne({ _id: rentalId, tenantId, customerId }).session(session);
    if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    const pending = rental.fulfillment?.pendingPayment;
    if (!pending?.orderId) throw rentalError("INVALID_STATE_TRANSITION", "No pending checkout payment");
    if (pending.orderId !== orderId) throw rentalError("PAYMENT_AMOUNT_MISMATCH", "Order id mismatch");
    if (rental.fulfillment?.paymentStatus === "paid") {
      throw rentalError("INVALID_STATE_TRANSITION", "Rental is already paid");
    }

    if (pending.mock) {
      if (!String(paymentId || "").startsWith("pay_mock_")) {
        throw rentalError("VALIDATION_ERROR", "Invalid mock payment id");
      }
    } else {
      const ok = razorpay.verifyCheckoutSignature({
        storedOrderId: pending.orderId,
        paymentId,
        signature,
      });
      if (!ok) throw rentalError("UNAUTHORIZED", "Invalid Razorpay signature");
    }

    const amountPaise = pending.amountPaise;
    const chargePaise = pending.chargePaise || 0;
    const depositPaise = pending.depositPaise || 0;

    const payment = await RentalPayment.create(
      [
        {
          tenantId,
          rentalId: rental._id,
          direction: PAYMENT_DIRECTION.CHARGE,
          method: "razorpay",
          provider: PROVIDERS.RAZORPAY,
          amountPaise,
          allocation: { chargePaise, depositPaise },
          status: "captured",
          providerOrderId: orderId,
          providerPaymentId: paymentId,
          idempotencyKey,
          verifiedAt: new Date(),
          reference: pending.mock ? "mock_checkout" : "razorpay_checkout",
        },
      ],
      { session }
    );

    if (depositPaise > 0) {
      await RentalDepositEntry.create(
        [
          {
            tenantId,
            rentalId: rental._id,
            eventType: DEPOSIT_EVENT.COLLECTED,
            amountPaise: depositPaise,
            paymentId: payment[0]._id,
            idempotencyKey: `${idempotencyKey}:collect`,
            actorId: actor.id,
          },
        ],
        { session }
      );
    }

    await recomputeFinancials(tenantId, rental, session);
    const fulfillment = { ...(rental.fulfillment?.toObject?.() || rental.fulfillment || {}) };
    fulfillment.paymentStatus = "paid";
    fulfillment.paidAt = new Date().toISOString();
    fulfillment.providerPaymentId = paymentId;
    delete fulfillment.pendingPayment;
    rental.fulfillment = fulfillment;
    rental.version += 1;
    await rental.save({ session });

    await writeAudit(
      {
        tenantId, actorType: actor.type, actorId: actor.id, action: "payment.customer_checkout",
        resourceType: "RentalPayment", resourceId: String(payment[0]._id),
      },
      session
    );

    const response = { payment: payment[0].toObject(), rental: rental.toObject() };
    await storeIdempotency(
      {
        tenantId, actorType: actor.type, actorId: actor.id, scope: "payment.customer_checkout",
        key: idempotencyKey, body: input, statusCode: 201, response,
      },
      session
    );
    return response;
  });
  return out;
}
