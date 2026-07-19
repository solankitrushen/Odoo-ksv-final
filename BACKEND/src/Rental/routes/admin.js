import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../Utils/asyncHandler.js";
import { sendSuccess } from "../../Utils/errorResponse.js";
import { buildCtx, requireIdempotencyKey, optionalIdempotencyKey, requireVersion } from "../middleware/context.js";
import * as V from "../validators.js";
import * as customers from "../services/customerService.js";
import * as customerAuth from "../services/customerAuthService.js";
import * as catalog from "../services/catalogAdminService.js";
import * as availability from "../services/availability.js";
import * as rental from "../services/rentalService.js";
import * as finance from "../services/financeService.js";
import * as delivery from "../services/deliveryService.js";
import * as reporting from "../services/reportingService.js";
import {
  RentalOrder,
  RentalPayment,
  RentalDepositEntry,
  RentalAuditEvent,
  RentalNotification,
  RentalShipment,
} from "../schema/index.js";
import { rentalError } from "../errors.js";
import { uploadProductImages } from "../middleware/uploadProductImage.js";
import { uploadInspectionPhotoOne, uploadInspectionPhotos } from "../middleware/uploadInspectionPhotos.js";
import { uploadProductImageBuffer, uploadInspectionImageBuffer } from "../integrations/cloudinary.js";
import * as tax from "../services/taxService.js";
import * as invoices from "../services/invoiceService.js";
import * as schedules from "../services/scheduleService.js";
import * as templates from "../services/templateService.js";
import * as repairs from "../services/repairService.js";
import * as adminUsers from "../services/adminUsersService.js";
import * as bonus from "../services/bonusService.js";
import * as overdueSweep from "../services/overdueSweep.js";
import * as risk from "../services/riskService.js";
import * as analytics from "../services/analyticsService.js";

const r = Router();
const ctx = (req) => buildCtx(req);

// Generic tenant-scoped paginated read (newest first).
async function pagedList(Model, tenantId, query, extra = {}) {
  const lim = Math.min(Math.max(1, Number(query.limit) || 25), 100);
  const page = Math.max(1, Number(query.page) || 1);
  const filter = { tenantId, ...extra };
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * lim).limit(lim).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, total, page, limit: lim };
}

const RENTAL_PAYMENT_FIELDS =
  "rentalNumber customerSnapshot orderChannel fulfillment.method fulfillment.paymentStatus fulfillment.paidAt";

async function rentalMetaByIds(tenantId, rentalIds) {
  const ids = [...new Set(rentalIds.map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await RentalOrder.find({ tenantId, _id: { $in: ids } })
    .select(RENTAL_PAYMENT_FIELDS)
    .lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

function attachRentalMeta(item, meta) {
  if (!meta) return item;
  return {
    ...item,
    rentalNumber: meta.rentalNumber ?? null,
    customerName: meta.customerSnapshot?.displayName ?? null,
    customerEmail: meta.customerSnapshot?.email ?? null,
    orderChannel: meta.orderChannel ?? null,
    fulfillmentMethod: meta.fulfillment?.method ?? null,
    rentalPaymentStatus: meta.fulfillment?.paymentStatus ?? null,
  };
}

async function enrichPaymentRows(tenantId, items) {
  const meta = await rentalMetaByIds(
    tenantId,
    items.map((p) => p.rentalId),
  );
  return items.map((p) => attachRentalMeta(p, meta.get(String(p.rentalId))));
}

async function listPendingCustomerCheckouts(tenantId, limit = 50) {
  const rows = await RentalOrder.find({
    tenantId,
    "fulfillment.pendingPayment.orderId": { $exists: true },
    "fulfillment.paymentStatus": { $ne: "paid" },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select(`${RENTAL_PAYMENT_FIELDS} fulfillment.pendingPayment createdAt status`)
    .lean();
  return rows.map((row) => ({
    rentalId: String(row._id),
    rentalNumber: row.rentalNumber,
    customerName: row.customerSnapshot?.displayName ?? null,
    customerEmail: row.customerSnapshot?.email ?? null,
    orderChannel: row.orderChannel ?? null,
    status: row.status,
    createdAt: row.createdAt,
    fulfillmentMethod: row.fulfillment?.method ?? null,
    pendingPayment: row.fulfillment?.pendingPayment ?? null,
  }));
}

// ---- Customers ----
r.get("/customers", asyncHandler(async (req, res) => {
  const out = await customers.listCustomers(req.tenantId, req.query);
  sendSuccess(res, 200, out);
}));
r.post("/customers", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = V.customerCreate.parse(req.body);
  const { portalPassword, ...customerInput } = input;
  if (portalPassword && !customerInput.email) {
    throw rentalError("VALIDATION_ERROR", "email is required when portalPassword is set");
  }
  const out = await customers.createCustomer(req.tenantId, customerInput, ctx(req).actor, key);
  if (portalPassword && customerInput.email) {
    out.portal = await customerAuth.provisionPortalAccess(
      req.tenantId,
      out.customer._id,
      { email: customerInput.email, password: portalPassword },
      ctx(req).actor
    );
  }
  sendSuccess(res, 201, out);
}));
r.post("/customers/:id/portal-access", asyncHandler(async (req, res) => {
  const input = V.portalProvision.parse(req.body);
  sendSuccess(
    res,
    200,
    await customerAuth.provisionPortalAccess(req.tenantId, req.params.id, input, ctx(req).actor)
  );
}));
r.get("/customers/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await customers.getCustomer(req.tenantId, req.params.id));
}));
r.patch("/customers/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.customerUpdate.parse(req.body || {});
  sendSuccess(res, 200, await customers.updateCustomer(req.tenantId, req.params.id, version, body, ctx(req).actor));
}));
r.post("/customers/:id/block", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const reason = V.customerStatusReason.parse(req.body || {}).reason;
  const out = await customers.setCustomerStatus(req.tenantId, req.params.id, version, "blocked", reason, ctx(req).actor);
  sendSuccess(res, 200, out);
}));
r.post("/customers/:id/unblock", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const reason = V.customerStatusReason.parse(req.body || {}).reason;
  const out = await customers.setCustomerStatus(req.tenantId, req.params.id, version, "active", reason, ctx(req).actor);
  sendSuccess(res, 200, out);
}));
r.delete("/customers/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const reason = V.customerStatusReason.parse(req.body || {}).reason;
  const out = await customers.setCustomerStatus(req.tenantId, req.params.id, version, "archived", reason, ctx(req).actor);
  sendSuccess(res, 200, out);
}));

// ---- Catalog ----
r.get("/categories", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.listCategories(req.tenantId, req.query))));
r.post("/categories", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { category: await catalog.createCategory(req.tenantId, V.categoryCreate.parse(req.body), ctx(req).actor) });
}));
r.get("/categories/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getCategory(req.tenantId, req.params.id))));
r.patch("/categories/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.categoryUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, { category: await catalog.updateCategory(req.tenantId, req.params.id, version, patch, ctx(req).actor) });
}));
r.delete("/categories/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archiveCategory(req.tenantId, req.params.id, version, ctx(req).actor));
}));

r.get("/products", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.listProducts(req.tenantId, req.query))));
r.post("/products", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { product: await catalog.createProduct(req.tenantId, V.productCreate.parse(req.body), ctx(req).actor) });
}));
/** Multipart upload → Cloudinary; returns URLs to pass into product create/patch `images`. */
r.post(
  "/products/images",
  uploadProductImages,
  asyncHandler(async (req, res) => {
    const items = [];
    for (const f of req.productImageFiles) {
      items.push(
        await uploadProductImageBuffer(req.tenantId, f.buffer, {
          filename: f.originalname,
          mime: f.mimetype,
        })
      );
    }
    sendSuccess(res, 201, { items, urls: items.map((i) => i.url) });
  })
);
r.get("/products/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getProduct(req.tenantId, req.params.id))));
r.patch("/products/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.productUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, { product: await catalog.updateProduct(req.tenantId, req.params.id, version, patch, ctx(req).actor) });
}));
r.delete("/products/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archiveProduct(req.tenantId, req.params.id, version, ctx(req).actor));
}));
r.post("/products/:id/restore", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.restoreProduct(req.tenantId, req.params.id, version, ctx(req).actor));
}));

r.get("/variants", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.listVariants(req.tenantId, req.query))));
r.post("/variants", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { variant: await catalog.createVariant(req.tenantId, V.variantCreate.parse(req.body), ctx(req).actor) });
}));
r.get("/variants/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getVariant(req.tenantId, req.params.id))));
r.patch("/variants/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.variantUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, { variant: await catalog.updateVariant(req.tenantId, req.params.id, version, patch, ctx(req).actor) });
}));
r.delete("/variants/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archiveVariant(req.tenantId, req.params.id, version, ctx(req).actor));
}));

r.get("/rental-periods", asyncHandler(async (_req, res) => sendSuccess(res, 200, catalog.listRentalPeriods())));

// ---- Tax (SPEC-014) ----
r.get("/tax/codes", asyncHandler(async (req, res) => sendSuccess(res, 200, await tax.listTaxCodes(req.tenantId, req.query))));
r.post("/tax/codes", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { taxCode: await tax.createTaxCode(req.tenantId, V.taxCodeCreate.parse(req.body), ctx(req).actor) });
}));
r.get("/tax/codes/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await tax.getTaxCode(req.tenantId, req.params.id))));
r.patch("/tax/codes/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.taxCodeUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, await tax.updateTaxCode(req.tenantId, req.params.id, version, patch, ctx(req).actor));
}));
r.delete("/tax/codes/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await tax.archiveTaxCode(req.tenantId, req.params.id, version, ctx(req).actor));
}));

r.get("/pricelists", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.listPricelists(req.tenantId, req.query))));
r.post("/pricelists", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { pricelist: await catalog.createPricelist(req.tenantId, V.pricelistCreate.parse(req.body), ctx(req).actor) });
}));
r.get("/pricelists/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getPricelist(req.tenantId, req.params.id))));
r.patch("/pricelists/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.pricelistUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, { pricelist: await catalog.updatePricelist(req.tenantId, req.params.id, version, patch, ctx(req).actor) });
}));
r.delete("/pricelists/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archivePricelist(req.tenantId, req.params.id, version, ctx(req).actor));
}));
r.get("/pricelists/:id/rates", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await catalog.listRateEntries(req.tenantId, req.params.id, req.query));
}));
r.post("/pricelists/:id/rates", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  const body = V.rateEntryCreate.parse({ ...req.body, pricelistId: req.params.id });
  sendSuccess(res, 201, { rate: await catalog.createRateEntry(req.tenantId, body, ctx(req).actor) });
}));
r.get("/rates/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getRateEntry(req.tenantId, req.params.id))));
r.patch("/rates/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.rateEntryUpdate.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, { rate: await catalog.updateRateEntry(req.tenantId, req.params.id, version, patch, ctx(req).actor) });
}));
r.delete("/rates/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archiveRateEntry(req.tenantId, req.params.id, version, ctx(req).actor));
}));
r.get("/commercial-rules", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await catalog.listCommercialPolicies(req.tenantId, req.query));
}));
r.get("/commercial-rules/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await catalog.getCommercialPolicy(req.tenantId, req.params.id));
}));
r.post("/commercial-rules", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  sendSuccess(res, 201, { policy: await catalog.createCommercialPolicy(req.tenantId, V.commercialPolicyCreate.parse(req.body), ctx(req).actor) });
}));
r.delete("/commercial-rules/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.archiveCommercialPolicy(req.tenantId, req.params.id, version, ctx(req).actor));
}));

// ---- Quotation templates (SPEC-005/010) ----
r.get("/quotation-templates", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await templates.listTemplates(req.tenantId, req.query));
}));
r.post("/quotation-templates", asyncHandler(async (req, res) => {
  sendSuccess(res, 201, await templates.createTemplate(req.tenantId, V.quotationTemplateCreate.parse(req.body), ctx(req).actor));
}));
r.patch("/quotation-templates/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await templates.updateTemplate(req.tenantId, req.params.id, V.quotationTemplatePatch.parse(req.body), ctx(req).actor));
}));

// ---- Admin users / roles (SPEC-010) ----
r.get("/users", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await adminUsers.listAdminUsers(req.tenantId));
}));
r.patch("/users/:userId/roles", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await adminUsers.patchAdminRoles(req.tenantId, req.params.userId, V.adminRolesPatch.parse(req.body), ctx(req).actor)
  );
}));

// ---- Repair work orders (SPEC-007) ----
r.get("/repairs", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await repairs.listRepairs(req.tenantId, req.query));
}));
r.post("/repairs", asyncHandler(async (req, res) => {
  sendSuccess(res, 201, await repairs.createRepair(req.tenantId, V.repairCreate.parse(req.body), ctx(req).actor));
}));
r.patch("/repairs/:id", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await repairs.updateRepair(req.tenantId, req.params.id, V.repairPatch.parse(req.body), ctx(req).actor));
}));

// ---- Assets ----
r.get("/assets", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.listAssets(req.tenantId, req.query))));
r.post("/assets", asyncHandler(async (req, res) => {
  optionalIdempotencyKey(req);
  if (Array.isArray(req.body?.assets)) {
    const body = V.assetBatchCreate.parse(req.body);
    return sendSuccess(res, 201, await catalog.createAssetBatch(req.tenantId, body.assets, ctx(req).actor));
  }
  sendSuccess(res, 201, { asset: await catalog.createAsset(req.tenantId, V.assetCreate.parse(req.body), ctx(req).actor) });
}));
r.get("/assets/:id", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getAsset(req.tenantId, req.params.id))));
r.patch("/assets/:id", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.assetPatch.parse(req.body || {});
  const { version: _v, ...patch } = body;
  void _v;
  sendSuccess(res, 200, await catalog.patchAsset(req.tenantId, req.params.id, version, patch, ctx(req).actor));
}));
r.post("/assets/:id/retire", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  const body = V.assetRetire.parse(req.body || {});
  sendSuccess(res, 200, await catalog.retireAsset(req.tenantId, req.params.id, version, body.reason, ctx(req).actor));
}));

// ---- Inventory / availability ----
r.get("/inventory/stock", asyncHandler(async (req, res) => {
  const q = V.stockQuery.parse(req.query);
  sendSuccess(res, 200, await catalog.getStockRollup(req.tenantId, q));
}));
r.get("/availability", asyncHandler(async (req, res) => {
  const q = V.availabilityQuery.parse(req.query);
  sendSuccess(res, 200, await availability.checkAvailability(req.tenantId, q));
}));

// ---- Rental workflow ----
r.get("/rentals", asyncHandler(async (req, res) => {
  const lim = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);
  const skip = (Math.max(1, Number(req.query.page) || 1) - 1) * lim;
  const filter = { tenantId: req.tenantId };
  if (req.query.status) {
    const statuses = String(req.query.status).split(",").map((s) => s.trim()).filter(Boolean);
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.productId) {
    const pid = req.query.productId;
    filter["lines.productId"] = mongoose.Types.ObjectId.isValid(pid)
      ? new mongoose.Types.ObjectId(pid)
      : pid;
  }
  if (req.query.fulfillmentMethod) filter["fulfillment.method"] = req.query.fulfillmentMethod;
  const sort = req.query.sort === "startAt" ? { startAt: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    RentalOrder.find(filter).sort(sort).skip(skip).limit(lim).lean(),
    RentalOrder.countDocuments(filter),
  ]);
  sendSuccess(res, 200, { items, total, page: Number(req.query.page) || 1, limit: lim });
}));
// Static paths before /rentals/:id
r.get("/rentals/overdue", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await schedules.listOverdue(req.tenantId, { limit: req.query.limit, page: req.query.page }),
  );
}));
r.get("/pickups", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await schedules.listPickups(req.tenantId, { date: req.query.date }));
}));
r.get("/returns", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await schedules.listReturns(req.tenantId, { date: req.query.date }));
}));
r.get("/deliveries", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await delivery.listDeliveriesForDate(req.tenantId, { date: req.query.date }));
}));
r.post("/rentals", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = V.rentalCreate.parse(req.body);
  sendSuccess(res, 201, await rental.createDraft(req.tenantId, input, ctx(req).actor, key));
}));
r.get("/rentals/:id", asyncHandler(async (req, res) => {
  const doc = await RentalOrder.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!doc) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  const [penalty, invoiceList, shipment] = await Promise.all([
    schedules.getPenaltyBreakdown(req.tenantId, req.params.id).catch(() => null),
    invoices.listInvoicesForRental(req.tenantId, req.params.id).catch(() => ({ items: [] })),
    delivery.getOutboundShipment(req.tenantId, req.params.id).catch(() => null),
  ]);
  const invItems = invoiceList?.items || [];
  const latestInv = invItems[0] || null;
  sendSuccess(res, 200, {
    rental: doc,
    ops: {
      penalty,
      invoices: invItems,
      shipment,
      emailDelivery: latestInv?.emailDelivery || { status: "not_sent" },
    },
  });
}));

r.post("/rentals/:id/invoices/resend", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  sendSuccess(res, 200, await rental.resendRentalInvoiceEmail(req.tenantId, req.params.id));
}));
r.post("/rentals/:id/price", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await rental.priceRental(req.tenantId, req.params.id));
}));
r.post("/rentals/:id/reserve", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  const version = requireVersion(req);
  const body = V.reserveBody.parse(req.body || {});
  const out = await availability.reserveRental(req.tenantId, {
    rentalId: req.params.id, expectedVersion: version, selectedAssetIds: body.selectedAssetIds || [], actor: ctx(req).actor,
  });
  sendSuccess(res, 200, { rental: out });
}));
r.post("/rentals/:id/confirm", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const version = requireVersion(req);
  const body = V.confirmBody.parse(req.body || {});
  sendSuccess(res, 200, await rental.confirmRental(req.tenantId, { rentalId: req.params.id, expectedVersion: version, ...body }, ctx(req).actor, key));
}));
r.post("/rentals/:id/issue", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  requireVersion(req);
  sendSuccess(res, 200, { rental: await rental.issueRental(req.tenantId, { rentalId: req.params.id }, ctx(req).actor) });
}));
/** Schedule mock delivery (4–5 day promise). No Borzo. */
r.post("/rentals/:id/dispatch", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  sendSuccess(
    res,
    200,
    await delivery.dispatchDelivery(req.tenantId, { rentalId: req.params.id }, ctx(req).actor, key),
  );
}));
/** Admin confirms customer received delivery → dispatched. */
r.post("/rentals/:id/confirm-delivery", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  sendSuccess(
    res,
    200,
    await delivery.confirmDelivery(req.tenantId, { rentalId: req.params.id }, ctx(req).actor, key),
  );
}));
/** Alias for older clients */
r.post("/rentals/:id/confirm-dispatch", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  sendSuccess(
    res,
    200,
    await delivery.confirmDelivery(req.tenantId, { rentalId: req.params.id }, ctx(req).actor, key),
  );
}));
r.post("/rentals/:id/return", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  const body = V.returnBody.parse(req.body || {});
  sendSuccess(res, 200, { rental: await rental.returnRental(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor) });
}));
r.post(
  "/rentals/:id/inspection/photos",
  uploadInspectionPhotos,
  asyncHandler(async (req, res) => {
    const rentalId = req.params.id;
    const exists = await RentalOrder.exists({ _id: rentalId, tenantId: req.tenantId });
    if (!exists) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    const entries = await Promise.all(
      ["front", "side", "back"].map(async (angle) => {
        const f = req.inspectionPhotoFiles[angle];
        const up = await uploadInspectionImageBuffer(req.tenantId, rentalId, f.buffer, {
          filename: `${angle}-${f.originalname}`,
          mime: f.mimetype || "image/jpeg",
        });
        return [angle, up.url];
      })
    );
    sendSuccess(res, 201, { photos: Object.fromEntries(entries) });
  })
);
/** Upload one inspection angle on select (avoids 3× Cloudinary in one request / timeouts). */
r.post(
  "/rentals/:id/inspection/photos/:angle",
  uploadInspectionPhotoOne,
  asyncHandler(async (req, res) => {
    const rentalId = req.params.id;
    const angle = req.inspectionPhotoAngle;
    const exists = await RentalOrder.exists({ _id: rentalId, tenantId: req.tenantId });
    if (!exists) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
    const f = req.inspectionPhotoFile;
    const up = await uploadInspectionImageBuffer(req.tenantId, rentalId, f.buffer, {
      filename: `${angle}-${f.originalname}`,
      mime: f.mimetype || "image/jpeg",
    });
    sendSuccess(res, 201, { angle, url: up.url, photos: { [angle]: up.url } });
  })
);
r.post("/rentals/:id/inspection", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  const body = V.inspectBody.parse(req.body || {});
  sendSuccess(res, 200, { rental: await rental.inspectRental(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor) });
}));
r.get("/rentals/:id/penalty", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await schedules.getPenaltyBreakdown(req.tenantId, req.params.id));
}));
r.get("/rentals/:id/invoices", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await invoices.listInvoicesForRental(req.tenantId, req.params.id));
}));
r.get("/invoices/:invoiceId", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await invoices.getInvoice(req.tenantId, req.params.invoiceId));
}));
r.get("/invoices/:invoiceId/download", asyncHandler(async (req, res) => {
  const { pdf, filename } = await invoices.renderInvoicePdf(req.tenantId, req.params.invoiceId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(pdf);
}));
r.post("/rentals/:id/close", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  sendSuccess(res, 200, { rental: await rental.closeRental(req.tenantId, { rentalId: req.params.id }, ctx(req).actor) });
}));
/** Generate/refresh the master (settlement) invoice and add it to history. */
r.post("/rentals/:id/invoice/generate", asyncHandler(async (req, res) => {
  sendSuccess(res, 201, await rental.generateMasterInvoice(req.tenantId, { rentalId: req.params.id }, ctx(req).actor));
}));
/** Clear: settle outstanding payable (deposit credit + cash) and close. */
r.post("/rentals/:id/clear", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  sendSuccess(res, 200, { rental: await rental.clearRental(req.tenantId, { rentalId: req.params.id }, ctx(req).actor) });
}));
r.post("/rentals/:id/cancel", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  const body = V.cancelBody.parse(req.body || {});
  sendSuccess(res, 200, { rental: await rental.cancelRental(req.tenantId, { rentalId: req.params.id, reason: body.reason }, ctx(req).actor) });
}));

// ---- Payments + deposit ----
r.post("/rentals/:id/payments/manual", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const body = V.manualPaymentBody.parse(req.body);
  sendSuccess(res, 201, await finance.recordManualPayment(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor, key));
}));
r.post("/rentals/:id/payments/razorpay-order", asyncHandler(async (req, res) => {
  requireIdempotencyKey(req);
  const body = V.razorpayOrderBody.parse(req.body);
  sendSuccess(res, 200, await finance.createRazorpayOrder(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor));
}));
r.post("/rentals/:id/deposit/apply", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const body = V.depositApplyBody.parse(req.body);
  sendSuccess(res, 200, await finance.depositApply(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor, key));
}));
r.post("/rentals/:id/deposit/forfeit", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const body = V.depositForfeitBody.parse(req.body);
  sendSuccess(res, 200, await finance.depositForfeit(req.tenantId, { rentalId: req.params.id, ...body }, ctx(req).actor, key));
}));

// ---- Read-only ops lists ----
r.get("/payments", asyncHandler(async (req, res) => {
  const filter = await analytics.buildPaymentFilter(req.tenantId, {
    from: req.query.from,
    to: req.query.to,
    customerId: req.query.customerId,
    method: req.query.method,
    status: req.query.status,
    direction: req.query.direction,
    rentalId: req.query.rentalId,
    q: req.query.q,
  });
  // pagedList always sets tenantId; strip so we don't double-apply ObjectId vs string mismatch.
  const { tenantId: _t, ...extra } = filter;
  void _t;
  const out = await pagedList(RentalPayment, req.tenantId, req.query, extra);
  out.items = await enrichPaymentRows(req.tenantId, out.items);
  if (req.query.includePending === "true") {
    out.pendingCheckout = await listPendingCustomerCheckouts(req.tenantId);
  }
  sendSuccess(res, 200, out);
}));
r.get("/payments/export", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await analytics.exportPayments(req.tenantId, {
      from: req.query.from,
      to: req.query.to,
      customerId: req.query.customerId,
      method: req.query.method,
      status: req.query.status,
      direction: req.query.direction,
      rentalId: req.query.rentalId,
      q: req.query.q,
    }),
  );
}));
r.get("/deposit-entries", asyncHandler(async (req, res) => {
  const extra = {};
  if (req.query.rentalId) extra.rentalId = req.query.rentalId;
  const out = await pagedList(RentalDepositEntry, req.tenantId, req.query, extra);
  const meta = await rentalMetaByIds(
    req.tenantId,
    out.items.map((d) => d.rentalId),
  );
  out.items = out.items.map((d) => attachRentalMeta(d, meta.get(String(d.rentalId))));
  sendSuccess(res, 200, out);
}));
r.get("/audit", asyncHandler(async (req, res) => {
  const extra = {};
  if (req.query.resourceType) extra.resourceType = req.query.resourceType;
  if (req.query.resourceId) extra.resourceId = req.query.resourceId;
  sendSuccess(res, 200, await pagedList(RentalAuditEvent, req.tenantId, req.query, extra));
}));
r.get("/notifications", asyncHandler(async (req, res) => {
  const extra = {};
  if (req.query.rentalId) extra.rentalId = req.query.rentalId;
  if (req.query.status) extra.status = req.query.status;
  sendSuccess(res, 200, await pagedList(RentalNotification, req.tenantId, req.query, extra));
}));
r.get("/shipments", asyncHandler(async (req, res) => {
  const extra = {};
  if (req.query.rentalId) extra.rentalId = req.query.rentalId;
  if (req.query.status) extra.status = req.query.status;
  sendSuccess(res, 200, await pagedList(RentalShipment, req.tenantId, req.query, extra));
}));

// ---- Settings ----
r.get("/settings", asyncHandler(async (req, res) => sendSuccess(res, 200, await catalog.getSettings(req.tenantId))));
r.patch("/settings", asyncHandler(async (req, res) => {
  const version = requireVersion(req);
  sendSuccess(res, 200, await catalog.patchSettings(req.tenantId, version, req.body, ctx(req).actor));
}));

// ---- Dashboard + reports ----
r.get("/dashboard", asyncHandler(async (req, res) => sendSuccess(res, 200, await reporting.dashboard(req.tenantId))));
r.get("/dashboard/overdue", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await schedules.listOverdue(req.tenantId, { limit: req.query.limit, page: req.query.page }),
  );
}));
r.get("/reports/financial", asyncHandler(async (req, res) => sendSuccess(res, 200, await reporting.financialReport(req.tenantId))));
r.get("/reports/ar-aging", asyncHandler(async (req, res) => sendSuccess(res, 200, await analytics.arAging(req.tenantId))));
r.get("/analytics/sales", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await analytics.salesTrends(req.tenantId, req.query));
}));
r.get("/analytics/revenue", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await analytics.revenueBreakdown(req.tenantId, req.query));
}));
r.get("/analytics/payments", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await analytics.paymentAnalytics(req.tenantId, {
      from: req.query.from,
      to: req.query.to,
      customerId: req.query.customerId,
      groupBy: req.query.groupBy,
    }),
  );
}));
r.post("/jobs/overdue-sweep", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await overdueSweep.sweepOverdueForTenant(req.tenantId));
}));

// ---- Risk incidents (SPEC-016) ----
r.get("/incidents", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await risk.listIncidents(req.tenantId, req.query));
}));
r.post("/incidents", asyncHandler(async (req, res) => {
  sendSuccess(res, 201, await risk.createIncident(req.tenantId, V.incidentCreate.parse(req.body), ctx(req).actor));
}));
r.post("/incidents/:id/resolve", asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    200,
    await risk.resolveIncident(req.tenantId, req.params.id, V.incidentResolve.parse(req.body || {}), ctx(req).actor)
  );
}));

// ---- Bonus (SPEC-011 Could, isolatable) ----
r.get("/bonus/reminders", asyncHandler(async (req, res) => sendSuccess(res, 200, await bonus.reminderWorklist(req.tenantId))));
r.get("/bonus/forecast", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await bonus.availabilityForecast(req.tenantId, req.query));
}));
r.get("/bonus/scan", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await bonus.scanAsset(req.tenantId, { code: req.query.code }));
}));
r.get("/bonus/routes/pickups", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await bonus.optimizedPickups(req.tenantId, { date: req.query.date }));
}));
r.get("/bonus/maintenance", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await bonus.maintenanceSuggestions(req.tenantId, req.query));
}));
r.post("/bonus/iot/ping", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await bonus.iotAssetPing(req.tenantId, req.body || {}));
}));
r.get("/bonus/widgets", asyncHandler(async (req, res) => sendSuccess(res, 200, await bonus.dashboardWidgets(req.tenantId))));
r.get("/bonus/analytics", asyncHandler(async (req, res) => sendSuccess(res, 200, await bonus.analytics(req.tenantId))));
r.get("/bonus/mobile", asyncHandler(async (req, res) => sendSuccess(res, 200, bonus.mobileCapabilities())));

export default r;
