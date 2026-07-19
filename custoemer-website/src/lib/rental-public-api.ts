// Unauthenticated public rental API: catalog + customer auth.
// Mounted at /api/v1/rental/public/:tenantSlug.

import { API_URL, TENANT_SLUG } from "./config";

const BASE = `${API_URL}/rental/public/${TENANT_SLUG}`;

export class RentalApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "API_ERROR", status = 500) {
    super(message);
    this.name = "RentalApiError";
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Headroom for the auth send paths that still block on SMTP (resend
    // verification, login OTP). Register itself now returns immediately.
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // non-JSON body falls through
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  customerId: string;
  tokens: AuthTokens;
  tenantId: string;
  emailVerified?: boolean;
}

/** Register no longer issues tokens — email must be verified first. */
export interface RegisterResult {
  customerId: string;
  tenantId: string;
  emailVerified: false;
  verification: { requested: boolean; channel: string; delivery?: string; resumed?: boolean };
  /** Present only when RENTAL_OTP_DEV_ECHO=true (non-prod). */
  devCode?: string;
}

export function authRegister(input: {
  email: string;
  password: string;
  displayName?: string;
  phone?: string;
}): Promise<RegisterResult> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function authVerifyEmail(input: { email: string; code: string }): Promise<AuthResult> {
  return request("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function authResendVerification(email: string): Promise<{
  requested: boolean;
  channel?: string;
  delivery?: string;
  devCode?: string;
}> {
  return request("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function authLogin(input: { email: string; password: string }): Promise<AuthResult> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function authOtpRequest(email: string): Promise<{
  requested: boolean;
  /** True only when a login OTP was stored and emailed. */
  issued?: boolean;
  channel?: string;
  delivery?: string;
  devCode?: string;
}> {
  return request("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function authOtpVerify(input: { email: string; otp: string }): Promise<AuthResult> {
  return request("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface PublicCategory {
  _id: string;
  code: string;
  name: string;
  parentCategoryId?: string | null;
  sortOrder?: number;
}

export interface PublicCatalogItem {
  _id: string;
  name: string;
  /** Seed natural key — used for stable storefront slugs */
  productSku?: string;
  categoryId: string;
  description?: string | null;
  brand?: string | null;
  images?: string[];
}

export interface PublicVariant {
  _id: string;
  name: string;
  variantSku?: string;
  defaultPeriodCode?: string;
  attributes?: Record<string, string>;
  rates?: { periodCode: string; ratePaise: number }[];
}

export async function fetchPublicCategories(): Promise<PublicCategory[]> {
  const out = await request<{ items: PublicCategory[] }>("/categories");
  return out.items;
}

export async function fetchPublicCatalog(opts: {
  limit?: number;
  q?: string;
  categoryId?: string;
} = {}): Promise<PublicCatalogItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 100));
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.categoryId) params.set("categoryId", opts.categoryId);
  const out = await request<{ items: PublicCatalogItem[]; tenantSlug: string }>(
    `/catalog?${params}`,
  );
  return out.items;
}

export async function fetchPublicVariants(productId: string): Promise<PublicVariant[]> {
  const out = await request<{ items: PublicVariant[] }>(`/catalog/${productId}/variants`);
  return out.items;
}

export interface AvailabilityResult {
  availableCount: number;
  requested: number;
  sufficient: boolean;
}

export function checkAvailability(input: {
  variantId: string;
  startAt: string;
  endAt: string;
  quantity?: number;
}): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    variantId: input.variantId,
    startAt: input.startAt,
    endAt: input.endAt,
  });
  if (input.quantity != null) params.set("quantity", String(input.quantity));
  return request(`/availability?${params}`);
}
