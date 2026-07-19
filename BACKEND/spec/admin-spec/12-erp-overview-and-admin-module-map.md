# SPEC-012 — ERP Overview & Admin Module Map

| Field | Value |
|-------|-------|
| ID | SPEC-012 |
| Status | Draft |
| Owner | Product |
| Depends on | SPEC-000, SPEC-010 |
| Referenced by | SPEC-013…019 |

## Spec name

**ID:** SPEC-012
**Title:** ERP Overview & Admin Module Map
**One line:** The connective spec for the admin ERP layer — how product/inventory, tax, delivery, risk, finance, procurement, and analytics modules fit together and plug into the rental lifecycle (SPEC-000).

---

## What this spec does

SPEC-000 defined the rental lifecycle and the light admin config (SPEC-010). This spec
expands the **admin side into a full ERP** the rental business runs on. It owns the
module map, the shared master-data ownership rules, and the cross-module data flow. It
does **not** redefine the rental lifecycle — it surrounds it with back-office capability.

**Boundary:** vocabulary + module boundaries + data-flow contracts for the ERP admin
layer. Each module's behavior lives in its own spec (SPEC-013…019).

**Outcome:** one place that answers "which admin module owns this data and how does it
reach a rental order / invoice / deposit?"

---

## ERP module map

```
                         ┌─────────────────────── ADMIN ERP LAYER ───────────────────────┐
                         │                                                                │
  MASTER DATA            │  SPEC-013 Product Master & Inventory  (product CRUD, SKU,       │
  (the source of truth)  │            categories, asset units, serials, stock)            │
                         │  SPEC-014 Tax Management            (tax codes, rates, groups)  │
                         │  SPEC-018 Procurement & Suppliers   (vendors, POs, stock in)    │
                         ├────────────────────────────────────────────────────────────────┤
  OPERATIONS             │  SPEC-015 Delivery & Logistics      (delivery orders, drivers,  │
                         │            vehicles, routes, POD) ── extends SPEC-007            │
                         │  SPEC-016 Risk Management           (customer risk, credit,     │
                         │            blacklist, damage/fraud, deposit risk)               │
                         ├────────────────────────────────────────────────────────────────┤
  FINANCE                │  SPEC-017 Finance, Payments & Accounting (AR, GL, payments,     │
                         │            refunds, reconciliation) ── consumes 005/006/008/014 │
                         ├────────────────────────────────────────────────────────────────┤
  INTELLIGENCE           │  SPEC-019 Analytics & BI            (sales trends/"hype",       │
                         │            utilization, forecasting, KPI reports)               │
                         └────────────────────────────────────────────────────────────────┘
                                              │  all plug into ↓
                         ┌────────────────────┴───────────────────────────────────────────┐
                         │        RENTAL LIFECYCLE (SPEC-000: quote→pay→pickup→return)      │
                         └────────────────────────────────────────────────────────────────┘
```

## How master data reaches a rental

```
  Product Master (013) ──┐
  Tax (014) ─────────────┤
  Pricing (003) ─────────┼──▶ Quotation/Order line (005/004) ──▶ Invoice (005/017)
  Deposit rule (006/010) ┘                                          │
                                                                    ▼
  Delivery (015) ◄── pickup/return (007) ─────────────▶ Finance/GL (017)
  Risk (016) gates confirmation, deposit %, blacklist ─▶ order acceptance
  Analytics (019) reads everything (read-only) ────────▶ dashboards/reports
```

**Ownership rule:** every data element has exactly one owning module (master). Other
modules **reference** it and **snapshot** the values they need onto the rental order at
confirmation (so later master-data edits never retro-alter a booked rental — see
SPEC-010 NFR-4).

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | ERP admin modules share one master-data model with single-owner-per-entity. | Must |
| FR-2 | Rental orders snapshot product, tax, price, and deposit values at confirmation. | Must |
| FR-3 | Every ERP module is reachable only through the admin backend under RBAC. | Must |
| FR-4 | Cross-module actions (e.g. return → GL posting) flow through defined contracts, not ad-hoc reads. | Must |
| FR-5 | Analytics/BI reads are isolated and never mutate operational data. | Must |
| FR-6 | Modules are independently deployable/disableable where not on the core rental path. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | All ERP writes are admin-role (or finer sub-role) gated and audited (SPEC-000). | Must |
| NFR-2 | Money is integer minor units everywhere; one currency policy (SPEC-000 Open Q). | Must |
| NFR-3 | Master-data changes are versioned/audited; in-use references are guarded. | Must |
| NFR-4 | Cross-module contracts are transactional or use reliable events (no lost postings). | Must |

---

## Accepted criteria

- [ ] FR-1 each ERP entity has a documented single owner (this spec's table).
- [ ] FR-2 booked rental unaffected by later master-data edits (test with SPEC-013/014).
- [ ] FR-4 return-confirm reliably posts to finance (SPEC-017).
- [ ] FR-5 analytics path is read-only (test).
- [ ] NFR-1 non-admin blocked across all ERP routes.

## Edge cases considered

- Master-data edit mid-rental → snapshot protects the booked order.
- Module disabled (e.g. delivery off for store-only business) → core rental still works.
- Event/posting failure between modules → ret/replay, no double-post (idempotency).

## Testing guidelines

- Contract tests per cross-module boundary (013→005, 007→017, 014→005, 016→004/005).
- Integration: confirm rental → verify snapshots + GL posting + analytics visibility.

## Security

**Done:** RBAC + audit (NFR-1), guarded master edits (NFR-3), read-only analytics (FR-5).
**Not yet done:** finer sub-roles (accountant, warehouse, dispatcher) — define in SPEC-017/013/015.
**Vuln tests:** portal_user hitting any `/admin/erp/*`; cross-module posting tampering.

## Open questions

1. Sub-roles beyond a single "admin" (accountant, warehouse, dispatcher, risk officer)?
2. Event bus vs synchronous transactions for cross-module contracts?
3. Single-store vs multi-store/warehouse master data (inherits SPEC-000 Open Q).

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial ERP module map extending the admin layer.
