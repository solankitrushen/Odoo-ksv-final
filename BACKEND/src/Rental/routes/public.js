import { Router } from "express";
import { asyncHandler } from "../../Utils/asyncHandler.js";
import { sendSuccess } from "../../Utils/errorResponse.js";
import * as V from "../validators.js";
import * as customerAuth from "../services/customerAuthService.js";
import * as availability from "../services/availability.js";
import { rentalAuthRateLimiter, rentalAuthSendRateLimiter } from "../middleware/authRateLimit.js";
import { RentalProduct, RentalCategory } from "../schema/index.js";
import * as publicCatalog from "../services/publicCatalogService.js";

// Public router is mounted at /public/:tenantSlug so req.tenantId is resolved.
const r = Router({ mergeParams: true });

// ---- Customer auth (SPEC-RMS-AUTH-001) ----
r.post("/auth/register", rentalAuthRateLimiter, asyncHandler(async (req, res) => {
  const input = V.customerRegister.parse(req.body);
  sendSuccess(res, 201, await customerAuth.registerCustomer(req.tenantId, input));
}));
r.post("/auth/verify-email", rentalAuthRateLimiter, asyncHandler(async (req, res) => {
  const input = V.emailVerify.parse(req.body);
  sendSuccess(res, 200, await customerAuth.verifyCustomerEmail(req.tenantId, input));
}));
r.post("/auth/resend-verification", rentalAuthSendRateLimiter, asyncHandler(async (req, res) => {
  const input = V.emailResend.parse(req.body);
  sendSuccess(res, 200, await customerAuth.resendCustomerVerification(req.tenantId, input));
}));
r.post("/auth/login", rentalAuthRateLimiter, asyncHandler(async (req, res) => {
  const input = V.customerLogin.parse(req.body);
  sendSuccess(res, 200, await customerAuth.loginCustomer(req.tenantId, input));
}));
r.post("/auth/otp/request", rentalAuthSendRateLimiter, asyncHandler(async (req, res) => {
  const input = V.otpRequest.parse(req.body);
  sendSuccess(res, 200, await customerAuth.requestCustomerOtp(req.tenantId, input));
}));
r.post("/auth/otp/verify", rentalAuthRateLimiter, asyncHandler(async (req, res) => {
  const input = V.otpVerify.parse(req.body);
  sendSuccess(res, 200, await customerAuth.verifyCustomerOtp(req.tenantId, input));
}));

// ---- Public catalog (read-only, active items only) ----
r.get("/categories", asyncHandler(async (req, res) => {
  const items = await RentalCategory.find({ tenantId: req.tenantId, status: "active" })
    .sort({ sortOrder: 1, name: 1 })
    .select("code name parentCategoryId sortOrder")
    .lean();
  sendSuccess(res, 200, { items });
}));

r.get("/catalog", asyncHandler(async (req, res) => {
  const lim = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);
  const filter = { tenantId: req.tenantId, status: "active" };
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  const q = String(req.query.q || "").trim();
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: re }, { productSku: re }, { brand: re }, { description: re }];
  }
  const products = await RentalProduct.find(filter)
    .sort({ name: 1 })
    .limit(lim)
    .select("name productSku categoryId description brand images")
    .lean();
  sendSuccess(res, 200, { items: products, tenantSlug: req.tenantSlug, q: q || undefined });
}));

r.get("/catalog/:productId", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await publicCatalog.getPublicProductDetail(req.tenantId, req.params.productId));
}));

r.get("/catalog/:productId/variants", asyncHandler(async (req, res) => {
  sendSuccess(res, 200, await publicCatalog.listPublicVariantsWithRates(req.tenantId, req.params.productId));
}));

// ---- Public availability (read-only) ----
r.get("/availability", asyncHandler(async (req, res) => {
  const q = V.availabilityQuery.parse(req.query);
  const out = await availability.checkAvailability(req.tenantId, q);
  // Public callers get count + sufficiency only, not internal asset IDs.
  sendSuccess(res, 200, { availableCount: out.availableCount, requested: out.requested, sufficient: out.sufficient });
}));

export default r;
