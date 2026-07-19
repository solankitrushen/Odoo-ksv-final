import { createRequire } from "module";
import { logger } from "./logger.js";

const require = createRequire(import.meta.url);
const disposableDomains = require("disposable-email-domains");

const domainSet = new Set(
  disposableDomains.map((d) => String(d).toLowerCase())
);

/** Extra domains from env: DISPOSABLE_EMAIL_EXTRA=foo.com,bar.com */
function loadExtraDomains() {
  const raw = process.env.DISPOSABLE_EMAIL_EXTRA || "";
  for (const d of raw.split(",")) {
    const norm = d.trim().toLowerCase();
    if (norm) domainSet.add(norm);
  }
}

loadExtraDomains();

export function getEmailDomain(email) {
  if (!email || typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

export function isDisposableEmail(email) {
  if (process.env.DISABLE_DISPOSABLE_EMAIL_CHECK === "true") {
    return false;
  }
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return domainSet.has(domain);
}

/**
 * @returns {object|null} Express response if blocked; null = allow
 */
export function blockDisposableEmail(res, email, context = "register") {
  if (!email || !isDisposableEmail(email)) return null;

  logger.warn("Disposable email blocked", {
    context,
    domain: getEmailDomain(email),
  });

  return res.status(400).json({
    success: false,
    error: "Invalid email",
    message: "Disposable or temporary email addresses are not allowed",
    details: [{ field: "email", message: "Use a permanent email provider" }],
  });
}
