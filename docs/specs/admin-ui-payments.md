# SPEC-ADMIN-UI-PAYMENTS — Payments analytics & export (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-PAYMENTS |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | UI-UX, UI-RENTALS, BACKEND SPEC-006 / SPEC-017 |
| Created | 2026-07-19 |
| Last updated | 2026-07-19 |

## Spec name

**Title:** Payments analytics, logs & export  
**One line:** Payments hub with date/customer filters, charts, full payment log, and CSV export.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List filtered payments via `GET /admin/payments` (from/to, customerId, method, status, direction). | Must |
| FR-2 | Row → `/rentals/:id` when `rentalId` present. | Must |
| FR-3 | Nav “Payments”. | Must |
| FR-4 | Show KPIs + charts from `GET /admin/analytics/payments` for the selected window. | Must |
| FR-5 | Date presets: this month, this quarter, last 30 days, last 6 months, custom. | Must |
| FR-6 | Filter by customer (and optionally method / status). | Must |
| FR-7 | Export filtered payment log as CSV via `GET /admin/payments/export`. | Must |
| FR-8 | Log table shows date, rental, customer, amount, method, direction, status. | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Money shown in INR via `formatRentalMoney`; amounts stay integer paise on the wire. | Must |
| NFR-2 | Charts reuse Recharts + existing range control patterns from dashboard. | Should |
| NFR-3 | Export capped (server) so a single download cannot dump unbounded rows. | Must |

## Routes

`/payments`

## API (BACKEND)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/payments` | Query: `page`, `limit`, `from`, `to`, `customerId`, `method`, `status`, `direction` |
| GET | `/admin/analytics/payments` | Query: `from`, `to`, `customerId`, `groupBy=day\|month` → summary + series + byMethod + byStatus + byCustomer |
| GET | `/admin/payments/export` | Same filters as list; returns enriched rows (max 5000) for CSV |

## Acceptance criteria

| Done | Requirement | Test / evidence |
|------|-------------|-----------------|
| [x] | FR-1…8 | `paymentAnalytics.test.js` PASS · `master-admin` build green |

## Changelog

- 2026-07-19 — Expanded from thin list to analytics + export.
- 2026-07-19 — Ops MVP payments thin list.
