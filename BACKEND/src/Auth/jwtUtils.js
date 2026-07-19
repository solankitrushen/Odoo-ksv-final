import jwt from "jsonwebtoken";
import { getJwtConfig } from "../../config/jwt.js";
import { logger } from "../Utils/logger.js";
import { signAuthFlag, authFlagTtlSec } from "./authFlag.js";

export function generateTokens(
  userId,
  role,
  email = null,
  sessionId = null,
  credentialsVersion = 0,
  extra = {}
) {
  const cfg = getJwtConfig();
  const cv = Number.isFinite(credentialsVersion) ? credentialsVersion : 0;
  const payload = {
    userId: String(userId),
    role,
    cv,
    ...(email ? { email } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...extra,
  };

  const accessToken = jwt.sign(payload, cfg.secret, {
    expiresIn: cfg.accessExpire,
    algorithm: cfg.algorithm,
  });

  const refreshToken = jwt.sign(
    { userId: String(userId), role, cv, ...extra },
    cfg.secret,
    { expiresIn: cfg.refreshExpire, algorithm: cfg.algorithm }
  );

  return { accessToken, refreshToken };
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtConfig().secret);
}

const AUTH_SCOPES = new Set(["user", "store", "admin"]);

// Per-app scope lets multiple role dashboards coexist in one browser without
// clobbering each other's cookies (all SPAs talk to the same API host, so a
// single shared cookie name would collide). Clients send X-Auth-Scope; when
// absent we fall back to the legacy unscoped names (keeps tests/curl working).
export function getAuthScope(req) {
  const s = req?.headers?.["x-auth-scope"];
  return AUTH_SCOPES.has(s) ? s : null;
}

function cookieNames(scope) {
  const sfx = scope ? `_${scope}` : "";
  return { auth: `authToken${sfx}`, refresh: `refreshToken${sfx}`, session: `sessionId${sfx}` };
}

function cookieBaseOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = process.env.COOKIE_SAMESITE || "lax";
  const opts = {
    httpOnly: true,
    sameSite,
    // SameSite=None is only valid alongside Secure.
    secure: isProd || sameSite === "none",
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

function bearerToken(req) {
  const h = req?.headers?.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export function readAuthToken(req) {
  const { auth } = cookieNames(getAuthScope(req));
  return req.cookies?.[auth] || req.cookies?.authToken || bearerToken(req);
}

export function readRefreshToken(req) {
  const { refresh } = cookieNames(getAuthScope(req));
  return req.cookies?.[refresh] || req.cookies?.refreshToken || bearerToken(req);
}

export function readSessionId(req) {
  const { session } = cookieNames(getAuthScope(req));
  return req.cookies?.[session] || req.cookies?.sessionId || null;
}

export function setAuthCookies(res, accessToken, refreshToken, sessionId = null, scope = null) {
  const base = cookieBaseOptions();
  const names = cookieNames(scope);
  res.cookie(names.auth, accessToken, { ...base, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.cookie(names.refresh, refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
  if (sessionId) res.cookie(names.session, sessionId, { ...base });
}

export function clearAuthCookies(res, scope = null) {
  const base = cookieBaseOptions();
  const names = cookieNames(scope);
  // Clear both scoped and legacy names so a logout can never leave a stray
  // session cookie behind.
  for (const n of [names.auth, names.refresh, names.session, "authToken", "refreshToken", "sessionId"]) {
    res.clearCookie(n, base);
  }
}

export function attachTokensResponse(res, user, tokens, statusCode = 200, scope = null) {
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken, null, scope);
  logger.info("Auth success", { role: user.role, userId: user._id });
  const authFlag = signAuthFlag({
    sub: user._id,
    role: user.role,
    scope,
  });
  return res.status(statusCode).json({
    success: true,
    data: {
      message: "Authenticated",
      user: user.toJSON ? user.toJSON() : user,
      tokens,
      authFlag,
      authFlagMaxAgeSec: authFlagTtlSec(),
    },
  });
}
