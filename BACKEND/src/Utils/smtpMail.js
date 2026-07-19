/**
 * Canonical Hostinger SMTP helper for the whole backend.
 * All auth codes (register / verify / login OTP / password-reset) go through here.
 * Other product emails may use sendSmtpMail with the same transporter.
 */
import nodemailer from "nodemailer";
import { logger } from "./logger.js";

let transporter;

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export function getSmtpTransporter() {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Bound how long a send can hang — a stalled connection must never wedge a
    // request or leave a background delivery promise pending indefinitely.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

/** Reset cached transporter (tests). */
export function resetSmtpTransporter() {
  transporter = undefined;
}

function fromHeader() {
  const name = process.env.SMTP_FROM_NAME || "App";
  const addr = process.env.SENDER_EMAIL || process.env.SMTP_USER;
  return `"${name}" <${addr}>`;
}

const AUTH_SUBJECTS = Object.freeze({
  "email-verify": "Verify your email",
  verification: "Verify your email",
  "login-otp": "Your login code",
  login: "Your login code",
  "rental-login": "Your login code",
  "password-reset": "Password reset code",
});

/** TTL copy must match customerAuthService VERIFY_TTL / OTP_TTL. */
const AUTH_BODY = Object.freeze({
  "email-verify": {
    label: "email verification code",
    expires: "10 minutes",
  },
  verification: {
    label: "email verification code",
    expires: "10 minutes",
  },
  "login-otp": {
    label: "login code",
    expires: "5 minutes",
  },
  login: {
    label: "login code",
    expires: "5 minutes",
  },
  "rental-login": {
    label: "login code",
    expires: "5 minutes",
  },
  "password-reset": {
    label: "password reset code",
    expires: "10 minutes",
  },
});

/**
 * Send a one-time auth code via Hostinger SMTP.
 * The `code` argument is what the caller stored for verify — never regenerate here.
 * @param {{ to: string, code: string, name?: string, purpose?: string }} opts
 * @returns {Promise<{ sent: boolean, skipped?: boolean, test?: boolean }>}
 */
export async function sendAuthCodeEmail({
  to,
  code,
  name = "User",
  purpose = "email-verify",
}) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    const err = new Error("Auth code missing or invalid — refusing to send email");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const subjectKey = AUTH_SUBJECTS[purpose] ? purpose : "email-verify";
  const subject = AUTH_SUBJECTS[subjectKey];
  const body = AUTH_BODY[subjectKey] || AUTH_BODY["email-verify"];
  const text =
    `Hi ${name},\n\n` +
    `Your ${body.label} is: ${digits}\n\n` +
    `This is the latest code. Older codes no longer work.\n` +
    `Expires in ${body.expires}.\n` +
    `If you did not request this, ignore this email.\n`;

  logger.info("Auth code email attempt", { to, purpose: subjectKey, codeLen: digits.length });

  if (process.env.NODE_ENV === "test") {
    logger.info("Auth code email skipped (test)", { to, purpose: subjectKey });
    return { sent: true, test: true, skipped: true };
  }

  const transport = getSmtpTransporter();
  if (!transport) {
    const err = new Error("Email delivery is not configured (SMTP_HOST / SMTP_USER)");
    err.code = "PROVIDER_NOT_CONFIGURED";
    throw err;
  }

  try {
    const info = await transport.sendMail({
      from: fromHeader(),
      to,
      subject,
      text,
    });
    logger.info("Auth code email sent", { to, purpose: subjectKey, messageId: info.messageId });
    return { sent: true };
  } catch (err) {
    logger.error("Auth code email FAILED", {
      to,
      purpose: subjectKey,
      error: err.message,
      code: err.code,
    });
    throw err;
  }
}

/**
 * Generic SMTP send (notifications, invites, templates). Same Hostinger transport.
 * @returns {Promise<{ sent: boolean, skipped?: boolean }>}
 */
export async function sendSmtpMail({ to, subject, text, html, attachments }) {
  if (process.env.NODE_ENV === "test") {
    logger.info("SMTP mail skipped (test)", { to, subject });
    return { sent: true, skipped: true };
  }

  const transport = getSmtpTransporter();
  if (!transport) {
    logger.warn("SMTP not configured — mail skipped", { to, subject });
    return { sent: false, skipped: true };
  }

  try {
    await transport.sendMail({
      from: fromHeader(),
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      attachments: attachments || undefined,
    });
    return { sent: true };
  } catch (err) {
    logger.error("SMTP mail FAILED", { to, subject, error: err.message });
    throw err;
  }
}
