// SPEC-008 NFR-3: idempotent overdue sweep (status ACTIVE → OVERDUE after grace).
import { RentalOrder, RentalCommercialPolicyVersion, RentalNotification } from "../schema/index.js";
import { RENTAL_STATUS } from "../constants.js";
import { writeAudit } from "./infra.js";

function activeAt(at) {
  return {
    status: "active",
    effectiveFrom: { $lte: at },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
  };
}

async function graceMinutes(tenantId, at = new Date()) {
  const doc = await RentalCommercialPolicyVersion.findOne({
    tenantId,
    scopeType: "organization",
    policyType: "grace",
    ...activeAt(at),
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  const m = Number(doc?.policy?.graceMinutes ?? doc?.policy?.valueMinutes ?? 0);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

/**
 * Mark ACTIVE rentals past plannedEndAt (+ grace) as OVERDUE.
 * Idempotent: already OVERDUE skipped. Returns transition count.
 */
export async function sweepOverdueForTenant(tenantId, { now = new Date(), sendReminders = true } = {}) {
  const grace = await graceMinutes(tenantId, now);
  const cutoff = new Date(now.getTime() - grace * 60_000);
  const candidates = await RentalOrder.find({
    tenantId,
    status: RENTAL_STATUS.ACTIVE,
    plannedEndAt: { $lt: cutoff },
  }).limit(200);

  let transitioned = 0;
  for (const rental of candidates) {
    rental.status = RENTAL_STATUS.OVERDUE;
    rental.version += 1;
    await rental.save();
    transitioned += 1;
    await writeAudit({
      tenantId,
      actorType: "system",
      actorId: "overdueSweep",
      action: "rental.overdue",
      resourceType: "RentalOrder",
      resourceId: String(rental._id),
      resourceVersion: rental.version,
    });
    if (sendReminders) {
      // ponytail: queue row only; Msg91 send is separate; failures never block sweep
      await RentalNotification.create({
        tenantId,
        rentalId: rental._id,
        customerId: rental.customerId,
        channel: "sms",
        purpose: "overdue_reminder",
        sourceEventId: `overdue:${rental._id}:${rental.version}`,
        status: "queued",
      }).catch(() => {});
    }
  }

  let dueSoonEmailed = 0;
  let overdueEmailed = 0;
  if (sendReminders) {
    const r = await sendDueAndOverdueEmails(tenantId, now).catch(() => ({ dueSoon: 0, overdue: 0 }));
    dueSoonEmailed = r.dueSoon;
    overdueEmailed = r.overdue;
  }

  return {
    tenantId: String(tenantId),
    transitioned,
    graceMinutes: grace,
    dueSoonEmailed,
    overdueEmailed,
    asOfAt: now.toISOString(),
  };
}

const DUE_SOON_LEAD_MS = (Number(process.env.RENTAL_DUE_SOON_LEAD_HOURS) || 24) * 3600_000;

/**
 * Email reminders (best-effort, never throws):
 *  - Pre-due: ACTIVE rentals due within the lead window → rent invoice, once.
 *  - Overdue: OVERDUE rentals → refreshed running invoice, once per calendar day.
 */
async function sendDueAndOverdueEmails(tenantId, now) {
  if (process.env.RENTAL_REMINDER_EMAILS_DISABLED === "true") return { dueSoon: 0, overdue: 0 };
  const { generateMasterInvoice, resendRentalInvoiceEmail } = await import("./rentalService.js");
  const actor = { type: "system", id: "overdueSweep" };
  const today = now.toISOString().slice(0, 10);

  const dueSoon = await RentalOrder.find({
    tenantId,
    status: RENTAL_STATUS.ACTIVE,
    dueSoonEmailedAt: null,
    plannedEndAt: { $gt: now, $lte: new Date(now.getTime() + DUE_SOON_LEAD_MS) },
  }).limit(200);
  let dueSoonCount = 0;
  for (const rental of dueSoon) {
    await resendRentalInvoiceEmail(tenantId, String(rental._id)).catch(() => {});
    rental.dueSoonEmailedAt = now;
    await rental.save().catch(() => {});
    dueSoonCount += 1;
  }

  const overdue = await RentalOrder.find({
    tenantId,
    status: RENTAL_STATUS.OVERDUE,
    lastOverdueEmailDay: { $ne: today },
  }).limit(200);
  let overdueCount = 0;
  for (const rental of overdue) {
    // Refresh the running master invoice, then email the customer the day's bill.
    await generateMasterInvoice(tenantId, { rentalId: String(rental._id) }, actor).catch(() => {});
    await resendRentalInvoiceEmail(tenantId, String(rental._id)).catch(() => {});
    rental.lastOverdueEmailDay = today;
    await rental.save().catch(() => {});
    overdueCount += 1;
  }

  return { dueSoon: dueSoonCount, overdue: overdueCount };
}

/** Sweep all tenants that have ACTIVE rentals (bounded). */
export async function sweepOverdueAllTenants(opts = {}) {
  const tenantIds = await RentalOrder.distinct("tenantId", { status: RENTAL_STATUS.ACTIVE });
  const results = [];
  for (const tenantId of tenantIds) {
    results.push(await sweepOverdueForTenant(tenantId, opts));
  }
  return {
    tenants: results.length,
    transitioned: results.reduce((s, r) => s + r.transitioned, 0),
    results,
  };
}

let timer = null;

/** Start interval sweep when not in test. Idempotent start. */
export function startOverdueSweepJob({ intervalMs } = {}) {
  if (process.env.NODE_ENV === "test") return null;
  if (process.env.RENTAL_OVERDUE_SWEEP_DISABLED === "true") return null;
  if (timer) return timer;
  const ms = Number(intervalMs || process.env.RENTAL_OVERDUE_SWEEP_MS || 5 * 60_000);
  timer = setInterval(() => {
    sweepOverdueAllTenants().catch((err) => {
      console.warn("[rental] overdue sweep failed:", err?.message || err);
    });
  }, Math.max(30_000, ms));
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

export function stopOverdueSweepJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
