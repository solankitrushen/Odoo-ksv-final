# Admin ERP Layer — Spec Suite (SPEC-012…019)

The back-office ERP the rental business runs on. These specs surround the rental
lifecycle ([SPEC-000](../00-overview-and-architecture.md)) with full admin capability:
product/inventory, tax, delivery, risk, finance, procurement, and analytics.

> **Parent suite:** the rental product specs (SPEC-000…011) live one level up in
> [`../README.md`](../README.md). This folder is the ERP extension of the admin side.
> **Reading order:** start at **SPEC-012** (module map), then follow the flow below.

## Index

| ID | Spec | Layer | Status | One line |
|----|------|-------|--------|----------|
| SPEC-012 | [ERP Overview & Admin Module Map](./12-erp-overview-and-admin-module-map.md) | Connective | Draft | How every ERP module fits together and plugs into the rental lifecycle. |
| SPEC-013 | [Product Master & Inventory](./13-product-master-and-inventory.md) | Master data | Draft | Product CRUD — categories, variants, serialized asset units, condition, multi-location stock. |
| SPEC-014 | [Tax Management](./14-tax-management.md) | Master data | Draft | Tax codes, rates, composite groups; deterministic tax; inclusive/exclusive; exemptions. |
| SPEC-018 | [Procurement & Suppliers](./18-procurement-and-suppliers.md) | Master data / buy-side | Draft | Suppliers, purchase orders, goods receipt into inventory, supplier bills into finance. |
| SPEC-015 | [Delivery & Logistics](./15-delivery-and-logistics.md) | Operations | Draft | Delivery/collection orders, drivers, vehicles, routes, POD, delivery fees. |
| SPEC-016 | [Risk Management](./16-risk-management.md) | Operations | Draft | Risk scoring, credit limits, blacklist, incidents, risk-based deposit/approval gating. |
| SPEC-017 | [Finance, Payments & Accounting](./17-finance-payments-and-accounting.md) | Finance | Draft | Payments/refunds, AR, deposit liability, tax payable, double-entry GL, reconciliation. |
| SPEC-019 | [Analytics & Business Intelligence](./19-analytics-and-business-intelligence.md) | Intelligence | Draft | Sales "hype"/trends, revenue & margin, utilization, customer & risk analytics, forecasting. |

## ERP flow — how it all connects

```
                         ┌─────────────── MASTER DATA (set up first) ───────────────┐
                         │                                                          │
   SPEC-018 Procurement ─┼─▶ buy stock ─▶ SPEC-013 Product Master & Inventory        │
   (suppliers, POs)      │               (categories, variants, asset units, stock) │
                         │                        │  every product carries a…       │
                         │                        ▼                                 │
                         │               SPEC-014 Tax class/codes                    │
                         └────────────────────────┬─────────────────────────────────┘
                                                  │ referenced & snapshotted at confirm
                                                  ▼
   ┌──────────────────────── RENTAL LIFECYCLE (SPEC-000..011, parent) ───────────────────────┐
   │  quotation/cart ─▶ CONFIRM ─▶ pay + deposit ─▶ pickup ─▶ active ─▶ return ─▶ settle       │
   └───┬───────────────────┬──────────────────────────┬───────────────────┬───────────────────┘
       │ gate at confirm    │ delivery fulfilment       │ money events       │ everything (read)
       ▼                    ▼                           ▼                    ▼
  SPEC-016 Risk        SPEC-015 Delivery &         SPEC-017 Finance,     SPEC-019 Analytics & BI
  (blacklist, limit,   Logistics (delivery/        Payments & Accounting (sales "hype", revenue,
   deposit uplift,     collection orders, POD,     (AR, GL, deposit       margin, utilization,
   approval, incidents) fees, routes)               liability, tax,        forecasting, reports)
       │                    │                        reconciliation)             ▲
       └── incident ────────┴──▶ deduction (SPEC-006) + claim ──▶ SPEC-017 ───────┘ reads all
```

**Read the flow as three passes:**

1. **Set up master data** — SPEC-018 buys stock which lands in SPEC-013; every product
   gets a SPEC-014 tax class. These are the source-of-truth entities everything else
   references (single owner per entity — SPEC-012 FR-1).
2. **Run operations** — at rental **confirm**, SPEC-016 gates who can rent and at what
   deposit; for delivery rentals SPEC-015 executes the logistics; every money movement
   posts to SPEC-017. All amounts are **snapshotted** onto the order at confirm so later
   master-data edits never rewrite a booked rental (SPEC-012 FR-2).
3. **Report** — SPEC-019 reads across all of the above (strictly read-only, SPEC-012
   FR-5) to produce sales/demand "hype", revenue, margin, utilization, and forecasts.

## Dependency & build order

```
 Phase 1 (master data)   : SPEC-013 Inventory ─▶ SPEC-014 Tax ─▶ SPEC-012 (glue/contracts)
 Phase 2 (money)         : SPEC-017 Finance   (needs 013/014 amounts + rental events)
 Phase 3 (operations)    : SPEC-016 Risk, SPEC-015 Delivery   (gate/execute the lifecycle)
 Phase 4 (buy-side)      : SPEC-018 Procurement   (feeds 013 + posts to 017)
 Phase 5 (intelligence)  : SPEC-019 Analytics/BI   (reads everything above)
```

| Spec | Depends on | Feeds |
|------|------------|-------|
| SPEC-012 | SPEC-000, 010 | all ERP specs (contracts) |
| SPEC-013 | SPEC-002, 003, 014 (tax class) | 005, 007, 015, 017, 018, 019 |
| SPEC-014 | SPEC-003, 013 | 005, 008, 017, 019 |
| SPEC-015 | SPEC-004, 007, 013 | 009, 016, 017, 019 |
| SPEC-016 | SPEC-004, 005, 006, 007, 008, 013 | 009, 017, 019 |
| SPEC-017 | SPEC-004, 005, 006, 008, 014, 015, 016 | 009, 019 |
| SPEC-018 | SPEC-013, 014, 017 | 013, 017, 019 |
| SPEC-019 | all operational + finance modules | 009 (dashboard) |

## Conventions

Same as the parent suite (see [`../README.md`](../README.md)):

- **Status flow:** `Draft` → `Approved` → `In progress` → `Done` (`Deferred` for parked scope).
- **Priority:** `Must` / `Should` / `Could`.
- **Cross-links** use spec IDs (e.g. "see SPEC-017 §GL"); IDs are stable regardless of folder.
- **No code dumps:** modules, routes, flows, and data only.

## Open questions spanning the ERP (decide before `Approved`)

1. **Sub-roles** beyond a single `admin` — accountant, warehouse, dispatcher, risk officer? (SPEC-012 Q1)
2. **MVP scope** — procurement (SPEC-018) and full double-entry GL (SPEC-017 FR-5) are heavy; first-release or later phase?
3. **Multi-store / multi-warehouse** master data and per-store data scoping? (SPEC-000 Open Q inherited)
4. **Payment** — real gateway vs recorded/manual (affects SPEC-017).
