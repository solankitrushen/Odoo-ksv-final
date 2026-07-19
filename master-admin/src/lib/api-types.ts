export type CuisineType =
  | "beverages"
  | "chinese"
  | "continental"
  | "desserts"
  | "north-indian"
  | "south-indian";

export interface StoreAddress {
  city: string;
  street: string;
  zipCode?: string;
  building?: string;
  block?: string;
  shopNumber?: string;
  landmark?: string;
}

export interface StoreOwner {
  name?: string;
  phone?: string;
}

export interface StoreLocation {
  latitude: number | null;
  longitude: number | null;
}

export interface StoreOrdering {
  minOrderValue: number;
  freeDeliveryThreshold: number;
  deliveryFee: number;
  freeRadiusKm: number;
  maxRadiusKm: number;
  perKmFee: number;
}

export interface StoreRazorpayAddress {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export type RazorpayOnboardingStatus =
  | "active"
  | "created"
  | "needs_clarification"
  | "pending"
  | "rejected"
  | "suspended"
  | "under_review";

export interface StoreRazorpay {
  address?: StoreRazorpayAddress;
  beneficiaryName?: string;
  businessType?: string;
  commissionPercent?: number;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  ifscCode?: string;
  legalBusinessName?: string;
  linkedAccountId?: string | null;
  onboardingMeta?: {
    lastSyncedAt?: string;
    rawStatus?: string;
    rejectionReason?: string;
  };
  onboardingStatus?: RazorpayOnboardingStatus;
  profileCategory?: string;
  profileSubcategory?: string;
  referenceId?: string;
}

export interface StoreSession {
  createdAt?: string;
  deviceName?: string;
  ipAddress?: string;
  lastUsedAt?: string;
  revokedAt?: string | null;
  tokenId?: string;
  userAgent?: string;
}

export interface Store {
  _id: string;
  address?: StoreAddress;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  };
  createdAt: string;
  cuisineTypes?: CuisineType[];
  email: string;
  isActive: boolean;
  isVerified: boolean;
  lastLogin?: string | null;
  location?: StoreLocation;
  name: string;
  owner?: StoreOwner;
  ordering?: StoreOrdering;
  phone: string;
  razorpay?: StoreRazorpay;
  sessions?: StoreSession[];
  subscriptionStatus?: "active" | "inactive" | "suspended";
  updatedAt?: string;
  upiId?: string;
}

export type StoreRazorpayInput = Partial<
  Omit<StoreRazorpay, "address" | "onboardingMeta">
> & {
  address?: StoreRazorpayAddress;
  bankAccountNumber?: string;
  gst?: string;
  pan?: string;
};

export interface ListStoresResponse {
  stores: Store[];
}

export interface StoreResponse {
  message?: string;
  store: Store;
}

export interface MenuItem {
  _id?: string;
  category: string;
  createdAt?: string;
  description?: string;
  id?: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  name: string;
  price: number;
  stockAvailable?: number;
  tags?: string[];
}

export interface MenuItemResponse {
  item: MenuItem;
}

export interface ListMenuItemsResponse {
  items: MenuItem[];
}

export interface ComboLine {
  itemId: string;
  qty: number;
}

export interface Combo {
  _id?: string;
  comboPrice: number;
  createdAt?: string;
  description?: string;
  id?: string;
  isActive: boolean;
  items: ComboLine[];
  name: string;
}

export interface ComboResponse {
  combo: Combo;
}

export interface ListCombosResponse {
  combos: Combo[];
}

export type DiscountType = "fixed" | "percentage";
export type DiscountApplicable = "both" | "combos" | "items";

export interface Discount {
  _id: string;
  applicableTo: DiscountApplicable;
  createdAt: string;
  isActive: boolean;
  name: string;
  targetComboIds?: string[];
  targetItemIds?: string[];
  type: DiscountType;
  validFrom: string;
  validUntil: string;
  value: number;
}

export interface DiscountResponse {
  discount: Discount;
}

export interface ListDiscountsResponse {
  discounts: Discount[];
}

export interface DashboardStatusBreakdown {
  accepted: number;
  cancelled: number;
  delivered: number;
  failed: number;
  in_delivery: number;
  pending: number;
  preparing: number;
  ready: number;
  rejected: number;
}

export interface DashboardSummary {
  grossRevenue: number;
  netAfterPlatformFee: number;
  platformFee: number;
  platformFeeRate: number;
  subtotalRevenue: number;
  totalDeliveryCharges: number;
  totalOrders: number;
}

export interface DashboardPayload {
  orderValueDistribution: { count: number; label: string }[];
  peakHour: { count: number; hour: number } | null;
  peakHours: { count: number; hour: number }[];
  period: { from: string; to: string };
  statusBreakdown: DashboardStatusBreakdown;
  summary: DashboardSummary;
}

export interface DashboardResponse {
  dashboard: DashboardPayload;
}

export interface SalesReportRow {
  deliveryCharges: number;
  grossRevenue: number;
  netAfterPlatformFee: number;
  orderCount: number;
  period: string;
  platformFee: number;
  subtotal: number;
}

export interface SalesReportPayload {
  groupBy: string;
  period: { from: string; to: string };
  series: SalesReportRow[];
  totals: {
    deliveryCharges: number;
    grossRevenue: number;
    netAfterPlatformFee: number;
    orderCount: number;
    platformFee: number;
    subtotal: number;
  };
}

export interface SalesReportResponse {
  report: SalesReportPayload;
}

export interface PerStoreTrendingItem {
  menuItemId: string;
  name: string;
  qty: number;
  revenue: number;
}

export interface PerStoreRow {
  store: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
    location?: StoreLocation;
    ordering?: StoreOrdering;
    commissionPercent?: number;
  };
  totalOrders: number;
  grossRevenue: number;
  subtotal: number;
  deliveryCharges: number;
  platformFee: number;
  netAfterPlatformFee: number;
  avgBasket: number;
  trendingItems: PerStoreTrendingItem[];
}

export interface PerStoreResponse {
  perStore: PerStoreRow[];
  period: { from: string; to: string };
}
