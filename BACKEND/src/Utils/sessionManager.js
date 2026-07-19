import crypto from "crypto";
import {
  generateTokens,
  setAuthCookies,
  getAuthScope,
} from "../Auth/jwtUtils.js";

export function createSessionId() {
  return crypto.randomUUID();
}

export function pushSession(user, req, sessionId) {
  user.sessions = user.sessions || [];
  user.sessions.push({
    tokenId: sessionId,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    deviceName: req.headers["x-device-name"] || "Unknown",
  });
  if (user.sessions.length > 20) {
    user.sessions = user.sessions.slice(-20);
  }
}

export async function issueUserAuth(res, user, req, statusCode = 200) {
  const sessionId = createSessionId();
  const tokens = generateTokens(user._id, user.role, user.email, sessionId);
  pushSession(user, req, sessionId);
  await user.save();
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken, sessionId, getAuthScope(req));

  return res.status(statusCode).json({
    success: true,
    data: {
      message: "Authenticated",
      user: user.toJSON(),
      tokens,
      sessionId,
    },
  });
}

export function revokeSession(user, sessionId) {
  const s = user.sessions?.find((x) => x.tokenId === sessionId && !x.revokedAt);
  if (s) s.revokedAt = new Date();
}

export function revokeAllSessions(user) {
  for (const s of user.sessions || []) {
    if (!s.revokedAt) s.revokedAt = new Date();
  }
}

export function isSessionActive(user, sessionId) {
  if (!sessionId) return false;
  return user.sessions?.some(
    (s) => s.tokenId === sessionId && !s.revokedAt
  );
}

export { isSessionActive as checkSessionActive };
