const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

export function formatRentalMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isSafeInteger(paise)) return "—";
  return INR.format(paise / 100);
}

export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isInteger(bps)) return "—";
  return `${Math.trunc(bps / 100)}.${String(Math.abs(bps % 100)).padStart(2, "0")}%`;
}

export function parseRupeesToPaise(value: string): number | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter rupees with no more than two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new Error("Amount is outside the supported range.");
  return paise;
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  return `${Math.trunc(paise / 100)}.${String(Math.abs(paise % 100)).padStart(2, "0")}`;
}
