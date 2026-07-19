// SPEC-019 sales + revenue analytics (read-only aggregates).
import mongoose from "mongoose";
import { RentalOrder, RentalInvoice, RentalPayment } from "../schema/index.js";
import { rentalError } from "../errors.js";

const EXPORT_MAX = 5000;
const CAPTURED_REFUND = ["captured", "processed", "submitted"];

function toId(id) {
  return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

function parseRange({ from, to }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw rentalError("VALIDATION_ERROR", "Invalid from/to");
  }
  if (!(end >= start)) throw rentalError("VALIDATION_ERROR", "to must be >= from");
  return { start, end };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build Mongo filter for payment list / analytics / export. */
export async function buildPaymentFilter(
  tenantId,
  { from, to, customerId, method, status, direction, rentalId, q } = {},
) {
  const filter = { tenantId: toId(tenantId) };
  if (rentalId) filter.rentalId = toId(rentalId);
  if (method) filter.method = String(method);
  if (status) filter.status = String(status);
  if (direction) filter.direction = String(direction);
  if (from || to) {
    filter.createdAt = {};
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) throw rentalError("VALIDATION_ERROR", "Invalid from");
      filter.createdAt.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) throw rentalError("VALIDATION_ERROR", "Invalid to");
      filter.createdAt.$lte = d;
    }
  }
  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) throw rentalError("VALIDATION_ERROR", "Invalid customerId");
    const rentals = await RentalOrder.find({ tenantId: toId(tenantId), customerId: toId(customerId) })
      .select("_id")
      .lean();
    filter.rentalId = { $in: rentals.map((r) => r._id) };
  }

  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    const rentalMatch = {
      tenantId: toId(tenantId),
      $or: [
        { rentalNumber: rx },
        { "customerSnapshot.displayName": rx },
        { "customerSnapshot.email": rx },
      ],
    };
    if (filter.rentalId) rentalMatch._id = filter.rentalId;
    const matched = await RentalOrder.find(rentalMatch).select("_id").lean();
    const or = [
      { method: rx },
      { reference: rx },
      { status: rx },
      { providerPaymentId: rx },
      { providerOrderId: rx },
    ];
    if (matched.length) or.push({ rentalId: { $in: matched.map((r) => r._id) } });
    if (filter.rentalId) {
      filter.$and = [{ rentalId: filter.rentalId }, { $or: or }];
      delete filter.rentalId;
    } else {
      filter.$or = or;
    }
  }
  return filter;
}

/** Bookings + revenue by product or day. */
export async function salesTrends(tenantId, { from, to, groupBy = "product" } = {}) {
  const { start, end } = parseRange({ from, to });
  const match = {
    tenantId: toId(tenantId),
    createdAt: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "draft"] },
  };

  if (groupBy === "day") {
    const rows = await RentalOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bookings: { $sum: 1 },
          revenuePaise: { $sum: "$paymentsPaise" },
          chargeGrossPaise: { $sum: "$chargeGrossPaise" },
          lateFeePaise: { $sum: { $add: ["$lateFeePaise", "$lateGstPaise"] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      groupBy: "day",
      items: rows.map((r) => ({
        day: r._id,
        bookings: r.bookings,
        revenuePaise: r.revenuePaise,
        chargeGrossPaise: r.chargeGrossPaise,
        lateFeePaise: r.lateFeePaise || 0,
      })),
    };
  }

  const rows = await RentalOrder.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    {
      $group: {
        _id: "$lines.productId",
        name: { $first: "$lines.nameSnapshot" },
        units: { $sum: "$lines.quantity" },
        linePreTaxPaise: { $sum: "$lines.linePreTaxPaise" },
        bookings: { $addToSet: "$_id" },
      },
    },
    { $sort: { linePreTaxPaise: -1 } },
    { $limit: 50 },
  ]);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    groupBy: "product",
    items: rows.map((r) => ({
      productId: r._id,
      name: r.name,
      units: r.units,
      linePreTaxPaise: r.linePreTaxPaise,
      bookingCount: r.bookings.length,
    })),
  };
}

/** Revenue split: rental vs penalty vs damage (delivery fee = 0 until charged). */
export async function revenueBreakdown(tenantId, { from, to } = {}) {
  const { start, end } = parseRange({ from, to });
  const rows = await RentalOrder.aggregate([
    {
      $match: {
        tenantId: toId(tenantId),
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        rentalChargePaise: { $sum: { $add: ["$preTaxSubtotalPaise", "$bookedGstPaise"] } },
        lateFeePaise: { $sum: "$lateFeePaise" },
        lateGstPaise: { $sum: "$lateGstPaise" },
        damagePreTaxPaise: { $sum: "$damagePreTaxPaise" },
        damageGstPaise: { $sum: "$damageGstPaise" },
        paymentsPaise: { $sum: "$paymentsPaise" },
        depositCollectedPaise: { $sum: "$depositCollectedPaise" },
        deliveryFeePaise: { $sum: 0 },
      },
    },
  ]);
  const r = rows[0] || {
    rentalChargePaise: 0,
    lateFeePaise: 0,
    lateGstPaise: 0,
    damagePreTaxPaise: 0,
    damageGstPaise: 0,
    paymentsPaise: 0,
    depositCollectedPaise: 0,
    deliveryFeePaise: 0,
  };
  delete r._id;
  const penaltyPaise = (r.lateFeePaise || 0) + (r.lateGstPaise || 0);
  const damagePaise = (r.damagePreTaxPaise || 0) + (r.damageGstPaise || 0);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    gross: {
      rentalPaise: r.rentalChargePaise || 0,
      penaltyPaise,
      damagePaise,
      deliveryPaise: 0,
      collectedPaise: r.paymentsPaise || 0,
      depositCollectedPaise: r.depositCollectedPaise || 0,
    },
  };
}

/** Thin AR aging from open invoice balance on rentals. */
export async function arAging(tenantId) {
  const now = Date.now();
  const open = await RentalOrder.find({
    tenantId,
    balanceDuePaise: { $gt: 0 },
    status: { $nin: ["cancelled", "draft"] },
  })
    .select("rentalNumber customerId balanceDuePaise plannedEndAt createdAt status")
    .lean();

  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
  const items = open.map((r) => {
    const anchor = r.plannedEndAt || r.createdAt;
    const days = Math.max(0, Math.floor((now - new Date(anchor).getTime()) / 86400000));
    let bucket = "current";
    if (days > 60) bucket = "d61_plus";
    else if (days > 30) bucket = "d31_60";
    else if (days > 0) bucket = "d1_30";
    buckets[bucket] += r.balanceDuePaise || 0;
    return {
      rentalId: r._id,
      rentalNumber: r.rentalNumber,
      customerId: r.customerId,
      balanceDuePaise: r.balanceDuePaise,
      daysPastAnchor: days,
      bucket,
      status: r.status,
    };
  });

  const taxPayable = await RentalInvoice.aggregate([
    { $match: { tenantId: toId(tenantId) } },
    { $group: { _id: null, gstPaise: { $sum: "$totals.gstPaise" } } },
  ]);

  return {
    asOfAt: new Date().toISOString(),
    buckets,
    openCount: items.length,
    items: items.slice(0, 100),
    taxPayableGstPaise: taxPayable[0]?.gstPaise || 0,
  };
}

/**
 * Payment ledger analytics for admin Payments page.
 * Captured charges / refunds only count toward money KPIs; counts include all statuses.
 */
export async function paymentAnalytics(tenantId, { from, to, customerId, groupBy = "day" } = {}) {
  const { start, end } = parseRange({ from, to });
  const bucket = groupBy === "month" ? "month" : "day";
  const dateFmt = bucket === "month" ? "%Y-%m" : "%Y-%m-%d";
  const match = await buildPaymentFilter(tenantId, {
    from: start.toISOString(),
    to: end.toISOString(),
    customerId,
  });

  const [facet] = await RentalPayment.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalCount: { $sum: 1 },
              capturedChargePaise: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "charge"] }, { $eq: ["$status", "captured"] }] },
                    "$amountPaise",
                    0,
                  ],
                },
              },
              refundPaise: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$direction", "refund"] },
                        { $in: ["$status", CAPTURED_REFUND] },
                      ],
                    },
                    "$amountPaise",
                    0,
                  ],
                },
              },
              failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
              pendingCount: {
                $sum: {
                  $cond: [{ $in: ["$status", ["created", "pending", "authorized", "requested"]] }, 1, 0],
                },
              },
            },
          },
        ],
        byMethod: [
          { $match: { direction: "charge", status: "captured" } },
          { $group: { _id: "$method", count: { $sum: 1 }, amountPaise: { $sum: "$amountPaise" } } },
          { $sort: { amountPaise: -1 } },
        ],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 }, amountPaise: { $sum: "$amountPaise" } } },
          { $sort: { count: -1 } },
        ],
        series: [
          {
            $group: {
              _id: { $dateToString: { format: dateFmt, date: "$createdAt" } },
              chargePaise: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "charge"] }, { $eq: ["$status", "captured"] }] },
                    "$amountPaise",
                    0,
                  ],
                },
              },
              refundPaise: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$direction", "refund"] },
                        { $in: ["$status", CAPTURED_REFUND] },
                      ],
                    },
                    "$amountPaise",
                    0,
                  ],
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        byRental: [
          { $match: { direction: "charge", status: "captured" } },
          {
            $group: {
              _id: "$rentalId",
              amountPaise: { $sum: "$amountPaise" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amountPaise: -1 } },
          { $limit: 25 },
        ],
      },
    },
  ]);

  const summaryRow = facet?.summary?.[0] || {};
  const rentalIds = (facet?.byRental || []).map((r) => r._id).filter(Boolean);
  const rentals = rentalIds.length
    ? await RentalOrder.find({ tenantId: toId(tenantId), _id: { $in: rentalIds } })
        .select("rentalNumber customerId customerSnapshot")
        .lean()
    : [];
  const rentalMap = new Map(rentals.map((r) => [String(r._id), r]));

  // Roll top rentals up to customers.
  const byCustomerMap = new Map();
  for (const row of facet?.byRental || []) {
    const meta = rentalMap.get(String(row._id));
    const cid = meta?.customerId ? String(meta.customerId) : "unknown";
    const prev = byCustomerMap.get(cid) || {
      customerId: meta?.customerId || null,
      customerName: meta?.customerSnapshot?.displayName || "Unknown",
      amountPaise: 0,
      count: 0,
    };
    prev.amountPaise += row.amountPaise || 0;
    prev.count += row.count || 0;
    byCustomerMap.set(cid, prev);
  }
  const byCustomer = [...byCustomerMap.values()]
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 10);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    groupBy: bucket,
    summary: {
      totalCount: summaryRow.totalCount || 0,
      capturedChargePaise: summaryRow.capturedChargePaise || 0,
      refundPaise: summaryRow.refundPaise || 0,
      netCollectedPaise: (summaryRow.capturedChargePaise || 0) - (summaryRow.refundPaise || 0),
      failedCount: summaryRow.failedCount || 0,
      pendingCount: summaryRow.pendingCount || 0,
    },
    series: (facet?.series || []).map((r) => ({
      period: r._id,
      chargePaise: r.chargePaise || 0,
      refundPaise: r.refundPaise || 0,
      count: r.count || 0,
    })),
    byMethod: (facet?.byMethod || []).map((r) => ({
      method: r._id || "other",
      count: r.count || 0,
      amountPaise: r.amountPaise || 0,
    })),
    byStatus: (facet?.byStatus || []).map((r) => ({
      status: r._id || "unknown",
      count: r.count || 0,
      amountPaise: r.amountPaise || 0,
    })),
    byCustomer,
  };
}

/** Enriched payment rows for CSV export (hard cap). */
export async function exportPayments(tenantId, query = {}) {
  const filter = await buildPaymentFilter(tenantId, query);
  const items = await RentalPayment.find(filter).sort({ createdAt: -1 }).limit(EXPORT_MAX).lean();
  const rentalIds = [...new Set(items.map((p) => String(p.rentalId)).filter(Boolean))];
  const rentals = rentalIds.length
    ? await RentalOrder.find({ tenantId: toId(tenantId), _id: { $in: rentalIds } })
        .select("rentalNumber customerId customerSnapshot")
        .lean()
    : [];
  const meta = new Map(rentals.map((r) => [String(r._id), r]));
  const enriched = items.map((p) => {
    const m = meta.get(String(p.rentalId));
    return {
      _id: p._id,
      createdAt: p.createdAt,
      rentalId: p.rentalId,
      rentalNumber: m?.rentalNumber ?? null,
      customerId: m?.customerId ?? null,
      customerName: m?.customerSnapshot?.displayName ?? null,
      customerEmail: m?.customerSnapshot?.email ?? null,
      direction: p.direction,
      method: p.method,
      status: p.status,
      amountPaise: p.amountPaise,
      currency: p.currency || "INR",
      reference: p.reference ?? null,
      providerPaymentId: p.providerPaymentId ?? null,
      providerOrderId: p.providerOrderId ?? null,
      reason: p.reason ?? null,
    };
  });
  return {
    from: query.from || null,
    to: query.to || null,
    total: enriched.length,
    truncated: enriched.length >= EXPORT_MAX,
    exportMax: EXPORT_MAX,
    items: enriched,
  };
}
