// SPEC-RMS-001 FR-009/010 availability + race-safe allocation.
import mongoose from "mongoose";
import { RentalAsset, RentalAllocation, RentalMaintenanceBlock, RentalOrder } from "../schema/index.js";
import {
  BLOCKING_ALLOCATION_STATUSES,
  ALLOCATION_STATUS,
  ASSET_STATE,
  RENTAL_STATUS,
} from "../constants.js";
import { withRentalTransaction } from "../db/tx.js";
import { writeAudit } from "./infra.js";
import { rentalError } from "../errors.js";
import { reservationTtlMinutes } from "../config.js";

const NON_ALLOCATABLE_STATES = [ASSET_STATE.LOST, ASSET_STATE.RETIRED, ASSET_STATE.MAINTENANCE];
const NON_ALLOCATABLE_CONDITIONS = ["damaged", "unusable"];

function overlapFilter(startAt, endAt) {
  return { startAt: { $lt: endAt }, endAt: { $gt: startAt } };
}

async function busyAssetIds(tenantId, candidateIds, startAt, endAt, session) {
  const opt = session ? { session } : {};
  const [allocs, maint] = await Promise.all([
    RentalAllocation.find(
      {
        tenantId,
        assetId: { $in: candidateIds },
        status: { $in: BLOCKING_ALLOCATION_STATUSES },
        ...overlapFilter(startAt, endAt),
      },
      null,
      opt
    ).lean(),
    RentalMaintenanceBlock.find(
      {
        tenantId,
        assetId: { $in: candidateIds },
        status: { $in: ["scheduled", "active"] },
        ...overlapFilter(startAt, endAt),
      },
      null,
      opt
    ).lean(),
  ]);
  const busy = new Set();
  allocs.forEach((a) => busy.add(String(a.assetId)));
  maint.forEach((m) => busy.add(String(m.assetId)));
  return busy;
}

/** Half-open availability for one variant/interval. Read-only. Optional locationId. */
export async function checkAvailability(
  tenantId,
  { variantId, startAt, endAt, quantity = 1, locationId }
) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!(end > start)) throw rentalError("INVALID_INTERVAL", "endAt must be after startAt");

  const filter = {
    tenantId,
    variantId,
    archivedAt: null,
    state: { $nin: NON_ALLOCATABLE_STATES },
    condition: { $nin: NON_ALLOCATABLE_CONDITIONS },
  };
  if (locationId) filter.locationId = locationId;

  const candidates = await RentalAsset.find(filter)
    .sort({ assetCode: 1, _id: 1 })
    .lean();

  const candidateIds = candidates.map((c) => c._id);
  const busy = await busyAssetIds(tenantId, candidateIds, start, end, null);
  const eligible = candidates.filter((c) => !busy.has(String(c._id)));
  return {
    availableCount: eligible.length,
    requested: quantity,
    locationId: locationId || null,
    eligibleAssetIds: eligible.map((c) => String(c._id)),
    sufficient: eligible.length >= quantity,
  };
}

/**
 * Reserve all lines atomically. Writes each chosen asset's allocationVersion so
 * concurrent reservers of the same asset trigger a write conflict → retry.
 * All-or-nothing; partial reservation is impossible.
 */
export async function reserveRental(tenantId, { rentalId, expectedVersion, selectedAssetIds = [], actor }) {
  return withRentalTransaction(async (session) => {
    const rental = await RentalOrder.findOne({ _id: rentalId, tenantId }).session(session);
    if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    if (rental.status !== RENTAL_STATUS.DRAFT) {
      throw rentalError("INVALID_STATE_TRANSITION", "Only a draft can be reserved");
    }
    if (expectedVersion != null && rental.version !== expectedVersion) {
      throw rentalError("VERSION_CONFLICT", "Stale rental version", { currentVersion: rental.version });
    }
    if (!rental.startAt || !rental.endAt || !(rental.endAt > rental.startAt)) {
      throw rentalError("INVALID_INTERVAL", "Rental interval invalid");
    }

    const pickedGlobal = new Set(); // assetIds chosen across all lines this txn
    const expiresAt = new Date(Date.now() + reservationTtlMinutes() * 60000);

    for (const line of rental.lines) {
      const need = line.quantity;
      const lineStart = line.startAt || rental.startAt;
      const lineEnd = line.endAt || rental.endAt;
      const assetFilter = {
        tenantId,
        variantId: line.variantId,
        archivedAt: null,
        state: { $nin: NON_ALLOCATABLE_STATES },
        condition: { $nin: NON_ALLOCATABLE_CONDITIONS },
      };
      if (line.locationId) assetFilter.locationId = line.locationId;
      const candidates = await RentalAsset.find(assetFilter)
        .sort({ assetCode: 1, _id: 1 })
        .session(session);

      const candidateIds = candidates.map((c) => c._id);
      const busy = await busyAssetIds(tenantId, candidateIds, lineStart, lineEnd, session);

      const preferred = new Set(selectedAssetIds.map(String));
      const eligible = candidates
        .filter((c) => !busy.has(String(c._id)) && !pickedGlobal.has(String(c._id)))
        .sort((a, b) => {
          const pa = preferred.has(String(a._id)) ? 0 : 1;
          const pb = preferred.has(String(b._id)) ? 0 : 1;
          if (pa !== pb) return pa - pb;
          return String(a.assetCode) < String(b.assetCode) ? -1 : 1;
        });

      if (eligible.length < need) {
        throw rentalError("ASSET_UNAVAILABLE", "Insufficient available assets for line", {
          lineId: line.lineId,
          need,
          available: eligible.length,
        });
      }

      const chosen = eligible.slice(0, need);
      for (const asset of chosen) {
        // CAS write on allocationVersion: same-asset concurrent reservers conflict.
        const upd = await RentalAsset.updateOne(
          { _id: asset._id, tenantId, allocationVersion: asset.allocationVersion },
          { $inc: { allocationVersion: 1, version: 1 }, $set: { state: ASSET_STATE.HELD } },
          { session }
        );
        if (upd.modifiedCount !== 1) {
          throw rentalError("ASSET_UNAVAILABLE", "Asset changed during reservation");
        }
        await RentalAllocation.create(
          [
            {
              tenantId,
              rentalId: rental._id,
              lineId: line.lineId,
              assetId: asset._id,
              startAt: lineStart,
              endAt: lineEnd,
              status: ALLOCATION_STATUS.HELD,
              expiresAt,
            },
          ],
          { session }
        );
        pickedGlobal.add(String(asset._id));
      }
    }

    rental.status = RENTAL_STATUS.RESERVED;
    rental.reservationExpiresAt = expiresAt;
    rental.version += 1;
    await rental.save({ session });

    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "rental.reserve",
        resourceType: "RentalOrder",
        resourceId: String(rental._id),
        resourceVersion: rental.version,
      },
      session
    );

    return rental.toObject();
  });
}

void mongoose;
