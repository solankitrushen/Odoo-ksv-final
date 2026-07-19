# Rental Management System — Spec Suite

Standalone, product-flow specifications for an enhanced Rental Management experience.
These specs are self-contained: they describe the system to build from first
principles and do not assume any existing codebase.

> **Reading order:** Start with SPEC-000 (Overview & Architecture). It defines the
> shared vocabulary, roles, entities, and the master rental state machine that every
> other spec references. SPEC-001…011 cover the rental product; SPEC-012…019 build out
> the full admin **ERP** layer (product/inventory, tax, delivery, risk, finance,
> procurement, analytics) the rental business runs on — begin that block at SPEC-012.

## Index

| ID | Spec | Status | One line |
|----|------|--------|----------|
| SPEC-000 | [Overview & Architecture](./00-overview-and-architecture.md) | Draft | Whole-system product flow, roles, domain model, and the rental lifecycle state machine that ties every module together. |
| SPEC-001 | [Authentication & Profile](./01-authentication-and-profile.md) | Draft | Splash → login/registration → profile creation → dashboard, with role-based access control. |
| SPEC-002 | [Product Catalog & Browsing](./02-product-catalog-and-browsing.md) | Draft | Rentable product catalog, availability, and the portal browsing/search experience. |
| SPEC-003 | [Pricing & Attributes](./03-pricing-and-attributes.md) | Draft | Default + custom pricelists, time-bound pricing, rental periods, and product variants. |
| SPEC-004 | [Cart, Checkout & Payment](./04-cart-checkout-and-payment.md) | Draft | Cart, rental-period selection, delivery vs store pickup, payment + deposit, invoice download. |
| SPEC-005 | [Quotation & Invoicing](./05-quotation-and-invoicing.md) | Draft | Admin in-store flow: quotation → confirm → invoice → payment; quotation templates + header/footer. |
| SPEC-006 | [Security Deposit Management](./06-security-deposit-management.md) | Draft | Fixed/percentage deposits, hold-until-return, refund/deduction, full deposit history. |
| SPEC-007 | [Pickup & Return Management](./07-pickup-and-return-management.md) | Draft | Daily pickup/return schedules, confirmations, inspection, damage/missing-accessory handling, stock updates. |
| SPEC-008 | [Late Return Fee Management](./08-late-return-fee-management.md) | Draft | Overdue detection, configurable charging rules, grace period, caps, penalty invoicing. |
| SPEC-009 | [Rental Operations Dashboard](./09-rental-operations-dashboard.md) | Draft | Real-time KPIs: active/overdue/due-today, pickups/returns, revenue, deposits held, late fees. |
| SPEC-010 | [Admin Configuration & User Management](./10-admin-config-and-user-management.md) | Draft | Org-wide settings, product/pricelist/period creation, customer records, quotation config. |
| SPEC-011 | [Bonus Capabilities](./11-bonus-capabilities.md) | Draft | Optional innovations: reminders, forecasting, QR scanning, route optimization, analytics. |

### ERP admin layer (SPEC-012…019) — in [`admin-spec/`](./admin-spec/README.md)

The back-office ERP the rental business runs on, kept in its own folder. Start with
SPEC-012 (module map). See [admin-spec/README.md](./admin-spec/README.md) for the ERP flow.

| ID | Spec | Status | One line |
|----|------|--------|----------|
| SPEC-012 | [ERP Overview & Admin Module Map](./admin-spec/12-erp-overview-and-admin-module-map.md) | Draft | Connective spec: how product, tax, delivery, risk, finance, procurement, and analytics modules fit together and plug into the rental lifecycle. |
| SPEC-013 | [Product Master & Inventory](./admin-spec/13-product-master-and-inventory.md) | Draft | Full admin product CRUD — categories, variants, serialized asset units, condition, and multi-location stock/availability. |
| SPEC-014 | [Tax Management](./admin-spec/14-tax-management.md) | Draft | Tax codes, rates, composite groups; deterministic tax on rentals, late fees, delivery; inclusive/exclusive and exemptions. |
| SPEC-015 | [Delivery & Logistics](./admin-spec/15-delivery-and-logistics.md) | Draft | Delivery/collection orders, drivers, vehicles, route planning, proof-of-delivery, delivery fees — extends pickup/return. |
| SPEC-016 | [Risk Management](./admin-spec/16-risk-management.md) | Draft | Customer risk scoring, credit limits, blacklist, damage/loss/fraud incidents, risk-based deposit/approval gating. |
| SPEC-017 | [Finance, Payments & Accounting](./admin-spec/17-finance-payments-and-accounting.md) | Draft | Payments/refunds, AR, deposit liability, tax payable, double-entry GL, reconciliation across all money movements. |
| SPEC-018 | [Procurement & Suppliers](./admin-spec/18-procurement-and-suppliers.md) | Draft | Suppliers, purchase orders, goods receipt into inventory, supplier bills into finance — the buy side that stocks the fleet. |
| SPEC-019 | [Analytics & Business Intelligence](./admin-spec/19-analytics-and-business-intelligence.md) | Draft | Read-only BI: sales trends and "hype"/demand velocity, revenue & margin, utilization, customer & risk analytics, forecasting, exportable reports. |

## Conventions

- **Status flow:** `Draft` → `Approved` → `In progress` → `Done` (`Deferred` for parked scope).
- **Priority:** `Must` / `Should` / `Could`.
- **Done gate:** a spec is `Done` only when every `Must` FR and `Must` NFR is met or explicitly deferred with a reason recorded in its Changelog.
- **No code dumps:** specs describe modules, routes, flows, and data — not implementations.
- **Cross-links** use spec IDs (e.g. "see SPEC-006 §Refund").

## Design mockup

Reference wireframes/flow: <https://app.excalidraw.com/l/65VNwvy7c4X/5l50ctoqUXw>
(Provided by product owner. Screen behavior in specs takes precedence where they differ.)
