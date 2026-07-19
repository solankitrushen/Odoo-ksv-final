// Rental-facing mail helpers (auth + settlement alerts + invoices).
import { logger } from "../../Utils/logger.js";
export {
  isSmtpConfigured,
  sendAuthCodeEmail as sendRentalAuthEmail,
  sendSmtpMail,
  resetSmtpTransporter as resetRentalMailTransporter,
} from "../../Utils/smtpMail.js";
import { sendSmtpMail } from "../../Utils/smtpMail.js";

const rupees = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

/**
 * Email invoice PDF to the portal customer (purchase / final with penalties).
 * Best-effort: never throws to callers.
 */
export async function sendInvoiceEmail({
  customerEmail,
  rentalNumber,
  invoiceNumber,
  invoiceType = "tax_invoice",
  totals = {},
  overdueLabel = null,
  pdfBuffer = null,
  filename = null,
}) {
  if (!customerEmail) return { sent: false, skipped: true, reason: "no_email" };
  const isFinal = invoiceType === "final";
  const subject = isFinal
    ? `Final invoice ${invoiceNumber} for rental ${rentalNumber}`
    : `Invoice ${invoiceNumber} for rental ${rentalNumber}`;
  const late =
    Number(totals.lateFeePaise || 0) + Number(totals.lateGstPaise || 0);
  const damage =
    Number(totals.damagePreTaxPaise || 0) + Number(totals.damageGstPaise || 0);
  const gross = Number(totals.chargeGrossPaise || totals.grossPaise || 0);
  const due = Number(
    totals.balanceDuePaise != null
      ? totals.balanceDuePaise
      : totals.dueBillPaise != null
        ? totals.dueBillPaise
        : 0
  );
  const text =
    `Hi,\n\n` +
    `Your ${isFinal ? "final " : ""}invoice for rental ${rentalNumber} is ready.\n\n` +
    `Invoice: ${invoiceNumber}\n` +
    (gross ? `Amount: ${rupees(gross)}\n` : "") +
    (overdueLabel ? `Overdue time: ${overdueLabel}\n` : "") +
    (late ? `Late fee / penalty: ${rupees(late)}\n` : "") +
    (damage ? `Damage charges: ${rupees(damage)}\n` : "") +
    (due > 0 ? `Due bill: ${rupees(due)}\n` : "") +
    `\nOpen your account → My rentals for the full breakdown. PDF attached when available.\n` +
    `Thank you for renting with us.\n`;

  const attachments =
    pdfBuffer && Buffer.isBuffer(pdfBuffer)
      ? [{ filename: filename || `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
      : undefined;

  try {
    const out = await sendSmtpMail({ to: customerEmail, subject, text, attachments });
    return out;
  } catch (err) {
    logger.warn("Invoice email failed", { rentalNumber, invoiceNumber, error: err.message });
    return { sent: false, error: err.message };
  }
}

/**
 * Notify customer + admin when deposit cannot cover late/damage penalties.
 * Best-effort: failures are logged, never fail the close transaction.
 */
export async function sendSettlementShortfallAlert({
  customerEmail,
  adminEmail,
  rentalNumber,
  shortfallPaise,
  lateFeePaise = 0,
  damagePaise = 0,
  depositCollectedPaise = 0,
}) {
  const subject = `Rental ${rentalNumber}: outstanding balance ${rupees(shortfallPaise)}`;
  const text =
    `Rental ${rentalNumber} closed with outstanding balance after deposit settlement.\n\n` +
    `Late fee: ${rupees(lateFeePaise)}\n` +
    `Damage: ${rupees(damagePaise)}\n` +
    `Deposit collected: ${rupees(depositCollectedPaise)}\n` +
    `Outstanding (please collect / pay): ${rupees(shortfallPaise)}\n\n` +
    `Admin: collect remaining payment and arrange product return follow-up if needed.\n` +
    `Customer: please settle the outstanding amount and return the product if not already returned.\n`;

  const results = { customer: null, admin: null };
  try {
    if (customerEmail) {
      results.customer = await sendSmtpMail({ to: customerEmail, subject, text });
    }
  } catch (err) {
    logger.warn("Settlement shortfall customer mail failed", { rentalNumber, error: err.message });
  }
  try {
    if (adminEmail) {
      results.admin = await sendSmtpMail({ to: adminEmail, subject: `[Admin] ${subject}`, text });
    }
  } catch (err) {
    logger.warn("Settlement shortfall admin mail failed", { rentalNumber, error: err.message });
  }
  return results;
}
