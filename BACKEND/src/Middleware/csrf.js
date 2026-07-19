import crypto from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const COOKIE_NAME = "csrfToken";
const HEADER_NAME = "x-csrf-token";

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Issue a CSRF cookie on safe requests so SPAs can read it. Verify on
 * state-changing requests via double-submit (cookie value === header
 * value). Skipped entirely when:
 *   - Authorization: Bearer is used (header-auth is CSRF-safe)
 *   - process.env.CSRF_DISABLED === "true" (test bypass)
 */
export function csrfProtection(req, res, next) {
  // CSRF protection is opt-in via CSRF_ENABLED=true (auto-on in prod via
  // env validator). Off in dev/test by default so existing supertest
  // helpers and curl-based dev workflows keep working without a manual
  // GET-then-POST handshake.
  const enabled =
    process.env.CSRF_ENABLED === "true" ||
    process.env.NODE_ENV === "production";
  if (!enabled) return next();
  if (process.env.CSRF_DISABLED === "true") return next();

  const isBearer = req.headers.authorization?.startsWith("Bearer ");

  // Set or refresh the cookie on safe GETs so the SPA can read it.
  if (SAFE_METHODS.has(req.method)) {
    if (!req.cookies?.[COOKIE_NAME]) {
      const isProd = process.env.NODE_ENV === "production";
      res.cookie(COOKIE_NAME, newToken(), {
        httpOnly: false, // readable by JS so the SPA can echo it
        sameSite: isProd ? "strict" : "lax",
        secure: isProd,
      });
    }
    return next();
  }

  if (isBearer) return next();

  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.get(HEADER_NAME);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res
      .status(403)
      .json({ success: false, error: "CSRF token mismatch" });
  }
  next();
}

export default csrfProtection;
