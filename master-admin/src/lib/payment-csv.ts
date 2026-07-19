import type { RentalPayment } from "@/lib/rental-types";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a UTF-8 CSV string for payment export rows. */
export function paymentsToCsv(items: RentalPayment[]): string {
  const headers = [
    "Date",
    "Rental",
    "Customer",
    "Customer email",
    "Direction",
    "Method",
    "Status",
    "Amount INR",
    "Amount paise",
    "Reference",
    "Provider payment id",
    "Provider order id",
    "Reason",
  ];
  const lines = [headers.join(",")];
  for (const p of items) {
    const when = p.createdAt ? new Date(p.createdAt).toISOString() : "";
    const inr = ((p.amountPaise ?? 0) / 100).toFixed(2);
    lines.push(
      [
        when,
        p.rentalNumber || p.rentalId || "",
        p.customerName || "",
        p.customerEmail || "",
        p.direction || "",
        p.method || "",
        p.status || "",
        inr,
        p.amountPaise ?? 0,
        p.reference || "",
        p.providerPaymentId || "",
        p.providerOrderId || "",
        p.reason || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
