// Mock outbound delivery: promise 4–5 days; admin confirms delivery (no Borzo calls).
import {
  RentalOrder,
  RentalShipment,
} from "../schema/index.js";
import {
  PROVIDERS,
  RENTAL_STATUS,
  SHIPMENT_LEG,
  SHIPMENT_STATUS,
  MOCK_DELIVERY_MESSAGE,
  MOCK_DELIVERY_MIN_DAYS,
  MOCK_DELIVERY_MAX_DAYS,
} from "../constants.js";
import { canTransitionRental } from "./stateMachine.js";
import { withRentalTransaction } from "../db/tx.js";
import { writeAudit, guardIdempotency, storeIdempotency } from "./infra.js";
import { rentalError } from "../errors.js";

function deliveryPoint(rental) {
  const d = rental.addresses?.delivery;
  if (!d?.line1) throw rentalError("VALIDATION_ERROR", "Delivery address is required");
  const parts = [d.line1, d.line2, d.city, d.state, d.pincode || d.postalCode].filter(Boolean);
  return {
    name: d.fullName || d.recipient || rental.customerSnapshot?.displayName || "Customer",
    phone: d.phone || rental.fulfillment?.contactPhone || rental.customerSnapshot?.phone || "",
    address: parts.join(", "),
  };
}

function isPaidForDispatch(rental) {
  if (rental.fulfillment?.paymentStatus === "paid") return true;
  if ((rental.balanceDuePaise ?? 0) <= 0 && (rental.paymentsPaise ?? 0) > 0) return true;
  return false;
}

function buildDeliveryPromise(from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const estimatedFrom = new Date(start);
  estimatedFrom.setDate(estimatedFrom.getDate() + MOCK_DELIVERY_MIN_DAYS);
  const estimatedTo = new Date(start);
  estimatedTo.setDate(estimatedTo.getDate() + MOCK_DELIVERY_MAX_DAYS);
  return {
    mock: true,
    provider: PROVIDERS.MOCK,
    message: MOCK_DELIVERY_MESSAGE,
    estimatedMinDays: MOCK_DELIVERY_MIN_DAYS,
    estimatedMaxDays: MOCK_DELIVERY_MAX_DAYS,
    estimatedDeliveryFrom: estimatedFrom.toISOString(),
    estimatedDeliveryTo: estimatedTo.toISOString(),
  };
}

async function existingOutboundShipment(tenantId, rentalId, session) {
  return RentalShipment.findOne(
    {
      tenantId,
      rentalId,
      leg: SHIPMENT_LEG.OUTBOUND,
      status: { $nin: [SHIPMENT_STATUS.CANCELLED, SHIPMENT_STATUS.FAILED] },
    },
    null,
    { session, sort: { createdAt: -1 } },
  );
}

async function bookMockShipment(tenantId, rental, session) {
  const existing = await existingOutboundShipment(tenantId, rental._id, session);
  if (existing) return existing;

  const drop = deliveryPoint(rental);
  const promise = buildDeliveryPromise();
  const providerOrderId = `mock_${rental.rentalNumber}_${Date.now()}`;

  const doc = await RentalShipment.create(
    [
      {
        tenantId,
        rentalId: rental._id,
        leg: SHIPMENT_LEG.OUTBOUND,
        provider: PROVIDERS.MOCK,
        providerOrderId,
        status: SHIPMENT_STATUS.BOOKED,
        trackingUrl: null,
        metadata: {
          mock: true,
          message: promise.message,
          estimatedMinDays: promise.estimatedMinDays,
          estimatedMaxDays: promise.estimatedMaxDays,
          estimatedDeliveryFrom: promise.estimatedDeliveryFrom,
          estimatedDeliveryTo: promise.estimatedDeliveryTo,
          drop,
        },
      },
    ],
    { session },
  );
  return doc[0];
}

function shipmentPublicView(shipment) {
  const s = shipment.toObject?.() || shipment;
  const meta = s.metadata || {};
  return {
    ...s,
    deliveryPromise: {
      mock: true,
      message: meta.message || MOCK_DELIVERY_MESSAGE,
      estimatedMinDays: meta.estimatedMinDays ?? MOCK_DELIVERY_MIN_DAYS,
      estimatedMaxDays: meta.estimatedMaxDays ?? MOCK_DELIVERY_MAX_DAYS,
      estimatedDeliveryFrom: meta.estimatedDeliveryFrom || null,
      estimatedDeliveryTo: meta.estimatedDeliveryTo || null,
    },
  };
}

/**
 * Schedule mock delivery: confirmed → dispatch_pending.
 * Customer message: "We'll deliver to you in 4-5 days" (no Borzo).
 */
export async function dispatchDelivery(tenantId, { rentalId }, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId,
    actorType: actor.type,
    actorId: actor.id,
    scope: "rental.dispatch",
    key: idempotencyKey,
    body: { rentalId },
  });
  if (replay) return replay.response;

  const out = await withRentalTransaction(async (session) => {
    const rental = await RentalOrder.findOne({ _id: rentalId, tenantId }).session(session);
    if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    if (rental.fulfillment?.method !== "delivery") {
      throw rentalError("VALIDATION_ERROR", "Dispatch applies only to delivery rentals");
    }
    if (!isPaidForDispatch(rental)) {
      throw rentalError("INVALID_STATE_TRANSITION", "Payment must be collected before dispatch");
    }

    const fromStatus = rental.status;
    if (fromStatus === RENTAL_STATUS.DISPATCH_PENDING) {
      const shipment = await existingOutboundShipment(tenantId, rental._id, session);
      if (shipment) {
        const promise = buildDeliveryPromise(shipment.createdAt || new Date());
        return {
          rental: rental.toObject(),
          shipment: shipmentPublicView(shipment),
          deliveryPromise: promise,
        };
      }
    }
    if (!canTransitionRental(fromStatus, RENTAL_STATUS.DISPATCH_PENDING)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot dispatch from ${fromStatus}`);
    }

    const shipment = await bookMockShipment(tenantId, rental, session);
    const promise = buildDeliveryPromise(shipment.createdAt || new Date());

    rental.status = RENTAL_STATUS.DISPATCH_PENDING;
    const fulfillment = { ...(rental.fulfillment?.toObject?.() || rental.fulfillment || {}) };
    fulfillment.dispatchedAt = null;
    fulfillment.deliveredAt = null;
    fulfillment.shipmentId = String(shipment._id);
    fulfillment.deliveryPromise = promise;
    rental.fulfillment = fulfillment;
    rental.version += 1;
    await rental.save({ session });

    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "rental.dispatch",
        resourceType: "RentalOrder",
        resourceId: String(rental._id),
        resourceVersion: rental.version,
        afterSummary: { deliveryPromise: promise },
      },
      session,
    );

    const response = {
      rental: rental.toObject(),
      shipment: shipmentPublicView(shipment),
      deliveryPromise: promise,
    };
    await storeIdempotency(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        scope: "rental.dispatch",
        key: idempotencyKey,
        body: { rentalId },
        statusCode: 200,
        response,
      },
      session,
    );
    return response;
  });
  return out;
}

/**
 * Admin confirms delivery happened: dispatch_pending → dispatched,
 * shipment → delivered. Then ops can issue (stock out / ACTIVE).
 */
export async function confirmDelivery(tenantId, { rentalId }, actor, idempotencyKey) {
  const replay = await guardIdempotency({
    tenantId,
    actorType: actor.type,
    actorId: actor.id,
    scope: "rental.confirm_delivery",
    key: idempotencyKey,
    body: { rentalId },
  });
  if (replay) return replay.response;

  const out = await withRentalTransaction(async (session) => {
    const rental = await RentalOrder.findOne({ _id: rentalId, tenantId }).session(session);
    if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    if (rental.fulfillment?.method !== "delivery") {
      throw rentalError("VALIDATION_ERROR", "Confirm delivery applies only to delivery rentals");
    }
    if (!canTransitionRental(rental.status, RENTAL_STATUS.DISPATCHED)) {
      throw rentalError("INVALID_STATE_TRANSITION", `Cannot confirm delivery from ${rental.status}`);
    }

    const shipment = await existingOutboundShipment(tenantId, rental._id, session);
    if (!shipment) {
      throw rentalError("INVALID_STATE_TRANSITION", "Schedule dispatch before confirming delivery");
    }

    shipment.status = SHIPMENT_STATUS.DELIVERED;
    shipment.rawStatus = "mock_delivered";
    shipment.metadata = {
      ...(shipment.metadata?.toObject?.() || shipment.metadata || {}),
      deliveredAt: new Date().toISOString(),
      confirmedBy: actor.id,
    };
    shipment.version = (shipment.version || 0) + 1;
    await shipment.save({ session });

    rental.status = RENTAL_STATUS.DISPATCHED;
    const fulfillment = { ...(rental.fulfillment?.toObject?.() || rental.fulfillment || {}) };
    const nowIso = new Date().toISOString();
    fulfillment.dispatchedAt = fulfillment.dispatchedAt || nowIso;
    fulfillment.deliveredAt = nowIso;
    fulfillment.deliveryPromise = {
      ...(fulfillment.deliveryPromise || buildDeliveryPromise()),
      status: "delivered",
      message: "Delivered",
    };
    rental.fulfillment = fulfillment;
    rental.version += 1;
    await rental.save({ session });

    await writeAudit(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        action: "rental.confirm_delivery",
        resourceType: "RentalOrder",
        resourceId: String(rental._id),
        resourceVersion: rental.version,
      },
      session,
    );

    const response = {
      rental: rental.toObject(),
      shipment: shipmentPublicView(shipment),
      deliveryPromise: fulfillment.deliveryPromise,
    };
    await storeIdempotency(
      {
        tenantId,
        actorType: actor.type,
        actorId: actor.id,
        scope: "rental.confirm_delivery",
        key: idempotencyKey,
        body: { rentalId },
        statusCode: 200,
        response,
      },
      session,
    );
    return response;
  });
  return out;
}

/** @deprecated alias — use confirmDelivery */
export const confirmDispatch = confirmDelivery;

/** Daily mock delivery schedule (includes rental number / customer for ops tables). */
export async function listDeliveriesForDate(tenantId, { date } = {}) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) throw rentalError("VALIDATION_ERROR", "Invalid date");
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  const items = await RentalShipment.find({
    tenantId,
    leg: SHIPMENT_LEG.OUTBOUND,
    createdAt: { $gte: start, $lte: end },
  })
    .sort({ createdAt: 1 })
    .lean();

  const rentalIds = [...new Set(items.map((s) => String(s.rentalId)).filter(Boolean))];
  const rentals = rentalIds.length
    ? await RentalOrder.find({ tenantId, _id: { $in: rentalIds } })
        .select("rentalNumber customerSnapshot status fulfillment")
        .lean()
    : [];
  const byId = new Map(rentals.map((row) => [String(row._id), row]));

  return {
    date: start.toISOString().slice(0, 10),
    items: items.map((s) => {
      const meta = byId.get(String(s.rentalId));
      return {
        ...shipmentPublicView(s),
        rentalId: s.rentalId,
        rentalNumber: meta?.rentalNumber || null,
        customerSnapshot: meta?.customerSnapshot || null,
        status: meta?.status || null,
        shipmentStatus: s.status,
      };
    }),
  };
}

/** Latest outbound shipment for a rental (ops detail). */
export async function getOutboundShipment(tenantId, rentalId) {
  const shipment = await RentalShipment.findOne({
    tenantId,
    rentalId,
    leg: SHIPMENT_LEG.OUTBOUND,
    status: { $nin: [SHIPMENT_STATUS.CANCELLED, SHIPMENT_STATUS.FAILED] },
  })
    .sort({ createdAt: -1 })
    .lean();
  return shipment ? shipmentPublicView(shipment) : null;
}

export { buildDeliveryPromise, MOCK_DELIVERY_MESSAGE, shipmentPublicView };
