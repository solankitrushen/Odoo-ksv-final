// SPEC-007 daily pickup/return schedules + SPEC-008 overdue list.
import { RentalOrder } from "../schema/index.js";
import { RENTAL_STATUS } from "../constants.js";
import { rentalError } from "../errors.js";
import { buildMasterInvoiceParts, computeRentalLateFee } from "./lateFee.js";

function dayBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) throw rentalError("VALIDATION_ERROR", "Invalid date");
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Confirmed rentals whose start falls on the day (pickup schedule). */
export async function listPickups(tenantId, { date } = {}) {
  const { start, end } = dayBounds(date);
  const items = await RentalOrder.find({
    tenantId,
    status: { $in: [RENTAL_STATUS.CONFIRMED, RENTAL_STATUS.DISPATCH_PENDING] },
    startAt: { $gte: start, $lte: end },
  })
    .sort({ startAt: 1 })
    .select("rentalNumber customerId customerSnapshot status startAt endAt plannedEndAt fulfillment")
    .lean();
  return { date: start.toISOString().slice(0, 10), items };
}

/** Active/overdue rentals whose planned end falls on the day (return schedule). */
export async function listReturns(tenantId, { date } = {}) {
  const { start, end } = dayBounds(date);
  const items = await RentalOrder.find({
    tenantId,
    status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.OVERDUE, RENTAL_STATUS.RETURNED, RENTAL_STATUS.INSPECTION] },
    plannedEndAt: { $gte: start, $lte: end },
  })
    .sort({ plannedEndAt: 1 })
    .select("rentalNumber customerId customerSnapshot status startAt plannedEndAt actualReturnedAt")
    .lean();
  return { date: start.toISOString().slice(0, 10), items };
}

/** Overdue: marked OVERDUE or ACTIVE past plannedEndAt. */
export async function listOverdue(tenantId, { limit = 25, page = 1 } = {}) {
  const now = new Date();
  const lim = Math.min(Math.max(1, Number(limit) || 25), 100);
  const pg = Math.max(1, Number(page) || 1);
  const filter = {
    tenantId,
    $or: [
      { status: RENTAL_STATUS.OVERDUE },
      { status: RENTAL_STATUS.ACTIVE, plannedEndAt: { $lt: now } },
    ],
  };
  const [items, total] = await Promise.all([
    RentalOrder.find(filter)
      .sort({ plannedEndAt: 1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    RentalOrder.countDocuments(filter),
  ]);

  return {
    asOfAt: now.toISOString(),
    items: items.map((r) => {
      const late = computeRentalLateFee(r);
      return {
        _id: r._id,
        rentalNumber: r.rentalNumber,
        customerId: r.customerId,
        customerSnapshot: r.customerSnapshot,
        status: r.status,
        plannedEndAt: r.plannedEndAt,
        lateFeePaise: late.lateFeePaise,
        lateGstPaise: late.lateGstPaise,
        settlementShortfallPaise: r.settlementShortfallPaise || 0,
        balanceDuePaise: r.balanceDuePaise || 0,
      };
    }),
    total,
    page: pg,
    limit: lim,
  };
}

function formatOverdueDuration(minutes) {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (hours < 48) {
    return rem ? `${hours}h ${rem}m` : `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${days}d ${h}h` : `${days} day${days === 1 ? "" : "s"}`;
}

export async function getPenaltyBreakdown(tenantId, rentalId, { customerId } = {}) {
  const filter = { _id: rentalId, tenantId };
  if (customerId) filter.customerId = customerId;
  const doc = await RentalOrder.findOne(filter);
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");

  // Heal stale shortfall vs ledger balance (e.g. payment after close).
  const balanceDuePaise = doc.balanceDuePaise || 0;
  const shortfall = doc.settlementShortfallPaise || 0;
  if (
    (doc.status === "closed" || shortfall > 0) &&
    shortfall !== balanceDuePaise
  ) {
    doc.settlementShortfallPaise = balanceDuePaise;
    await doc.save();
  }

  const master = buildMasterInvoiceParts(doc);
  const late = computeRentalLateFee(doc);
  const lateFeePaise = master.totals.lateFeePaise || late.lateFeePaise || 0;
  const lateGstPaise = master.totals.lateGstPaise || late.lateGstPaise || 0;
  const plannedEnd = doc.plannedEndAt || doc.endAt;
  const asOf = doc.actualReturnedAt ? new Date(doc.actualReturnedAt) : new Date();
  const plannedMs = plannedEnd ? new Date(plannedEnd).getTime() : null;
  const overdueMinutes =
    plannedMs && asOf.getTime() > plannedMs
      ? Math.floor((asOf.getTime() - plannedMs) / 60000)
      : 0;
  const damagePreTaxPaise = master.totals.damagePreTaxPaise || 0;
  const damageGstPaise = master.totals.damageGstPaise || 0;
  const penaltyTotalPaise = lateFeePaise + lateGstPaise + damagePreTaxPaise + damageGstPaise;
  // Same payable as PDF / dashboard (charges − payments − deposit credit).
  const dueBillPaise = master.totals.finalPayablePaise;
  return {
    rentalId: String(doc._id),
    rentalNumber: doc.rentalNumber,
    status: doc.status,
    plannedEndAt: plannedEnd || null,
    actualReturnedAt: doc.actualReturnedAt || null,
    asOfAt: asOf.toISOString(),
    overdueMinutes,
    overdueLabel: overdueMinutes > 0 ? formatOverdueDuration(overdueMinutes) : "On time",
    lateFeePaise,
    lateGstPaise,
    damagePreTaxPaise,
    damageGstPaise,
    penaltyTotalPaise,
    depositCollectedPaise: doc.depositCollectedPaise || 0,
    depositAppliedPaise: master.totals.depositAppliedPaise || 0,
    settlementShortfallPaise: doc.settlementShortfallPaise || 0,
    balanceDuePaise: dueBillPaise,
    chargeGrossPaise: master.totals.chargeGrossPaise || 0,
    paymentsPaise: master.totals.paymentsPaise || 0,
    dueBillPaise,
    inspection: doc.inspection || null,
  };
}
