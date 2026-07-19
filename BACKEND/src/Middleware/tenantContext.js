import { sendError } from "../Utils/errorResponse.js";

export function tenantContext(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return sendError(res, 401, "Unauthorized", "No tenant context");
  }
  req.tenantId = tenantId;
  next();
}

export default tenantContext;
