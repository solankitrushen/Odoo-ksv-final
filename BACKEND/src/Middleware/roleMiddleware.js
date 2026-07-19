import { sendError } from "../Utils/errorResponse.js";
import { logger } from "../Utils/logger.js";

export function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, "Unauthorized", "Not authenticated");
    }
    const held =
      Array.isArray(req.roles) && req.roles.length
        ? req.roles
        : req.role
        ? [req.role]
        : [];
    if (!held.some((r) => allowedRoles.includes(r))) {
      logger.warn("Forbidden role access", {
        roles: held,
        path: req.path,
        allowed: allowedRoles,
      });
      return sendError(
        res,
        403,
        "Forbidden",
        `Requires role: ${allowedRoles.join(", ")}`
      );
    }
    next();
  };
}

export default roleMiddleware;
