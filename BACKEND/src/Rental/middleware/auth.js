// Rental auth middleware for the three realms: admin (reuse VB membership),
// customer (distinct JWT realm), and public tenant-slug resolution.
import { authMiddleware } from "../../Middleware/authMiddleware.js";
import { verifyToken, readAuthToken } from "../../Auth/jwtUtils.js";
import { sendError } from "../../Utils/errorResponse.js";
import Tenant from "../../Schema/Tenant.js";
import { RentalCustomerAuth } from "../schema/index.js";
import { RENTAL_REALM, RENTAL_CUSTOMER_ROLE, VB_ADMIN } from "./constants-bridge.js";
import { isModuleEnabled } from "../config.js";
import { TENANT_STATUS } from "../../../config/constants.js";
import { writeAudit } from "../services/infra.js";

/** Gate the whole rental module by flag (customer/public/admin all require it). */
export function requireModuleEnabled(req, res, next) {
  if (!isModuleEnabled()) {
    return sendError(res, 404, "RESOURCE_NOT_FOUND", "Not found");
  }
  next();
}

/** Active tenant admin only. authMiddleware already resolves VB membership. */
export function requireActiveAdmin(req, res, next) {
  if (req.user?.realm === RENTAL_REALM.CUSTOMER) {
    return sendError(res, 401, "UNAUTHORIZED", "Not an admin token");
  }
  const roles = Array.isArray(req.roles) ? req.roles : [];
  if (!req.tenantId || !roles.includes(VB_ADMIN)) {
    if (req.userId && req.tenantId) {
      writeAudit({
        tenantId: req.tenantId,
        actorType: "admin",
        actorId: String(req.userId),
        action: "admin.rental_forbidden",
        resourceType: "RentalAdmin",
        resourceId: String(req.userId),
        reason: `roles=${roles.join(",") || "none"}`,
      }).catch(() => {});
    }
    return sendError(res, 403, "FORBIDDEN", "Active admin membership required");
  }
  req.rentalActor = { type: "admin", id: String(req.userId), tenantId: String(req.tenantId) };
  next();
}

export const adminChain = [requireModuleEnabled, authMiddleware, requireActiveAdmin];

/** Customer realm: distinct JWT carrying tenantId + customerId. */
export function customerAuth(req, res, next) {
  (async () => {
    try {
      const token = readAuthToken(req);
      if (!token) return sendError(res, 401, "UNAUTHORIZED", "No token provided");
      const decoded = verifyToken(token);
      if (decoded.realm !== RENTAL_REALM.CUSTOMER || decoded.role !== RENTAL_CUSTOMER_ROLE) {
        return sendError(res, 401, "UNAUTHORIZED", "Not a customer token");
      }
      const auth = await RentalCustomerAuth.findById(decoded.userId).select("+password");
      if (!auth || !auth.isActive) {
        return sendError(res, 401, "UNAUTHORIZED", "Account inactive");
      }
      const tokenCv = Number.isFinite(decoded.cv) ? decoded.cv : 0;
      if (tokenCv !== (auth.credentialsVersion || 0)) {
        return sendError(res, 401, "UNAUTHORIZED", "Credentials changed; please log in again");
      }
      req.tenantId = String(auth.tenantId);
      req.customerId = String(auth.customerId);
      req.customerAuthId = String(auth._id);
      req.rentalActor = { type: "customer", id: String(auth.customerId), tenantId: String(auth.tenantId) };
      next();
    } catch (err) {
      if (err?.name === "TokenExpiredError") return sendError(res, 401, "UNAUTHORIZED", "Token expired");
      return sendError(res, 401, "UNAUTHORIZED", "Authentication failed");
    }
  })();
}

export const customerChain = [requireModuleEnabled, customerAuth];

/** Public tenant resolution by slug. No principal; read-only catalog/quote intake. */
export function publicTenant(req, res, next) {
  (async () => {
    try {
      const slug = String(req.params.tenantSlug || "").toLowerCase();
      if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Not found");
      }
      const tenant = await Tenant.findOne({ slug, status: TENANT_STATUS.ACTIVE }).lean();
      if (!tenant) return sendError(res, 404, "RESOURCE_NOT_FOUND", "Not found");
      req.tenantId = String(tenant._id);
      req.tenantSlug = slug;
      req.rentalActor = { type: "public", id: null, tenantId: String(tenant._id) };
      next();
    } catch {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Not found");
    }
  })();
}

export const publicChain = [requireModuleEnabled, publicTenant];
