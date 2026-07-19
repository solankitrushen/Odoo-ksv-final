// SPEC-004/005 invoice read + Elite-style PDF download (template header/footer + tax breakdown).
import PDFDocument from "pdfkit";
import Tenant from "../../Schema/Tenant.js";
import { RentalInvoice, RentalOrder, RentalCustomer, RentalSettings } from "../schema/index.js";
import { rentalError } from "../errors.js";
import { getDefaultTemplate } from "./templateService.js";
import { nextSequence, formatNumber } from "./infra.js";
import { buildMasterInvoiceParts } from "./lateFee.js";

/**
 * Create or refresh the single master/settlement invoice (`type: "final"`) for a
 * rental. Deposit is applied as a held credit; final payable = charges − payments
 * − deposit applied. Idempotent: one final doc per rental, updated in place.
 */
export async function writeFinalInvoice(tenantId, rental, { session = null } = {}) {
  const parts = buildMasterInvoiceParts(rental);
  const depositSummary = {
    depositCollectedPaise: rental.depositCollectedPaise ?? 0,
    depositLiabilityPaise: rental.depositLiabilityPaise ?? 0,
    depositAppliedPaise: parts.totals.depositAppliedPaise,
    refundableDepositPaise: parts.totals.depositRefundablePaise,
  };
  const q = RentalInvoice.findOne({ tenantId, rentalId: rental._id, type: "final" });
  const existing = session ? await q.session(session) : await q;
  if (existing) {
    existing.lines = parts.lines;
    existing.totals = parts.totals;
    existing.depositSummary = depositSummary;
    existing.sourceVersion = rental.version;
    await existing.save(session ? { session } : undefined);
    return existing;
  }
  const settings =
    (await RentalSettings.findOne({ tenantId }).lean()) || { numberingPrefix: "RENT" };
  const seq = await nextSequence(tenantId, "invoice", session);
  const created = await RentalInvoice.create(
    [
      {
        tenantId,
        invoiceNumber: formatNumber(settings.numberingPrefix, "invoice", seq),
        rentalId: rental._id,
        customerId: rental.customerId,
        type: "final",
        lines: parts.lines,
        totals: parts.totals,
        depositSummary,
        sourceVersion: rental.version,
      },
    ],
    session ? { session } : undefined
  );
  return created[0];
}

/** Latest open tax invoice for a rental (payments append here — one PDF). */
export async function getActiveTaxInvoice(tenantId, rentalId, session = null) {
  const q = RentalInvoice.findOne({ tenantId, rentalId, type: "tax_invoice" }).sort({ issuedAt: -1 });
  if (session) q.session(session);
  return q;
}

/**
 * Append a payment / deposit ledger row onto the active tax invoice and refresh totals.
 * Does not create a new invoice document.
 */
export async function appendLedgerLineToInvoice(
  tenantId,
  rental,
  line,
  session = null
) {
  const inv = await getActiveTaxInvoice(tenantId, rental._id, session);
  if (!inv) return null;
  const paymentLines = Array.isArray(inv.paymentLines) ? [...inv.paymentLines] : [];
  paymentLines.push({
    ...line,
    at: line.at || new Date().toISOString(),
  });
  inv.paymentLines = paymentLines;
  inv.totals = {
    ...(inv.totals?.toObject?.() || inv.totals || {}),
    chargeGrossPaise: rental.chargeGrossPaise ?? inv.totals?.chargeGrossPaise,
    paymentsPaise: rental.paymentsPaise ?? 0,
    balanceDuePaise: rental.balanceDuePaise ?? 0,
    lateFeePaise: rental.lateFeePaise ?? inv.totals?.lateFeePaise ?? 0,
    lateGstPaise: rental.lateGstPaise ?? inv.totals?.lateGstPaise ?? 0,
  };
  inv.depositSummary = {
    depositCollectedPaise: rental.depositCollectedPaise ?? 0,
    deductionsPaise: rental.deductionsPaise ?? 0,
    forfeitedDepositPaise: rental.forfeitedDepositPaise ?? 0,
    depositLiabilityPaise: rental.depositLiabilityPaise ?? 0,
    refundableDepositPaise: rental.refundableDepositPaise ?? 0,
  };
  inv.sourceVersion = rental.version;
  await inv.save(session ? { session } : undefined);
  return inv;
}

export async function recordInvoiceEmailDelivery(tenantId, invoiceId, result) {
  const inv = await RentalInvoice.findOne({ _id: invoiceId, tenantId });
  if (!inv) return null;
  const now = new Date();
  const status = result?.skipped
    ? "skipped"
    : result?.sent
      ? "sent"
      : "failed";
  inv.emailDelivery = {
    status,
    sentAt: status === "sent" ? now : inv.emailDelivery?.sentAt || null,
    lastAttemptAt: now,
    lastError: result?.error || result?.reason || null,
    to: result?.to || inv.emailDelivery?.to || null,
  };
  await inv.save();
  return inv.toObject();
}

export async function listInvoicesForRental(tenantId, rentalId, { customerId } = {}) {
  const filter = { _id: rentalId, tenantId };
  if (customerId) filter.customerId = customerId;
  const rental = await RentalOrder.findOne(filter).select("_id").lean();
  if (!rental) throw rentalError("RESOURCE_NOT_FOUND", "Rental not found");
  const items = await RentalInvoice.find({ tenantId, rentalId }).sort({ issuedAt: -1 }).lean();
  return { items };
}

export async function getInvoice(tenantId, invoiceId, { customerId } = {}) {
  const inv = await RentalInvoice.findOne({ _id: invoiceId, tenantId }).lean();
  if (!inv) throw rentalError("RESOURCE_NOT_FOUND", "Invoice not found");
  if (customerId) {
    const rental = await RentalOrder.findOne({
      _id: inv.rentalId,
      tenantId,
      customerId,
    })
      .select("_id")
      .lean();
    if (!rental) throw rentalError("FORBIDDEN", "Not your invoice");
  }
  return { invoice: inv };
}

export async function getLatestInvoiceForRental(tenantId, rentalId, { customerId } = {}) {
  const { items } = await listInvoicesForRental(tenantId, rentalId, { customerId });
  if (!items.length) throw rentalError("RESOURCE_NOT_FOUND", "No invoice for rental");
  return { invoice: items[0] };
}

/** PDFKit Helvetica has no ₹ glyph — use INR + en-IN grouping. */
function formatInr(paise) {
  const n = Number(paise || 0) / 100;
  return `INR ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateIn(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function pickBillingAddress(customer, rental) {
  const fromCustomer = Array.isArray(customer?.addresses) ? customer.addresses : [];
  const billing =
    fromCustomer.find((a) => a.type === "billing" && a.isDefault) ||
    fromCustomer.find((a) => a.type === "billing") ||
    fromCustomer.find((a) => a.isDefault) ||
    fromCustomer[0] ||
    null;
  if (billing) return billing;
  const ra = rental?.addresses?.billing || rental?.addresses?.delivery || rental?.addresses?.pickup || null;
  return ra || null;
}

function addressLines(addr) {
  if (!addr) return [];
  const lines = [];
  if (addr.line1) lines.push(String(addr.line1));
  if (addr.line2) lines.push(String(addr.line2));
  const cityLine = [addr.city, addr.state].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  const pin = addr.postalCode || addr.pincode;
  if (pin) lines.push(String(pin));
  if (addr.country) lines.push(String(addr.country));
  return lines;
}

function drawBuildingMark(doc, x, y) {
  // Simple monochrome building mark (Elite-style header logo).
  doc.save();
  doc.lineWidth(1.2).strokeColor("#111");
  doc.rect(x + 10, y + 14, 28, 26).stroke();
  doc.moveTo(x + 10, y + 14).lineTo(x + 24, y + 2).lineTo(x + 38, y + 14).stroke();
  doc.rect(x + 15, y + 20, 5, 5).stroke();
  doc.rect(x + 28, y + 20, 5, 5).stroke();
  doc.rect(x + 21, y + 30, 6, 10).stroke();
  doc.restore();
}

/**
 * Elite-style rental invoice PDF (downloadable artifact).
 * Layout: INVOICE + brand · BILL TO · meta · line table · TOTAL PAYABLE bar · footer.
 */
export async function renderInvoicePdf(tenantId, invoiceId, { customerId } = {}) {
  const { invoice } = await getInvoice(tenantId, invoiceId, { customerId });
  const [rental, template, tenant, customer] = await Promise.all([
    RentalOrder.findOne({ _id: invoice.rentalId, tenantId }).lean(),
    getDefaultTemplate(tenantId),
    Tenant.findById(tenantId).select("name contactEmail").lean(),
    invoice.customerId
      ? RentalCustomer.findOne({ _id: invoice.customerId, tenantId })
          .select("displayName legalName addresses contacts")
          .lean()
      : null,
  ]);

  const companyName = tenant?.name || template?.name || "Rental Portal";
  const headerAddr = (template?.headerText || "").trim();
  const footerText = (template?.footerText || "").trim();
  const billName =
    customer?.displayName ||
    rental?.customerSnapshot?.displayName ||
    customer?.legalName ||
    "Customer";
  const billAddr = pickBillingAddress(customer, rental);
  const billLines = addressLines(billAddr);

  const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
  const dueAt = invoice.expiresAt
    ? new Date(invoice.expiresAt)
    : new Date(issuedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width;
  const left = 50;
  const right = pageW - 50;
  const contentW = right - left;
  let y = 48;

  // ---- Header: INVOICE (left) + brand mark (right) ----
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(28).text("INVOICE", left, y, { width: 220 });
  drawBuildingMark(doc, right - 48, y - 4);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#111")
    .text(String(companyName).toUpperCase(), right - 130, y + 42, { width: 130, align: "right" });

  y += 40;
  const companyLine = [companyName, headerAddr].filter(Boolean).join(", ");
  doc.font("Helvetica").fontSize(9).fillColor("#888");
  if (companyLine) {
    doc.text(companyLine, left, y, { width: contentW * 0.62 });
  }
  y += 36;

  // ---- BILL TO (left) + invoice meta (right) ----
  const metaX = left + contentW * 0.55;
  const metaW = contentW * 0.45;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text("BILL TO", left, y);
  let billY = y + 16;
  doc.font("Helvetica").fontSize(10).fillColor("#222").text(billName, left, billY, { width: contentW * 0.5 });
  billY = doc.y + 2;
  for (const line of billLines) {
    doc.fillColor("#555").text(line, left, billY, { width: contentW * 0.5 });
    billY = doc.y + 1;
  }

  const metaRows = [
    ["Invoice No.:", invoice.invoiceNumber || "—"],
    ["Issue date:", formatDateIn(issuedAt)],
    ["Due date:", formatDateIn(dueAt)],
  ];
  if (rental?.rentalNumber) metaRows.push(["Rental:", rental.rentalNumber]);
  let metaY = y;
  for (const [label, value] of metaRows) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text(label, metaX, metaY, { width: metaW * 0.45 });
    doc.font("Helvetica").fillColor("#222").text(String(value), metaX + metaW * 0.45, metaY, {
      width: metaW * 0.55,
      align: "right",
    });
    metaY += 16;
  }

  y = Math.max(billY, metaY) + 28;

  // ---- Line items table (wide description so overdue day labels are readable) ----
  const colDesc = left;
  const colQty = left + contentW * 0.58;
  const colUnit = left + contentW * 0.7;
  const colAmt = left + contentW * 0.85;
  const headerH = 26;
  const descWidth = colQty - colDesc - 12;

  doc.save();
  doc.rect(left, y, contentW, headerH).fill("#F0F0F0");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");
  const hy = y + 8;
  doc.text("DESCRIPTION", colDesc + 8, hy, { width: descWidth });
  doc.text("QTY", colQty, hy, { width: colUnit - colQty - 4, align: "right" });
  doc.text("UNIT PRICE", colUnit, hy, { width: colAmt - colUnit - 4, align: "right" });
  doc.text("AMOUNT", colAmt, hy, { width: right - colAmt, align: "right" });
  y += headerH;

  // Live rental always wins for damage: tax invoices from confirm are rent-only
  // and go stale; customers must see what they are being charged for.
  // Damage-only penalty policy — no overdue/late lines.
  const master = rental ? buildMasterInvoiceParts(rental) : null;
  const liveDamage =
    Number(master?.totals?.damagePreTaxPaise || 0) + Number(master?.totals?.damageGstPaise || 0);
  const isMaster = invoice.type === "final";
  const useLiveCharges = Boolean(master && (isMaster || liveDamage > 0));
  const sourceLines = useLiveCharges ? master.lines : invoice.lines || [];

  const tableRows = [];
  for (const line of sourceLines) {
    const qty = Number(line.quantity || 1) || 1;
    const amount =
      line.lineGrossPaise != null
        ? Number(line.lineGrossPaise)
        : Number(line.linePreTaxPaise || 0) + Number(line.lineGstPaise || 0);
    const unit = Math.round(amount / qty);
    tableRows.push({
      description: line.nameSnapshot || line.lineId || "Rental item",
      qty: String(qty),
      unitPaise: unit,
      amountPaise: amount,
    });
  }

  // Settlement totals: always prefer live master math (never stale invoice payments).
  const t = useLiveCharges
    ? { ...(invoice.totals || {}), ...master.totals }
    : invoice.totals || {};
  const d = invoice.depositSummary || {};

  const depositPaise = Number(
    d.depositCollectedPaise ?? d.depositPaise ?? rental?.depositCollectedPaise ?? 0
  );
  // Booking tax invoice (no overdue yet): deposit as its own row.
  // When overdue/damage is live (or master): deposit is a credit in totals, never a charge line.
  if (!isMaster && !useLiveCharges && depositPaise > 0) {
    tableRows.push({
      description: "Security deposit",
      qty: "1",
      unitPaise: depositPaise,
      amountPaise: depositPaise,
    });
  }

  if (!tableRows.length) {
    tableRows.push({
      description: "Rental charges",
      qty: "1",
      unitPaise: Number(t.chargeGrossPaise || 0),
      amountPaise: Number(t.chargeGrossPaise || 0),
    });
  }

  doc.font("Helvetica").fontSize(9).fillColor("#222");
  for (const row of tableRows) {
    const descH = Math.max(
      28,
      doc.heightOfString(row.description, { width: descWidth }) + 14
    );
    if (y + descH > doc.page.height - 120) {
      doc.addPage();
      y = 50;
    }
    doc
      .moveTo(left, y + descH)
      .lineTo(right, y + descH)
      .strokeColor("#E5E5E5")
      .lineWidth(0.8)
      .stroke();
    const ty = y + 8;
    doc.fillColor("#222").text(row.description, colDesc + 8, ty, {
      width: descWidth,
    });
    doc.text(row.qty, colQty, ty, { width: colUnit - colQty - 4, align: "right" });
    doc.text(formatInr(row.unitPaise).replace(/^INR\s/, ""), colUnit, ty, {
      width: colAmt - colUnit - 4,
      align: "right",
    });
    doc.text(formatInr(row.amountPaise).replace(/^INR\s/, ""), colAmt, ty, {
      width: right - colAmt,
      align: "right",
    });
    y += descH;
  }

  y += 18;

  // ---- Totals: charges − payments (rent paid) − deposit = TOTAL PAYABLE ----
  const chargeGross = Number(t.chargeGrossPaise ?? 0);
  const payments = Number(t.paymentsPaise ?? 0);
  const depositApplied = Number(t.depositAppliedPaise ?? d.depositAppliedPaise ?? 0);
  const tableTotal = tableRows.reduce((s, r) => s + Number(r.amountPaise || 0), 0);
  const grandTotal =
    isMaster || useLiveCharges
      ? tableTotal || chargeGross
      : chargeGross > 0
        ? chargeGross + (depositPaise > 0 ? depositPaise : 0)
        : tableTotal;
  const payablePaise =
    isMaster || useLiveCharges
      ? Math.max(0, grandTotal - payments - depositApplied)
      : t.finalPayablePaise != null
        ? Math.max(0, Number(t.finalPayablePaise))
        : t.balanceDuePaise != null
          ? Math.max(0, Number(t.balanceDuePaise))
          : Math.max(0, grandTotal - payments);

  const totalsX = left + contentW * 0.5;
  const totalsW = contentW * 0.5;

  doc.font("Helvetica").fontSize(10).fillColor("#333");
  doc.text("TOTAL (INR):", totalsX, y, { width: totalsW * 0.55, align: "left" });
  doc.font("Helvetica-Bold").fillColor("#111").text(formatInr(grandTotal), totalsX + totalsW * 0.45, y, {
    width: totalsW * 0.55,
    align: "right",
  });
  y += 22;

  if (payments > 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#555");
    doc.text("Less: payments (rent paid):", totalsX, y, { width: totalsW * 0.6 });
    doc.text(`- ${formatInr(payments)}`, totalsX + totalsW * 0.4, y, {
      width: totalsW * 0.6,
      align: "right",
    });
    y += 18;
  }

  // Deposit credit whenever we are showing settlement-style charges (master invoice).
  if ((isMaster || useLiveCharges) && depositApplied > 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#555");
    doc.text("Less: deposit held:", totalsX, y, { width: totalsW * 0.6 });
    doc.text(`- ${formatInr(depositApplied)}`, totalsX + totalsW * 0.4, y, {
      width: totalsW * 0.6,
      align: "right",
    });
    y += 18;
  }

  const barH = 32;
  doc.save();
  doc.rect(totalsX, y, totalsW, barH).fill("#111");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#fff");
  doc.text("TOTAL PAYABLE (INR)", totalsX + 12, y + 10, { width: totalsW * 0.55 });
  doc.text(formatInr(payablePaise), totalsX + totalsW * 0.4, y + 10, {
    width: totalsW * 0.6 - 12,
    align: "right",
  });
  y += barH + 16;

  // ---- Security deposit disposition (settlement/master invoice) ----
  // The deposit is separate money from rent: collected up front, refundable to the
  // customer minus anything applied to charges/damage or forfeited. `refundableDepositPaise`
  // collapses to 0 once the refund posts, so derive the returnable figure from collected
  // − applied − forfeited, which stays stable across the rental's whole life.
  const depositCollected = Number(
    d.depositCollectedPaise ?? d.depositPaise ?? t.depositHeldPaise ?? rental?.depositCollectedPaise ?? 0
  );
  const depositForfeited = Number(d.forfeitedDepositPaise ?? rental?.forfeitedDepositPaise ?? 0);
  const depositReturnable = Math.max(0, depositCollected - depositApplied - depositForfeited);
  if ((isMaster || useLiveCharges) && depositCollected > 0) {
    doc
      .moveTo(totalsX, y)
      .lineTo(totalsX + totalsW, y)
      .strokeColor("#E5E5E5")
      .lineWidth(0.8)
      .stroke();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text("SECURITY DEPOSIT", totalsX, y);
    y += 16;

    const depRow = (label, value, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(bold ? "#111" : "#555");
      doc.text(label, totalsX, y, { width: totalsW * 0.6 });
      doc.text(value, totalsX + totalsW * 0.4, y, { width: totalsW * 0.6, align: "right" });
      y += 18;
    };
    depRow("Deposit collected:", formatInr(depositCollected));
    if (depositApplied > 0) depRow("Less: applied to charges:", `- ${formatInr(depositApplied)}`);
    if (depositForfeited > 0) depRow("Less: forfeited:", `- ${formatInr(depositForfeited)}`);
    depRow("Refundable to customer:", formatInr(depositReturnable), true);
  }
  y += 8;

  // Payment ledger (compact, below totals — same PDF, many lines)
  const paymentLines = invoice.paymentLines || [];
  if (paymentLines.length) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#444").text("Payments & deposit ledger", left, y);
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(8).fillColor("#666");
    for (const pl of paymentLines) {
      const kind = pl.kind || "payment";
      const label =
        kind === "deposit_apply"
          ? `Deposit applied${pl.reason ? ` (${pl.reason})` : ""}`
          : kind === "deposit_collect"
            ? "Deposit collected"
            : `Payment${pl.method ? ` · ${pl.method}` : ""}${pl.reference ? ` · ${pl.reference}` : ""}`;
      doc.text(`${label}: ${formatInr(pl.amountPaise)}`, left, y, { width: contentW });
      y = doc.y + 2;
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }
    }
    y += 10;
  }

  // ---- Footer ----
  const footerParts = [
    companyName,
    headerAddr || null,
    tenant?.contactEmail ? `Email: ${tenant.contactEmail}` : null,
    footerText || null,
  ].filter(Boolean);
  const footerLine = footerParts.join("  ·  ");
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#888")
    .text(footerLine || "Generated by Rental Portal", left, doc.page.height - 56, {
      width: contentW,
      align: "center",
    });

  doc.end();

  const pdf = await done;
  return { invoice, pdf, filename: `${invoice.invoiceNumber}.pdf` };
}
