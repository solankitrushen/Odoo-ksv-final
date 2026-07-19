// Authenticated customer rental API.
// Reads the access token from session.ts unless an explicit token is passed.
// On 401 the session is cleared and UnauthorizedError is thrown.

import { API_URL } from "./config";
import { readSession, clearSession } from "./session";
import { RentalApiError } from "./rental-public-api";

export {
  RentalApiError,
  authLogin,
  authRegister,
  authVerifyEmail,
  authResendVerification,
  authOtpRequest,
  authOtpVerify,
  normalizeEmail,
  normalizePhone,
  type AuthTokens,
  type AuthResult,
  type RegisterResult,
} from "./rental-public-api";

import type { RentalPeriodUnit } from "./domain/types";

const BASE = `${API_URL}/rental/customer`;

export class UnauthorizedError extends RentalApiError {
  constructor(message = "Session expired") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

/** @deprecated alias */
export class AuthRequiredError extends UnauthorizedError {
  constructor(message = "Session expired") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export interface RentalLine {
  lineId: string;
  productId: string | null;
  variantId: string | null;
  nameSnapshot: string | null;
  productName?: string | null;
  variantName?: string | null;
  quantity: number;
  periodCode: "minute" | "hour" | "day" | "week" | "month";
  unitMinutes: number | null;
  ratePaise: number | null;
  linePreTaxPaise: number;
  lineGstPaise: number;
}

export interface DepositSnapshot {
  mode: "fixed" | "percentage";
  depositPaise: number;
  selectedBps: number | null;
}

export type RentalStatus =
  | "draft"
  | "reserved"
  | "confirmed"
  | "dispatch_pending"
  | "dispatched"
  | "active"
  | "overdue"
  | "return_pending"
  | "returned"
  | "inspection"
  | "closed"
  | "cancelled"
  | "cancelled_exception"
  | "expired"
  | "exception";

export interface RentalOrder {
  _id: string;
  rentalNumber: string;
  status: RentalStatus;
  orderChannel?: string;
  startAt: string;
  endAt?: string | null;
  plannedEndAt?: string | null;
  actualReturnedAt?: string | null;
  timezone?: string;
  lines: RentalLine[];
  notes?: string | null;
  fulfillment?: Record<string, unknown> | null;
  addresses?: Record<string, unknown> | null;
  preTaxSubtotalPaise: number;
  bookedGstPaise: number;
  depositSnapshot: DepositSnapshot | null;
  lateFeePaise: number;
  lateGstPaise?: number;
  depositCollectedPaise?: number;
  depositRefundsCompletedPaise?: number;
  refundableDepositPaise?: number;
  balanceDuePaise?: number;
  settlementShortfallPaise?: number;
  chargeGrossPaise?: number;
  paymentsPaise?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PenaltyBreakdown {
  rentalId: string;
  rentalNumber: string;
  status: string;
  plannedEndAt?: string | null;
  actualReturnedAt?: string | null;
  asOfAt?: string;
  overdueMinutes: number;
  overdueLabel: string;
  lateFeePaise: number;
  lateGstPaise: number;
  damagePreTaxPaise: number;
  damageGstPaise: number;
  penaltyTotalPaise: number;
  depositCollectedPaise: number;
  settlementShortfallPaise: number;
  balanceDuePaise: number;
  dueBillPaise: number;
  chargeGrossPaise: number;
  paymentsPaise: number;
}

export interface RentalInvoice {
  _id: string;
  invoiceNumber: string;
  type?: string;
  totals?: Record<string, number>;
  issuedAt?: string | null;
  status?: string;
}

export type BackendRental = RentalOrder;

export interface RentalPreview {
  lines: RentalLine[];
  preTaxSubtotalPaise: number;
  bookedGstPaise: number;
  deposit: { depositPaise: number; mode: string };
  totalPaise: number;
  fingerprint: string;
  error?: string;
}

export interface CustomerAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface CustomerMe {
  id: string;
  displayName: string;
  type: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  emailMasked?: string | null;
  phoneMasked?: string | null;
  addresses?: CustomerAddress[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

function resolveToken(explicit?: string): string {
  const token = explicit ?? readSession()?.accessToken;
  if (!token) throw new UnauthorizedError("Not logged in");
  return token;
}

async function request<T>(path: string, init?: RequestInit, explicitToken?: string): Promise<T> {
  const accessToken = resolveToken(explicitToken);
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    throw new UnauthorizedError();
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // non-JSON
  }
  if (!res.ok || !body?.success) {
    throw new RentalApiError(
      body?.message ?? `Rental API ${res.status} on ${path}`,
      body?.error ?? "API_ERROR",
      res.status,
    );
  }
  return body.data;
}

export function fetchMe(accessToken?: string): Promise<{ customer: CustomerMe }> {
  // Optional explicit token (auth bootstrap). Do not pass React Query context as arg.
  const token = typeof accessToken === "string" ? accessToken : undefined;
  return request("/me", undefined, token);
}

export function updateMe(patch: {
  displayName?: string;
  phone?: string;
}): Promise<{ customer: CustomerMe }> {
  return request("/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function replaceMyAddresses(
  addresses: Array<{
    id?: string;
    label?: string;
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    isDefault?: boolean;
  }>,
): Promise<{ addresses: CustomerAddress[] }> {
  return request("/me/addresses", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
}

export function fetchRentals(page = 1, limit = 50) {
  return request<{ items: RentalOrder[]; total: number; page: number; limit: number }>(
    `/rentals?page=${page}&limit=${limit}`,
  );
}

export function fetchRental(id: string): Promise<{ rental: RentalOrder }> {
  return request(`/rentals/${id}`);
}

export interface RentalPaymentRow {
  _id: string;
  rentalId: string;
  direction: "charge" | "refund";
  method: string;
  provider?: string | null;
  amountPaise: number;
  allocation?: { chargePaise?: number; depositPaise?: number };
  status: string;
  reference?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface RentalDepositEntryRow {
  _id: string;
  rentalId: string;
  eventType: string;
  state?: string;
  amountPaise: number;
  category?: string | null;
  reason?: string | null;
  createdAt: string;
}

export function fetchRentalPayments(rentalId: string): Promise<{ items: RentalPaymentRow[] }> {
  return request(`/rentals/${rentalId}/payments`);
}

export function fetchRentalDepositEntries(
  rentalId: string,
): Promise<{ items: RentalDepositEntryRow[] }> {
  return request(`/rentals/${rentalId}/deposit-entries`);
}

export function fetchRentalPenalty(rentalId: string): Promise<PenaltyBreakdown> {
  return request(`/rentals/${rentalId}/penalty`);
}

export function fetchRentalInvoice(
  rentalId: string,
): Promise<{ invoice: RentalInvoice }> {
  return request(`/rentals/${rentalId}/invoice`);
}

/** Download latest invoice PDF (opens / saves blob). */
export async function downloadRentalInvoice(rentalId: string): Promise<void> {
  const accessToken = resolveToken();
  const res = await fetch(`${BASE}/rentals/${rentalId}/invoice/download`, {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    clearSession();
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new RentalApiError(`Invoice download failed (${res.status})`, "API_ERROR", res.status);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] || `invoice-${rentalId}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export { toIsoWithOffset } from "./money";

export function previewHasError(
  preview: RentalPreview | { error: string } | null | undefined,
): preview is { error: string } {
  return !!preview && "error" in preview && typeof preview.error === "string";
}

export interface CheckoutRazorpayOrder {
  mock: boolean;
  provider: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  publicKeyId: string;
  breakdown: { chargePaise: number; depositPaise: number };
  rentalNumber: string;
  rentalId: string;
}

export function createCheckoutRazorpayOrder(rentalId: string): Promise<CheckoutRazorpayOrder> {
  return request(`/rentals/${rentalId}/checkout/razorpay-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey(),
    },
    body: "{}",
  });
}

export function confirmCheckoutPayment(
  rentalId: string,
  body: { orderId: string; paymentId: string; signature?: string },
): Promise<{ payment: unknown; rental: RentalOrder }> {
  return request(`/rentals/${rentalId}/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey(),
    },
    body: JSON.stringify(body),
  });
}

// ---- Server cart (SPEC-004) -------------------------------------------------

export interface ServerCartLine {
  lineId: string;
  variantId: string;
  quantity: number;
  periodCode: RentalPeriodUnit;
  startAt: string;
  endAt: string;
  locationId?: string | null;
  availability?: {
    availableCount: number;
    requested: number;
    sufficient: boolean;
    locationId?: string | null;
  };
}

export interface ServerCart {
  _id?: string;
  lines: ServerCartLine[];
  fulfillment?: { method: "delivery" | "pickup"; addressId?: string | null };
  version: number;
}

export interface CartPreview {
  preTaxSubtotalPaise: number;
  bookedGstPaise: number;
  deposit: { depositPaise: number; mode: string };
  totalPaise: number;
  fingerprint: string;
  taxBreakdown?: unknown;
  lines?: unknown[];
}

export interface CartItemInput {
  variantId: string;
  quantity: number;
  periodCode?: RentalPeriodUnit;
  startAt: string;
  endAt: string;
  locationId?: string;
}

const jsonHeaders = { "Content-Type": "application/json" };

export function fetchServerCart(): Promise<{ cart: ServerCart }> {
  return request("/cart");
}

export function addServerCartItem(item: CartItemInput): Promise<{ cart: ServerCart }> {
  return request("/cart/items", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(item),
  });
}

export function updateServerCartItem(
  lineId: string,
  patch: Partial<Pick<CartItemInput, "quantity" | "periodCode" | "startAt" | "endAt" | "locationId">>,
): Promise<{ cart: ServerCart }> {
  return request(`/cart/items/${lineId}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
}

export function removeServerCartItem(lineId: string): Promise<{ cart: ServerCart }> {
  return request(`/cart/items/${lineId}`, { method: "DELETE" });
}

export function clearServerCart(): Promise<{ cart: ServerCart }> {
  return request("/cart", { method: "DELETE" });
}

export function setCartFulfillment(body: {
  method: "delivery" | "pickup";
  addressId?: string;
}): Promise<{ cart: ServerCart; deliveryPromise?: unknown }> {
  return request("/cart/fulfillment", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

export function previewServerCart(): Promise<{ cart: ServerCart; preview: CartPreview }> {
  return request("/cart/preview");
}

export function checkoutServerCart(): Promise<{
  rental: RentalOrder;
  preview: RentalPreview | { error: string };
  cartPreview: CartPreview;
}> {
  return request("/cart/checkout", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      "Idempotency-Key": createIdempotencyKey(),
    },
    body: "{}",
  });
}
