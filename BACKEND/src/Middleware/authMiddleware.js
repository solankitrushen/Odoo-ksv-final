import VbUser from "../Schema/VbUser.js";
import VbMembership from "../Schema/VbMembership.js";
import { verifyToken, readAuthToken, readSessionId } from "../Auth/jwtUtils.js";
import { sendError } from "../Utils/errorResponse.js";
import { logger } from "../Utils/logger.js";
import { isSessionActive } from "../Utils/sessionManager.js";

/** Rental admin JWT only (realm vb). Cafe/store/user realms removed. */
export function authMiddleware(req, res, next) {
  (async () => {
    try {
      const token = readAuthToken(req);
      if (!token) {
        return sendError(res, 401, "Unauthorized", "No token provided");
      }

      const decoded = verifyToken(token);
      req.user = decoded;
      req.userId = decoded.userId;
      req.role = decoded.role;

      if (decoded.realm !== "vb") {
        return sendError(res, 401, "Unauthorized", "Not a rental admin token");
      }

      const vbUser = await VbUser.findById(decoded.userId);
      if (!vbUser || !vbUser.isActive) {
        return sendError(res, 401, "Unauthorized", "Account inactive");
      }
      const sessionId = decoded.sessionId || readSessionId(req);
      if (!isSessionActive(vbUser, sessionId)) {
        return sendError(res, 401, "Unauthorized", "Session revoked or invalid");
      }
      const membership = await VbMembership.findOne({
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        status: "active",
      });
      if (!membership) {
        return sendError(res, 401, "Unauthorized", "No active membership for tenant");
      }
      const s = vbUser.sessions?.find((x) => x.tokenId === sessionId);
      if (s) {
        s.lastUsedAt = new Date();
        await vbUser.save();
      }
      req.roles = membership.roles;
      req.tenantId = String(membership.tenantId);
      req.vbUser = vbUser;
      req.membership = membership;
      logger.debug("Rental admin JWT verified", {
        roles: req.roles,
        tenantId: req.tenantId,
        userId: decoded.userId,
      });
      return next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return sendError(res, 401, "Token expired", "Please login again");
      }
      if (error.name === "JsonWebTokenError") {
        logger.warn("Invalid JWT", { message: error.message });
        return sendError(res, 401, "Invalid token", "Authentication failed");
      }
      return sendError(res, 500, "Authentication error", "Internal error");
    }
  })();
}

export default authMiddleware;
