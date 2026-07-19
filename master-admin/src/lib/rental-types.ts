// Types mirror BACKEND/src/Rental/schema/* (tenant fields omitted).
export type RentalRole = "admin" | "officer" | "manager" | "vendor";
export type PeriodCode = "minute" | "hour" | "day" | "week" | "month";
export type RentalStatus =
  | "draft" | "reserved" | "confirmed" | "dispatch_pending" | "dispatched"
  | "active" | "overdue" | "return_pending" | "returned" | "inspection"
  | "exception" | "closed" | "cancelled" | "cancelled_exception" | "expired";
export type ProviderState = "enabled" | "disabled" | "unconfigured" | "degraded" | "circuit_open";
export type RecordStatus = "active" | "inactive" | "blocked" | "archived" | "merged" | "pseudonymized";

export interface PageResult<T> { items: T[]; total: number; page: number; limit: number }
export interface RentalRecord { _id: string; version?: number; createdAt?: string; updatedAt?: string }

export interface AddressInput { line1: string; line2?: string; city: string; state: string; postalCode: string; country?: string }

export interface CustomerAddress {
  id?: string;
  label?: string;
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  isDefault?: boolean;
}

export interface Customer extends RentalRecord {
  customerNumber?: string; type: "person" | "business"; displayName: string;
  legalName?: string | null;
  email?: string | null; phone?: string | null; gstin?: string | null;
  emailMasked?: string | null; phoneMasked?: string | null; gstinMasked?: string | null;
  tags?: string[]; notes?: string | null;
  statusReason?: string | null;
  portalAccess?: boolean;
  status: RecordStatus; addresses?: CustomerAddress[] | AddressInput[];
}

export interface CustomerActivity {
  rentalCount: number;
  overdueCount: number;
  openBalancePaise: number;
  /** Sum of captured charge payments across the customer's rentals. */
  rentCollectedPaise: number;
  depositHeldPaise: number;
  lateFeeTotalPaise: number;
  productHistory: { name: string; units: number; rentalCount: number }[];
  lastInvoice: {
    _id: string;
    invoiceNumber: string;
    type?: string;
    issuedAt?: string | null;
    rentalId?: string | null;
    balanceDuePaise?: number | null;
    chargeGrossPaise?: number | null;
  } | null;
}

export interface TaxCode extends RentalRecord {
  code: string; name: string; rateBps: number; mode?: string; status?: string;
  jurisdiction?: string | null; effectiveFrom?: string; effectiveTo?: string | null;
}

export type CommercialPolicyType = "tax" | "deposit" | "late" | "grace" | "cap";
export type CommercialScopeType = "organization" | "category" | "product";

export interface CommercialPolicy extends RentalRecord {
  scopeType: CommercialScopeType;
  scopeId?: string | null;
  policyType: CommercialPolicyType;
  policy: Record<string, unknown>;
  status?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface SalesTrendItem {
  productId?: string;
  name?: string;
  units?: number;
  linePreTaxPaise?: number;
  bookingCount?: number;
  day?: string;
  bookings?: number;
  revenuePaise?: number;
  chargeGrossPaise?: number;
  lateFeePaise?: number;
}

export interface SalesTrends {
  from: string;
  to: string;
  groupBy: string;
  items: SalesTrendItem[];
}

export interface RevenueBreakdown {
  from: string;
  to: string;
  gross: {
    rentalPaise: number;
    penaltyPaise: number;
    damagePaise: number;
    deliveryPaise: number;
    collectedPaise: number;
    depositCollectedPaise: number;
  };
}

export interface Category extends RentalRecord {
  code: string; name: string; parentCategoryId?: string | null; sortOrder?: number; status?: string;
}
export interface ProductPolicies {
  late?: { ratePaise?: number; periodCode?: string; enabled?: boolean };
  grace?: { minutes?: number };
  deposit?: { mode?: "fixed" | "percentage"; valuePaise?: number; valueBps?: number };
  cap?: { mode?: string; valuePaise?: number };
}

export interface Product extends RentalRecord {
  productSku: string; name: string; categoryId?: string | null; taxClassId?: string | null;
  description?: string | null; brand?: string | null; images?: string[]; status?: string;
  policies?: ProductPolicies;
}
export interface Variant extends RentalRecord {
  productId: string; variantSku: string; name: string;
  attributes?: Record<string, unknown>; defaultPeriodCode?: PeriodCode; status?: string;
}
export interface Pricelist extends RentalRecord {
  code: string; name: string; currency?: "INR"; isDefault?: boolean;
  effectiveFrom?: string; effectiveTo?: string | null; status?: string;
}
export interface RateEntry extends RentalRecord {
  pricelistId: string; targetType: "variant" | "product" | "default"; targetId?: string | null;
  periodCode: PeriodCode; ratePaise: number; minimumBillingMinutes?: number;
}
export interface Asset extends RentalRecord {
  assetCode: string; variantId: string; productId?: string | null; serialNumber?: string | null;
  condition?: string; state: string; locationId?: string | null; notes?: string | null;
}

export interface StockRollupRow {
  productId?: string | null;
  variantId?: string | null;
  locationId?: string | null;
  state?: string;
  condition?: string;
  count: number;
}

export interface StockRollup {
  items: StockRollupRow[];
  availableCount: number;
  totalCount: number;
}

export interface AvailabilityResult {
  availableCount: number; requested: number; eligibleAssetIds: string[]; sufficient: boolean;
}

export interface RentalLine {
  lineId: string; productId?: string | null; variantId?: string | null; catalogItemId?: string | null;
  nameSnapshot?: string | null; quantity: number; periodCode?: PeriodCode;
  unitMinutes?: number | null; ratePaise?: number | null; minimumBillingMinutes?: number;
  linePreTaxPaise?: number; lineGstPaise?: number;
}
export interface DepositSnapshot {
  mode?: "fixed" | "percentage"; depositPaise?: number; selectedBps?: number | null; sourceLevel?: string | null;
}
export interface RentalOrder extends RentalRecord {
  rentalNumber: string; customerId: string; customerSnapshot?: { displayName?: string; customerNumber?: string; phone?: string; email?: string } | null;
  status: RentalStatus; orderChannel?: string;
  startAt?: string | null; endAt?: string | null; plannedEndAt?: string | null;
  actualIssuedAt?: string | null; actualReturnedAt?: string | null; timezone?: string;
  lines?: RentalLine[]; notes?: string | null;
  preTaxSubtotalPaise?: number; bookedGstPaise?: number; depositSnapshot?: DepositSnapshot | null;
  pricingFingerprint?: string | null; reservationExpiresAt?: string | null;
  chargeGrossPaise?: number; paymentsPaise?: number; refundsPaise?: number; deductionsPaise?: number;
  forfeitedDepositPaise?: number; depositCollectedPaise?: number;
  depositRefundsPendingPaise?: number; depositRefundsCompletedPaise?: number;
  depositLiabilityPaise?: number; refundableDepositPaise?: number; balanceDuePaise?: number;
  lateFeePaise?: number; lateGstPaise?: number; damagePreTaxPaise?: number; damageGstPaise?: number;
  invoiceIds?: string[];
  fulfillment?: {
    method?: string;
    contactName?: string;
    contactPhone?: string;
    paymentStatus?: string;
    paidAt?: string;
    storeName?: string;
    address?: string;
    pendingPayment?: unknown;
    shipmentId?: string | null;
    deliveryPromise?: {
      mock?: boolean;
      message?: string;
      estimatedMinDays?: number;
      estimatedMaxDays?: number;
      estimatedDeliveryFrom?: string | null;
      estimatedDeliveryTo?: string | null;
      status?: string;
    } | null;
    dispatchedAt?: string | null;
    deliveredAt?: string | null;
  } | null;
  addresses?: {
    delivery?: { fullName?: string; phone?: string; line1?: string; city?: string; pincode?: string };
    pickup?: { storeId?: string; storeName?: string; line1?: string; city?: string; phone?: string };
  } | null;
  settlementShortfallPaise?: number;
  inspection?: {
    photos?: { front?: string; side?: string; back?: string };
    notes?: string | null;
    assessedAt?: string | null;
  } | null;
}

export interface ShipmentTrackingStep {
  code: string;
  label: string;
  at?: string | null;
  done?: boolean;
}

export interface RentalShipment {
  _id: string;
  rentalId?: string;
  status: string;
  provider?: string;
  providerOrderId?: string | null;
  trackingUrl?: string | null;
  metadata?: {
    mock?: boolean;
    message?: string;
    tracking?: ShipmentTrackingStep[];
    estimatedMinDays?: number;
    estimatedMaxDays?: number;
    estimatedDeliveryFrom?: string | null;
    estimatedDeliveryTo?: string | null;
    deliveredAt?: string | null;
  } | null;
  deliveryPromise?: {
    message?: string;
    estimatedMinDays?: number;
    estimatedMaxDays?: number;
    estimatedDeliveryFrom?: string | null;
    estimatedDeliveryTo?: string | null;
  } | null;
}

export interface PenaltyBreakdown {
  rentalId: string;
  rentalNumber?: string;
  status?: string;
  plannedEndAt?: string | null;
  actualReturnedAt?: string | null;
  overdueMinutes?: number;
  overdueLabel?: string;
  lateFeePaise?: number;
  lateGstPaise?: number;
  damagePreTaxPaise?: number;
  damageGstPaise?: number;
  penaltyTotalPaise?: number;
  depositCollectedPaise?: number;
  settlementShortfallPaise?: number;
  balanceDuePaise?: number;
  dueBillPaise?: number;
}

export interface InvoiceEmailDelivery {
  status?: "not_sent" | "sent" | "failed" | "skipped";
  sentAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  to?: string | null;
}

export interface RentalInvoiceRow {
  _id: string;
  invoiceNumber: string;
  type?: string;
  issuedAt?: string | null;
  chargeGrossPaise?: number | null;
  balanceDuePaise?: number | null;
  state?: string;
  paymentLines?: Array<{
    kind?: string;
    amountPaise?: number;
    chargePaise?: number;
    depositPaise?: number;
    reference?: string | null;
    reason?: string | null;
    at?: string;
  }>;
  emailDelivery?: InvoiceEmailDelivery;
  totals?: Record<string, number | undefined>;
}

export interface RentalDetailOps {
  penalty: PenaltyBreakdown | null;
  invoices: RentalInvoiceRow[];
  shipment: RentalShipment | null;
  emailDelivery?: InvoiceEmailDelivery;
}

export interface RentalDetailResponse {
  rental: RentalOrder;
  ops?: RentalDetailOps;
}

export interface PricePreview {
  lines: RentalLine[]; preTaxSubtotalPaise: number; bookedGstPaise: number;
  deposit: DepositSnapshot & { inputs?: unknown[] }; totalPaise: number; fingerprint: string;
}

export interface RentalPayment extends RentalRecord {
  rentalId: string;
  direction: "charge" | "refund";
  method: string;
  provider?: string | null;
  amountPaise: number;
  allocation?: { chargePaise?: number; depositPaise?: number };
  status: string;
  reference?: string | null;
  reason?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  verifiedAt?: string | null;
  rentalNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
  orderChannel?: string | null;
  fulfillmentMethod?: string | null;
  rentalPaymentStatus?: string | null;
  currency?: string;
}

export interface PaymentAnalyticsSummary {
  totalCount: number;
  capturedChargePaise: number;
  refundPaise: number;
  netCollectedPaise: number;
  failedCount: number;
  pendingCount: number;
}

export interface PaymentAnalytics {
  from: string;
  to: string;
  groupBy: "day" | "month" | string;
  summary: PaymentAnalyticsSummary;
  series: { period: string; chargePaise: number; refundPaise: number; count: number }[];
  byMethod: { method: string; count: number; amountPaise: number }[];
  byStatus: { status: string; count: number; amountPaise: number }[];
  byCustomer: {
    customerId?: string | null;
    customerName: string;
    amountPaise: number;
    count: number;
  }[];
}

export interface PaymentExportResult {
  from?: string | null;
  to?: string | null;
  total: number;
  truncated: boolean;
  exportMax: number;
  items: RentalPayment[];
}

export interface PendingCheckoutRow {
  rentalId: string;
  rentalNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  orderChannel?: string | null;
  status?: string;
  createdAt?: string;
  fulfillmentMethod?: string | null;
  pendingPayment?: {
    orderId?: string;
    amountPaise?: number;
    chargePaise?: number;
    depositPaise?: number;
    mock?: boolean;
    createdAt?: string;
  } | null;
}

export interface DepositEntry extends RentalRecord {
  rentalId: string;
  eventType: string;
  state?: string;
  amountPaise: number;
  category?: string | null;
  reason?: string | null;
  approvalArtifactId?: string | null;
  rentalNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  orderChannel?: string | null;
  fulfillmentMethod?: string | null;
}
export interface Shipment extends RentalRecord {
  rentalId: string; leg: "outbound" | "return"; provider: string; status: string;
  trackingUrl?: string | null; attempts?: number; metadata?: Record<string, unknown> | null;
}
export interface NotificationRow extends RentalRecord {
  rentalId?: string | null; purpose: string; channel: string; destinationMask?: string | null;
  provider?: string; status: string; attempts?: number; errorCode?: string | null;
}
export interface AuditEvent extends RentalRecord {
  actorType: string; actorId?: string | null; action: string;
  resourceType: string; resourceId?: string | null; reason?: string | null; createdAt: string;
}

export interface ProviderReadiness {
  state: ProviderState; effectiveEnabled?: boolean; rolloutMode?: string;
  rolloutAllowsTenant?: boolean; safeReasonCode?: string | null; publicKeyId?: string | null;
}
export interface RentalSettings extends RentalRecord {
  timezone?: string; dueWindowMinutes?: number; numberingPrefix?: string;
  paymentPolicy?: "prepaid" | "postpaid" | "deposit_only";
  providerEnabled?: { razorpay?: boolean; borzo?: boolean; msg91?: boolean };
  notificationPurposes?: string[]; version: number;
}
export interface SettingsResponse { settings: RentalSettings; providers: Record<string, ProviderReadiness> }

export interface RentalDashboard {
  asOfAt: string;
  counts: { activeRentals: number; rentalsDueToday: number; upcomingPickups: number; upcomingReturns: number; overdueRentals: number };
  money: { revenueFromRentalsPaise: number; securityDepositsHeldPaise: number; lateFeeCollectionPaise: number };
}

export interface OverdueWorklistItem {
  _id: string;
  rentalNumber?: string | null;
  customerId?: string;
  customerSnapshot?: { displayName?: string; customerNumber?: string; phone?: string; email?: string } | null;
  status: RentalStatus;
  plannedEndAt?: string | null;
  lateFeePaise?: number;
  lateGstPaise?: number;
  settlementShortfallPaise?: number;
  balanceDuePaise?: number;
}

export interface OverdueWorklist {
  asOfAt: string;
  items: OverdueWorklistItem[];
  total?: number;
  page?: number;
  limit?: number;
}
export interface FinancialReport {
  report: {
    chargeGrossPaise?: number; paymentsPaise?: number; refundsPaise?: number; deductionsPaise?: number;
    forfeitedDepositPaise?: number; depositCollectedPaise?: number; depositRefundsCompletedPaise?: number;
    depositLiabilityPaise?: number; refundableDepositPaise?: number; balanceDuePaise?: number; lateFeePaise?: number;
  };
}

export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryPrimitive>;
export interface CommandOptions { version?: number; idempotencyKey?: string }
