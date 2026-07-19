// SPEC-RMS-001 FR-040/044 dashboard + financial reporting. Read-only aggregates.
import { RentalOrder } from "../schema/index.js";
import { RENTAL_STATUS } from "../constants.js";

const OPEN_STATUSES = [
  RENTAL_STATUS.CONFIRMED,
  RENTAL_STATUS.DISPATCH_PENDING,
  RENTAL_STATUS.DISPATCHED,
  RENTAL_STATUS.ACTIVE,
  RENTAL_STATUS.OVERDUE,
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Operations dashboard: real-time rental visibility for managers. */
export async function dashboard(tenantId) {
  const now = new Date();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [
    activeRentals,
    rentalsDueToday,
    upcomingPickups,
    upcomingReturns,
    overdueRentals,
    revenueAgg,
    depositsAgg,
    lateFeeAgg,
  ] = await Promise.all([
    RentalOrder.countDocuments({ tenantId, status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.OVERDUE] } }),
    RentalOrder.countDocuments({
      tenantId,
      status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.OVERDUE] },
      plannedEndAt: { $gte: todayStart, $lte: todayEnd },
    }),
    RentalOrder.countDocuments({
      tenantId,
      status: RENTAL_STATUS.CONFIRMED,
      startAt: { $gte: now, $lte: in7 },
    }),
    RentalOrder.countDocuments({
      tenantId,
      status: { $in: [RENTAL_STATUS.ACTIVE, RENTAL_STATUS.OVERDUE] },
      plannedEndAt: { $gte: now, $lte: in7 },
    }),
    RentalOrder.countDocuments({
      tenantId,
      $or: [
        { status: RENTAL_STATUS.OVERDUE },
        { status: RENTAL_STATUS.ACTIVE, plannedEndAt: { $lt: now } },
      ],
    }),
    RentalOrder.aggregate([
      { $match: { tenantId: toId(tenantId) } },
      { $group: { _id: null, total: { $sum: "$paymentsPaise" } } },
    ]),
    RentalOrder.aggregate([
      { $match: { tenantId: toId(tenantId), status: { $in: OPEN_STATUSES } } },
      { $group: { _id: null, total: { $sum: "$depositLiabilityPaise" } } },
    ]),
    RentalOrder.aggregate([
      { $match: { tenantId: toId(tenantId) } },
      { $group: { _id: null, total: { $sum: "$lateFeePaise" } } },
    ]),
  ]);

  return {
    asOfAt: now.toISOString(),
    counts: {
      activeRentals,
      rentalsDueToday,
      upcomingPickups,
      upcomingReturns,
      overdueRentals,
    },
    money: {
      revenueFromRentalsPaise: revenueAgg[0]?.total || 0,
      securityDepositsHeldPaise: depositsAgg[0]?.total || 0,
      lateFeeCollectionPaise: lateFeeAgg[0]?.total || 0,
    },
  };
}

/** Financial report keeping every bucket separate (no netting). */
export async function financialReport(tenantId) {
  const agg = await RentalOrder.aggregate([
    { $match: { tenantId: toId(tenantId) } },
    {
      $group: {
        _id: null,
        chargeGrossPaise: { $sum: "$chargeGrossPaise" },
        paymentsPaise: { $sum: "$paymentsPaise" },
        refundsPaise: { $sum: "$refundsPaise" },
        deductionsPaise: { $sum: "$deductionsPaise" },
        forfeitedDepositPaise: { $sum: "$forfeitedDepositPaise" },
        depositCollectedPaise: { $sum: "$depositCollectedPaise" },
        depositRefundsCompletedPaise: { $sum: "$depositRefundsCompletedPaise" },
        depositLiabilityPaise: { $sum: "$depositLiabilityPaise" },
        refundableDepositPaise: { $sum: "$refundableDepositPaise" },
        balanceDuePaise: { $sum: "$balanceDuePaise" },
        lateFeePaise: { $sum: "$lateFeePaise" },
        lateGstPaise: { $sum: "$lateGstPaise" },
        damagePreTaxPaise: { $sum: "$damagePreTaxPaise" },
        damageGstPaise: { $sum: "$damageGstPaise" },
      },
    },
  ]);
  const r = agg[0] || {};
  delete r._id;
  return {
    report: {
      ...r,
      penaltyPaise: (r.lateFeePaise || 0) + (r.lateGstPaise || 0),
      damagePaise: (r.damagePreTaxPaise || 0) + (r.damageGstPaise || 0),
      deliveryFeePaise: 0,
    },
  };
}

import mongoose from "mongoose";
function toId(id) {
  return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}
