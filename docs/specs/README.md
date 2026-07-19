# Specifications

Source of truth for implementation scope and acceptance gates.

**Rule:** Spec first → implement → update spec → mark done.

## Where specs live

| Path | Purpose |
|------|---------|
| [`docs/specs/`](./) | Product + FE wiring specs |
| [`docs/specs/_SPEC_TEMPLATE.md`](_SPEC_TEMPLATE.md) | Copy source for new specs |
| [`BACKEND/spec/`](../../BACKEND/spec/) | Rental Portal API / domain specs |
| [`docs/RENTAL_ARCHITECTURE.md`](../RENTAL_ARCHITECTURE.md) | Boundaries, realms, data ownership |

## Active registry

| ID | Specification | Status | Prerequisites | Last updated |
|----|---------------|--------|---------------|--------------|
| SPEC-RMS-001 | [Rental Management System](rental-management-system.md) | Draft — pointer | Architecture | 2026-07-18 |
| SPEC-RMS-AUTH-001 | [Authentication & Authorization](rental-authentication-authorization.md) | In progress | SPEC-RMS-001 | 2026-07-18 |
| SPEC-CW-001 | [Customer Website ↔ backend integration](customer-website-integration.md) | In progress | RMS-001, AUTH-001, SPEC-004 | 2026-07-19 |
| SPEC-ADMIN-UI-00 | [Admin Shell & Nav](admin-ui-00-shell-and-nav.md) | Done | AUTH-001 | 2026-07-19 |
| SPEC-ADMIN-UI-09 | [Operations Dashboard FE](admin-ui-09-operations-dashboard.md) | Done | UI-00, SPEC-009 | 2026-07-19 |
| SPEC-ADMIN-UI-UX | [Clickable Data Table](admin-ui-ux-data-table.md) | Done | UI-00 | 2026-07-19 |
| SPEC-ADMIN-UI-10 | [Customers FE](admin-ui-10-customers.md) | Done | UI-UX | 2026-07-19 |
| SPEC-ADMIN-UI-13 | [Products FE](admin-ui-13-products.md) | Done | UI-UX | 2026-07-19 |
| SPEC-ADMIN-UI-RENTALS | [Rentals hub FE](admin-ui-rentals.md) | Done | UI-UX | 2026-07-19 |
| SPEC-ADMIN-UI-TODAY | [Today worklists FE](admin-ui-today-worklists.md) | Done | UI-RENTALS | 2026-07-19 |
| SPEC-ADMIN-UI-PAYMENTS | [Payments analytics & export FE](admin-ui-payments.md) | Done | UI-RENTALS | 2026-07-19 |
| SPEC-ADMIN-UI-INVOICE-PDF | [Invoice PDF + preview](admin-ui-invoice-pdf.md) | Done | UI-RENTALS | 2026-07-19 |
| SPEC-RFQ-001 | [Customer Quotation Requests (RFQ) + AI Comparison & Allocation](rental-quotation-rfq-ai.md) | Draft | RMS-001, AUTH-001, SPEC-002/003/004/005 | 2026-07-19 |
| SPEC-AI-PRICE-001 | [Pricing Intelligence & Release-Pressure AI](pricing-intelligence-ai.md) | Draft | RMS-001, AUTH-001, SPEC-019 | 2026-07-19 |
| SPEC-AI-COPILOT-001 | [Admin AI Copilot — RAG Support Chatbot](admin-ai-copilot-rag.md) | Draft | AI-PRICE-001 (harness), RMS-001, AUTH-001 | 2026-07-19 |
| — | [Admin UI Build Roadmap](admin-ui-BUILD-ROADMAP.md) | Active | — | 2026-07-19 |

## Phase order (master-admin)

1. Shell + dashboard (done).
2. **Now:** Ops MVP — table kit, customers, products, rentals, today, payments.

## Implementation rules (admin UI)

1. Read `admin-ui-BUILD-ROADMAP.md` then the active FE spec before changing `master-admin/`.
2. Do not add nav items without a FE wiring spec.
3. Call rental admin via `rentalGet` / `rentalCommand` only.
4. Update acceptance checkboxes only after evidence (build / manual).
5. No InstantCafe / VendorBridge product naming in UI copy.

## Validation

```bash
cd master-admin && npm run build
```

## Changelog

| Date | Change |
|------|--------|
| 2026-07-19 | Registered SPEC-RFQ-001 (customer RFQ + AI comparison/allocation), Draft. |
| 2026-07-19 | Ops MVP screens shipped; FE specs → Done; `master-admin` build green. |
| 2026-07-19 | Registered Ops MVP FE specs (UX + customers + products + rentals + today + payments). |
| 2026-07-19 | Hard reset + UI-09 dashboard shipped; UI-00/UI-09 → Done. |
| 2026-07-18 | Registered Phase 1 AUTH + thin master. |
