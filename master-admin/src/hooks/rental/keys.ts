import type { QueryParams } from "@/lib/rental-types";

export type RentalScope = string;
const stable = (value: QueryParams = {}) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)));

export const rentalKeys = {
  all: (scope: RentalScope) => ["rental", scope] as const,
  dashboard: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "dashboard", stable(filters)] as const,
  dashboardOverdue: (scope: RentalScope, filters: QueryParams = {}) =>
    ["rental", scope, "dashboard", "overdue", stable(filters)] as const,
  analyticsSales: (scope: RentalScope, filters: QueryParams = {}) =>
    ["rental", scope, "analytics", "sales", stable(filters)] as const,
  analyticsRevenue: (scope: RentalScope, filters: QueryParams = {}) =>
    ["rental", scope, "analytics", "revenue", stable(filters)] as const,
  analyticsPayments: (scope: RentalScope, filters: QueryParams = {}) =>
    ["rental", scope, "analytics", "payments", stable(filters)] as const,
  paymentsExport: (scope: RentalScope, filters: QueryParams = {}) =>
    ["rental", scope, "payments", "export", stable(filters)] as const,
  customers: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "customers", "list", stable(filters)] as const,
  customer: (scope: RentalScope, id: string) => ["rental", scope, "customers", "detail", id] as const,
  catalog: (scope: RentalScope, resource: string, filters: QueryParams = {}) => ["rental", scope, "catalog", resource, stable(filters)] as const,
  assets: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "assets", "list", stable(filters)] as const,
  asset: (scope: RentalScope, id: string) => ["rental", scope, "assets", "detail", id] as const,
  rentals: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "rentals", "list", stable(filters)] as const,
  rental: (scope: RentalScope, id: string) => ["rental", scope, "rentals", "detail", id] as const,
  calendar: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "calendar", stable(filters)] as const,
  returns: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "returns", stable(filters)] as const,
  payments: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "payments", stable(filters)] as const,
  deposits: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "deposits", stable(filters)] as const,
  deliveries: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "deliveries", stable(filters)] as const,
  notifications: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "notifications", stable(filters)] as const,
  reports: (scope: RentalScope, report: string, filters: QueryParams = {}) => ["rental", scope, "reports", report, stable(filters)] as const,
  settings: (scope: RentalScope) => ["rental", scope, "settings"] as const,
  audit: (scope: RentalScope, filters: QueryParams = {}) => ["rental", scope, "audit", stable(filters)] as const,
};
