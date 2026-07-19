// SPEC-004 portal cart + checkout → draft rental (multi-window lines OK).
import { RentalCart, RentalCustomer, RentalVariant, RentalProduct } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { checkAvailability } from "./availability.js";
import { quoteRental } from "./rentalPricing.js";
import * as rental from "./rentalService.js";
import { writeAudit } from "./infra.js";
import { MOCK_DELIVERY_MESSAGE, MOCK_DELIVERY_MIN_DAYS, MOCK_DELIVERY_MAX_DAYS } from "../constants.js";

async function loadOrCreateCart(tenantId, customerId) {
  let cart = await RentalCart.findOne({ tenantId, customerId });
  if (!cart) {
    cart = await RentalCart.create({
      tenantId,
      customerId,
      lines: [],
      fulfillment: { method: "pickup", addressId: null },
      version: 0,
    });
  }
  return cart;
}

async function annotateAvailability(tenantId, cartObj) {
  const lines = [];
  for (const l of cartObj.lines || []) {
    const avail = await checkAvailability(tenantId, {
      variantId: l.variantId,
      startAt: l.startAt,
      endAt: l.endAt,
      quantity: l.quantity,
      locationId: l.locationId || undefined,
    });
    lines.push({
      ...l,
      availability: {
        availableCount: avail.availableCount,
        requested: avail.requested,
        sufficient: avail.sufficient,
        locationId: avail.locationId,
      },
    });
  }
  return { ...cartObj, lines };
}

export async function getCart(tenantId, customerId) {
  const cart = await loadOrCreateCart(tenantId, customerId);
  return { cart: await annotateAvailability(tenantId, cart.toObject()) };
}

export async function setFulfillment(tenantId, customerId, { method, addressId }, actor) {
  if (method === "delivery" && !addressId) {
    throw rentalError("VALIDATION_ERROR", "delivery requires addressId");
  }
  if (method === "delivery") {
    const customer = await RentalCustomer.findOne({ _id: customerId, tenantId }).lean();
    const ok = (customer?.addresses || []).some(
      (a) => String(a._id) === String(addressId) || String(a.id) === String(addressId)
    );
    if (!ok) throw rentalError("VALIDATION_ERROR", "addressId not found on customer");
  }
  const cart = await loadOrCreateCart(tenantId, customerId);
  cart.fulfillment = { method, addressId: method === "delivery" ? addressId : null };
  cart.version += 1;
  await cart.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "cart.fulfillment",
    resourceType: "RentalCart", resourceId: String(cart._id), resourceVersion: cart.version,
  });
  const cartOut = await annotateAvailability(tenantId, cart.toObject());
  if (method === "delivery") {
    return {
      cart: cartOut,
      deliveryPromise: {
        mock: true,
        message: MOCK_DELIVERY_MESSAGE,
        estimatedMinDays: MOCK_DELIVERY_MIN_DAYS,
        estimatedMaxDays: MOCK_DELIVERY_MAX_DAYS,
      },
    };
  }
  return { cart: cartOut };
}

export async function addCartItem(tenantId, customerId, line, actor) {
  if (!(new Date(line.endAt) > new Date(line.startAt))) {
    throw rentalError("INVALID_INTERVAL", "endAt must be after startAt");
  }
  const variant = await RentalVariant.findOne({ _id: line.variantId, tenantId, status: "active" }).lean();
  if (!variant) throw rentalError("RESOURCE_NOT_FOUND", "Variant not found");
  const product = await RentalProduct.findOne({ _id: variant.productId, tenantId, status: "active" }).lean();
  if (!product) throw rentalError("RESOURCE_NOT_FOUND", "Product not found");

  const avail = await checkAvailability(tenantId, {
    variantId: line.variantId,
    startAt: line.startAt,
    endAt: line.endAt,
    quantity: line.quantity,
    locationId: line.locationId,
  });
  if (!avail.sufficient) {
    throw rentalError("ASSET_UNAVAILABLE", "Not enough units for requested window", {
      availableCount: avail.availableCount,
      requested: line.quantity,
    });
  }

  const cart = await loadOrCreateCart(tenantId, customerId);
  const lineId = line.lineId || `L${cart.lines.length + 1}`;
  cart.lines.push({
    lineId,
    variantId: line.variantId,
    quantity: line.quantity,
    periodCode: line.periodCode || variant.defaultPeriodCode || "day",
    startAt: new Date(line.startAt),
    endAt: new Date(line.endAt),
    locationId: line.locationId || null,
  });
  cart.version += 1;
  await cart.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "cart.addItem",
    resourceType: "RentalCart", resourceId: String(cart._id), resourceVersion: cart.version,
  });
  return { cart: await annotateAvailability(tenantId, cart.toObject()) };
}

export async function updateCartItem(tenantId, customerId, lineId, patch, actor) {
  const cart = await loadOrCreateCart(tenantId, customerId);
  const idx = cart.lines.findIndex((l) => l.lineId === lineId);
  if (idx < 0) throw rentalError("RESOURCE_NOT_FOUND", "Cart line not found");
  const line = cart.lines[idx];
  if (patch.quantity != null) line.quantity = patch.quantity;
  if (patch.periodCode != null) line.periodCode = patch.periodCode;
  if (patch.startAt != null) line.startAt = new Date(patch.startAt);
  if (patch.endAt != null) line.endAt = new Date(patch.endAt);
  if (patch.locationId !== undefined) line.locationId = patch.locationId || null;
  if (!(line.endAt > line.startAt)) throw rentalError("INVALID_INTERVAL", "endAt must be after startAt");

  const avail = await checkAvailability(tenantId, {
    variantId: line.variantId,
    startAt: line.startAt,
    endAt: line.endAt,
    quantity: line.quantity,
    locationId: line.locationId || undefined,
  });
  if (!avail.sufficient) {
    throw rentalError("ASSET_UNAVAILABLE", "Not enough units for requested window", {
      availableCount: avail.availableCount,
    });
  }
  cart.version += 1;
  await cart.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "cart.updateItem",
    resourceType: "RentalCart", resourceId: String(cart._id), resourceVersion: cart.version,
  });
  return { cart: await annotateAvailability(tenantId, cart.toObject()) };
}

export async function removeCartItem(tenantId, customerId, lineId, actor) {
  const cart = await loadOrCreateCart(tenantId, customerId);
  const before = cart.lines.length;
  cart.lines = cart.lines.filter((l) => l.lineId !== lineId);
  if (cart.lines.length === before) throw rentalError("RESOURCE_NOT_FOUND", "Cart line not found");
  cart.version += 1;
  await cart.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "cart.removeItem",
    resourceType: "RentalCart", resourceId: String(cart._id), resourceVersion: cart.version,
  });
  return { cart: await annotateAvailability(tenantId, cart.toObject()) };
}

export async function clearCart(tenantId, customerId, actor) {
  const cart = await loadOrCreateCart(tenantId, customerId);
  cart.lines = [];
  cart.version += 1;
  await cart.save();
  await writeAudit({
    tenantId, actorType: actor.type, actorId: actor.id, action: "cart.clear",
    resourceType: "RentalCart", resourceId: String(cart._id), resourceVersion: cart.version,
  });
  return { cart: cart.toObject() };
}

/** Preview totals without creating an order. Multi-window lines supported. */
export async function previewCart(tenantId, customerId) {
  const cart = await loadOrCreateCart(tenantId, customerId);
  if (!cart.lines.length) throw rentalError("VALIDATION_ERROR", "Cart is empty");

  for (const l of cart.lines) {
    const avail = await checkAvailability(tenantId, {
      variantId: l.variantId,
      startAt: l.startAt,
      endAt: l.endAt,
      quantity: l.quantity,
      locationId: l.locationId || undefined,
    });
    if (!avail.sufficient) {
      throw rentalError("ASSET_UNAVAILABLE", `Line ${l.lineId} unavailable`, {
        availableCount: avail.availableCount,
      });
    }
  }

  const starts = cart.lines.map((l) => new Date(l.startAt).getTime());
  const ends = cart.lines.map((l) => new Date(l.endAt).getTime());
  const fakeRental = {
    tenantId,
    customerId,
    startAt: new Date(Math.min(...starts)),
    endAt: new Date(Math.max(...ends)),
    lines: cart.lines.map((l) => ({
      lineId: l.lineId,
      variantId: l.variantId,
      quantity: l.quantity,
      periodCode: l.periodCode,
      startAt: l.startAt,
      endAt: l.endAt,
      locationId: l.locationId,
    })),
  };
  const quote = await quoteRental(tenantId, fakeRental);
  return {
    cart: await annotateAvailability(tenantId, cart.toObject()),
    preview: {
      preTaxSubtotalPaise: quote.preTaxSubtotalPaise,
      bookedGstPaise: quote.bookedGstPaise,
      deposit: quote.deposit,
      totalPaise: quote.totalPaise,
      fingerprint: quote.fingerprint,
      taxBreakdown: quote.taxBreakdown,
      lines: quote.lines,
    },
  };
}

/**
 * Checkout: re-validate availability, create draft rental from cart, clear cart.
 * Payment uses existing /rentals/:id/checkout/* endpoints.
 */
export async function checkoutCart(tenantId, customerId, actor, idempotencyKey) {
  const { cart, preview } = await previewCart(tenantId, customerId);
  const customer = await RentalCustomer.findOne({ _id: customerId, tenantId }).lean();
  if (!customer) throw rentalError("RESOURCE_NOT_FOUND", "Customer not found");

  let addresses = null;
  let fulfillment = { method: cart.fulfillment?.method || "pickup" };
  if (fulfillment.method === "delivery") {
    const addr = (customer.addresses || []).find((a) => String(a._id) === String(cart.fulfillment.addressId));
    if (!addr) throw rentalError("VALIDATION_ERROR", "Delivery address required");
    addresses = { delivery: addr };
    fulfillment = { method: "delivery", addressId: String(addr._id) };
  }

  const starts = cart.lines.map((l) => new Date(l.startAt).getTime());
  const ends = cart.lines.map((l) => new Date(l.endAt).getTime());

  const out = await rental.createDraft(
    tenantId,
    {
      customerId,
      startAt: new Date(Math.min(...starts)).toISOString(),
      endAt: new Date(Math.max(...ends)).toISOString(),
      orderChannel: "customer",
      lines: cart.lines.map((l) => ({
        lineId: l.lineId,
        variantId: String(l.variantId),
        quantity: l.quantity,
        periodCode: l.periodCode,
        startAt: new Date(l.startAt).toISOString(),
        endAt: new Date(l.endAt).toISOString(),
        locationId: l.locationId || undefined,
      })),
      addresses,
      fulfillment,
    },
    actor,
    idempotencyKey
  );

  await clearCart(tenantId, customerId, actor);
  return { ...out, cartPreview: preview };
}
