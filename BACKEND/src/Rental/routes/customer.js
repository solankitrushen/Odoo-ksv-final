import { Router } from "express";
import { asyncHandler } from "../../Utils/asyncHandler.js";
import { sendSuccess } from "../../Utils/errorResponse.js";
import { buildCtx, requireIdempotencyKey } from "../middleware/context.js";
import * as V from "../validators.js";
import * as rental from "../services/rentalService.js";
import * as finance from "../services/financeService.js";
import * as customers from "../services/customerService.js";
import * as cart from "../services/cartService.js";
import * as invoices from "../services/invoiceService.js";
import * as schedules from "../services/scheduleService.js";
import * as depositStatus from "../services/depositStatusService.js";
import { RentalOrder, RentalPayment, RentalDepositEntry } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { uploadProductImages } from "../middleware/uploadProductImage.js";
import { uploadImageBuffer } from "../integrations/cloudinary.js";

const r = Router();

// Authenticated customer realm. req.tenantId + req.customerId set by customerAuth.
r.get("/me", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await customers.getSelfProfile(req.tenantId, req.customerId));
}));

r.patch("/me", asyncHandler(async (req, res) => {
  const input = V.customerSelfProfilePatch.parse(req.body);
  sendSuccess(res, 200, await customers.updateSelfProfile(req.tenantId, req.customerId, input, buildCtx(req).actor));
}));

r.put("/me/addresses", asyncHandler(async (req, res) => {
  const { addresses } = V.customerAddressesReplace.parse(req.body);
  sendSuccess(
    res,
    200,
    await customers.replaceSelfAddresses(req.tenantId, req.customerId, addresses, buildCtx(req).actor),
  );
}));

r.post(
  "/me/photo",
  uploadProductImages,
  asyncHandler(async (req, res) => {
    const f = req.productImageFiles[0];
    const up = await uploadImageBuffer(req.tenantId, f.buffer, {
      filename: f.originalname,
      mime: f.mimetype,
      folder: `rental/${req.tenantId}/profiles`,
    });
    sendSuccess(
      res,
      200,
      await customers.setSelfPhoto(req.tenantId, req.customerId, { url: up.url }, buildCtx(req).actor)
    );
  })
);

// ---- Cart (SPEC-004) ----
r.get("/cart", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await cart.getCart(req.tenantId, req.customerId));
}));
r.put("/cart/fulfillment", asyncHandler(async (req, res) => {
  const body = V.cartFulfillment.parse(req.body);
  sendSuccess(res, 200, await cart.setFulfillment(req.tenantId, req.customerId, body, buildCtx(req).actor));
}));
r.post("/cart/items", asyncHandler(async (req, res) => {
  const body = V.cartItemAdd.parse(req.body);
  sendSuccess(res, 201, await cart.addCartItem(req.tenantId, req.customerId, body, buildCtx(req).actor));
}));
r.patch("/cart/items/:lineId", asyncHandler(async (req, res) => {
  const body = V.cartItemPatch.parse(req.body);
  sendSuccess(res, 200, await cart.updateCartItem(req.tenantId, req.customerId, req.params.lineId, body, buildCtx(req).actor));
}));
r.delete("/cart/items/:lineId", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await cart.removeCartItem(req.tenantId, req.customerId, req.params.lineId, buildCtx(req).actor));
}));
r.delete("/cart", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await cart.clearCart(req.tenantId, req.customerId, buildCtx(req).actor));
}));
r.get("/cart/preview", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await cart.previewCart(req.tenantId, req.customerId));
}));
r.post("/cart/checkout", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  sendSuccess(res, 201, await cart.checkoutCart(req.tenantId, req.customerId, buildCtx(req).actor, key));
}));

r.get("/rentals", asyncHandler(async (req, res) => {
  const lim = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);
  const skip = (Math.max(1, Number(req.query.page) || 1) - 1) * lim;
  const filter = { tenantId: req.tenantId, customerId: req.customerId };
  const [items, total] = await Promise.all([
    RentalOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    RentalOrder.countDocuments(filter),
  ]);
  sendSuccess(res, 200, { items, total, page: Number(req.query.page) || 1, limit: lim });
}));

r.get("/rentals/:id", asyncHandler(async (req, res) => {
  const doc = await RentalOrder.findOne({ _id: req.params.id, tenantId: req.tenantId, customerId: req.customerId }).lean();
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  sendSuccess(res, 200, { rental: doc });
}));

r.get("/rentals/:id/payments", asyncHandler(async (req, res) => {
  const rental = await RentalOrder.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    customerId: req.customerId,
  }).select("_id").lean();
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  const items = await RentalPayment.find({ tenantId: req.tenantId, rentalId: rental._id })
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, 200, { items });
}));

r.get("/rentals/:id/deposit-entries", asyncHandler(async (req, res) => {
  const rental = await RentalOrder.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    customerId: req.customerId,
  }).select("_id").lean();
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  const items = await RentalDepositEntry.find({ tenantId: req.tenantId, rentalId: rental._id })
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, 200, { items });
}));

r.get("/rentals/:id/deposit", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await depositStatus.getDepositStatus(req.tenantId, req.params.id, { customerId: req.customerId })
  );
}));

r.get("/rentals/:id/penalty", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await schedules.getPenaltyBreakdown(req.tenantId, req.params.id, { customerId: req.customerId })
  );
}));

r.get("/rentals/:id/invoice", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await invoices.getLatestInvoiceForRental(req.tenantId, req.params.id, { customerId: req.customerId })
  );
}));

r.get("/rentals/:id/invoice/download", asyncHandler(async (req, res) => {
  const { invoice } = await invoices.getLatestInvoiceForRental(req.tenantId, req.params.id, {
    customerId: req.customerId,
  });
  const { pdf, filename } = await invoices.renderInvoicePdf(req.tenantId, invoice._id, {
    customerId: req.customerId,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(pdf);
}));

// Customer-initiated draft (quote request) for their own account.
r.post("/rentals", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = V.rentalCreate.parse({ ...req.body, customerId: req.customerId, orderChannel: "customer" });
  if (String(input.customerId) !== String(req.customerId)) {
    throw rentalError("FORBIDDEN", "Cannot create rentals for another customer");
  }
  sendSuccess(res, 201, await rental.createDraft(req.tenantId, input, buildCtx(req).actor, key));
}));

// Delivery checkout: create Razorpay (or mock) order for charge + deposit.
r.post("/rentals/:id/checkout/razorpay-order", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  sendSuccess(
    res,
    200,
    await finance.createCustomerCheckoutOrder(
      req.tenantId,
      { rentalId: req.params.id, customerId: req.customerId },
      buildCtx(req).actor,
    ),
  );
}));

// Confirm payment after Razorpay Checkout (or mock) success.
r.post("/rentals/:id/checkout/confirm", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const body = V.customerCheckoutConfirm.parse(req.body);
  sendSuccess(
    res,
    201,
    await finance.confirmCustomerCheckoutPayment(
      req.tenantId,
      { rentalId: req.params.id, customerId: req.customerId, ...body },
      buildCtx(req).actor,
      key,
    ),
  );
}));

export default r;
