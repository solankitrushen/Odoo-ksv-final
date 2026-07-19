// SPEC-011 Could capabilities — thin, isolatable (NFR-1).
import {
  RentalOrder,
  RentalAsset,
  RentalAllocation,
  RentalSettings,
} from "../schema/index.js";
import { RENTAL_STATUS, ASSET_STATE, BLOCKING_ALLOCATION_STATUSES } from "../constants.js";
import { rentalError } from "../errors.js";
import { listOverdue, listPickups } from "./scheduleService.js";
import { financialReport, dashboard } from "./reportingService.js";

function bonusEnabled() {
  return process.env.RENTAL_BONUS_DISABLED !== "true";
}

function requireBonus() {
  if (!bonusEnabled()) throw rentalError("RESOURCE_NOT_FOUND", "Bonus capabilities disabled");
}

/** FR-2: crude demand forecast from future allocations / confirmed rentals. */
export async function availabilityForecast(tenantId, { variantId, days = 14 } = {}) {
  requireBonus();
  if (!variantId) throw rentalError("VALIDATION_ERROR", "variantId required");
  const now = new Date();
  const end = new Date(now.getTime() + Math.min(90, Math.max(1, Number(days) || 14)) * 86400000);
  const assets = await RentalAsset.countDocuments({
    tenantId,
    variantId,
    archivedAt: null,
    state: { $nin: [ASSET_STATE.RETIRED, ASSET_STATE.LOST] },
  });
  const booked = await RentalAllocation.countDocuments({
    tenantId,
    status: { $in: [...BLOCKING_ALLOCATION_STATUSES] },
    startAt: { $lt: end },
    endAt: { $gt: now },
  });
  // Filter by joining rental lines — ponytail: count allocations for variant via rentals
  const rentals = await RentalOrder.find({
    tenantId,
    status: { $in: [RENTAL_STATUS.CONFIRMED, RENTAL_STATUS.RESERVED, RENTAL_STATUS.ACTIVE, RENTAL_STATUS.DISPATCH_PENDING] },
    "lines.variantId": variantId,
    startAt: { $lt: end },
    endAt: { $gt: now },
  })
    .select("lines.startAt lines.endAt lines.variantId lines.quantity startAt endAt")
    .lean();
  let demandUnits = 0;
  for (const r of rentals) {
    for (const l of r.lines || []) {
      if (String(l.variantId) === String(variantId)) demandUnits += l.quantity || 0;
    }
  }
  return {
    variantId: String(variantId),
    windowDays: Number(days) || 14,
    fleetSize: assets,
    overlappingDemandUnits: demandUnits,
    allocationRows: booked,
    utilizationBps: assets > 0 ? Math.min(10000, Math.round((demandUnits / assets) * 10000)) : 0,
    confidence: rentals.length >= 3 ? "medium" : "low",
  };
}

/** FR-3: resolve asset by barcode/QR code for scan handoff. */
export async function scanAsset(tenantId, { code }) {
  requireBonus();
  if (!code) throw rentalError("VALIDATION_ERROR", "code required");
  const asset = await RentalAsset.findOne({ tenantId, assetCode: String(code).trim() }).lean();
  if (!asset) throw rentalError("RESOURCE_NOT_FOUND", "Asset not found for code");
  return { asset };
}

/** FR-4: naive pickup route — sort by postal/pincode when present. */
export async function optimizedPickups(tenantId, { date } = {}) {
  requireBonus();
  const { items, date: d } = await listPickups(tenantId, { date });
  const sorted = [...items].sort((a, b) => {
    const pa = a.addresses?.delivery?.postalCode || a.addresses?.delivery?.pincode || a.customerSnapshot?.displayName || "";
    const pb = b.addresses?.delivery?.postalCode || b.addresses?.delivery?.pincode || b.customerSnapshot?.displayName || "";
    return String(pa).localeCompare(String(pb));
  });
  return { date: d, strategy: "postal_or_name", items: sorted };
}

/** FR-5: assets in damaged/unusable or maintenance → maintenance suggestions. */
export async function maintenanceSuggestions(tenantId, { limit = 25 } = {}) {
  requireBonus();
  const items = await RentalAsset.find({
    tenantId,
    archivedAt: null,
    $or: [{ condition: { $in: ["damaged", "unusable"] } }, { state: ASSET_STATE.MAINTENANCE }],
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(100, Number(limit) || 25))
    .lean();
  return {
    items: items.map((a) => ({
      assetId: a._id,
      assetCode: a.assetCode,
      condition: a.condition,
      state: a.state,
      suggestion: a.condition === "unusable" ? "scrap_or_major_repair" : "inspect_and_repair",
    })),
  };
}

/** FR-6: IoT ping — update asset lastKnownLocation (graceful no-op if missing fields). */
export async function iotAssetPing(tenantId, { assetId, lat, lng, providerRef }) {
  requireBonus();
  const asset = await RentalAsset.findOne({ _id: assetId, tenantId });
  if (!asset) throw rentalError("RESOURCE_NOT_FOUND", "Asset not found");
  asset.lastKnownLocation = {
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    providerRef: providerRef || null,
    at: new Date(),
  };
  asset.version = (asset.version || 0) + 1;
  await asset.save();
  return { assetId: String(asset._id), lastKnownLocation: asset.lastKnownLocation };
}

/** FR-7: widget layout from settings (defaults if unset). */
export async function dashboardWidgets(tenantId) {
  requireBonus();
  const settings = await RentalSettings.findOne({ tenantId }).lean();
  const widgets =
    settings?.dashboardWidgets ||
    [
      { id: "activeRentals", enabled: true },
      { id: "overdueRentals", enabled: true },
      { id: "revenue", enabled: true },
      { id: "depositsHeld", enabled: true },
    ];
  const dash = await dashboard(tenantId);
  return { widgets, snapshot: dash };
}

/** FR-8: analytics alias over financial report + overdue. */
export async function analytics(tenantId) {
  requireBonus();
  const [fin, overdue, dash] = await Promise.all([
    financialReport(tenantId),
    listOverdue(tenantId, { limit: 20 }),
    dashboard(tenantId),
  ]);
  return { dashboard: dash, financial: fin, overdueSample: overdue };
}

/** FR-1 surface: overdue list used as reminder worklist. */
export async function reminderWorklist(tenantId) {
  requireBonus();
  return listOverdue(tenantId, { limit: 100 });
}

/** FR-9: mobile-first capability flags (API is the ops surface). */
export function mobileCapabilities() {
  requireBonus();
  return {
    apiBase: "/api/v1/rental",
    realms: ["admin", "customer", "public"],
    scan: true,
    offline: false,
    touchFriendly: true,
  };
}
