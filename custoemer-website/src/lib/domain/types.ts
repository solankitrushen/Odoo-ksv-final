// Rental domain types for the storefront. These mirror the live Rental API
// (routes/public.js, routes/customer.js) — only fields the backend actually
// returns. Money is integer paise (never floats).

export type Paise = number; // integer; 100 paise = ₹1

/** Locked fixed-minute rental periods (SPEC-RMS-001-CAT §3). Month = 30 days. */
export type RentalPeriodUnit = "hour" | "day" | "week" | "month";

export const PERIOD_MINUTES: Record<RentalPeriodUnit, number> = {
  hour: 60,
  day: 1440,
  week: 10080,
  month: 43200,
};

export interface Category {
  id: string;
  slug: string; // backend category `code`
  name: string;
  blurb: string;
}

export interface RateEntry {
  unit: RentalPeriodUnit;
  amount: Paise; // rate per one period unit
}

export interface ProductVariant {
  id: string; // backend variant _id
  label: string; // variant name
  attributes: Record<string, string>;
  rates: RateEntry[];
}

export interface Product {
  id: string; // backend product _id
  slug: string;
  name: string;
  categorySlug: string;
  brand: string;
  summary: string; // short description
  description: string;
  image: string;
  gallery: string[];
  variants: ProductVariant[];
}

// ---- Cart --------------------------------------------------------------------

/** Unified cart line — same shape for guest (local) and server-backed carts. */
export interface CartLine {
  id: string; // local id or server lineId
  productId: string;
  productSlug: string;
  productName: string;
  image: string;
  variantId: string;
  variantLabel: string;
  periodCode: RentalPeriodUnit;
  quantity: number;
  ratePaise: number; // rate for periodCode (estimate only)
  startAt: string; // ISO
  endAt: string; // ISO
  /** Present only when the line is server-backed. */
  availability?: { availableCount: number; sufficient: boolean };
}

export type FulfilmentMethod = "delivery" | "pickup";

// ---- Account -----------------------------------------------------------------

export interface Address {
  id: string;
  label: string; // "Home", "Office"
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isDefault?: boolean;
}

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  addresses: Address[];
}
