# SPEC-009 — Rental Operations Dashboard

| Field | Value |
|-------|-------|
| ID | SPEC-009 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 004, 005, 006, 007, 008 |
| Referenced by | — |

## Spec name

**ID:** SPEC-009
**Title:** Rental Operations Dashboard
**One line:** A real-time operational dashboard giving rental managers visibility into active/overdue/due-today rentals, upcoming pickups/returns, revenue, deposits held, and late-fee collection — so they can prioritize daily work.

---

## What this spec does

Owns the aggregation/read layer that rolls up data from orders, rentals, deposits,
pickups/returns, and penalties into actionable KPIs and worklists. It is **read-only**
over data owned by other specs; it never mutates rentals.

**Out of scope:** the operations themselves (SPEC-007), fee/deposit math (SPEC-006/008).
Customizable widgets are a bonus (SPEC-011).

---

## How it works

```
                         ┌──────────────── DASHBOARD ────────────────┐
  orders (004/005) ─────▶│  Active Rentals     Rentals Due Today       │
  rentals  (000)  ─────▶│  Upcoming Pickups    Upcoming Returns        │
  pickups  (007)  ─────▶│  Overdue Rentals ⚠   Revenue from Rentals     │
  deposits (006)  ─────▶│  Security Deposits Held                       │
  penalties(008)  ─────▶│  Late Fee Collection                         │
                         └───────────────────────────────────────────┘
                                    │ click a KPI ─▶ drill into worklist
                                    ▼
                     (e.g. Overdue → list → jump to SPEC-007 return action)
```

**Modules**

- `dashboard-metrics` — computes each KPI from source data.
- `worklists` — drill-down lists (due today, overdue, upcoming pickups/returns).

**Representative routes** (admin)

- `GET /dashboard/summary` — all KPIs in one payload.
- `GET /dashboard/overdue`, `/dashboard/due-today`, `/dashboard/pickups?date=`, `/dashboard/returns?date=`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Show count/value of **Active Rentals**. | Must |
| FR-2 | Show **Rentals Due Today**. | Must |
| FR-3 | Show **Upcoming Pickups**. | Must |
| FR-4 | Show **Upcoming Returns**. | Must |
| FR-5 | Show **Overdue Rentals**, highlighted for attention. | Must |
| FR-6 | Show **Revenue from Rentals**. | Must |
| FR-7 | Show **Security Deposits Held**. | Must |
| FR-8 | Show **Late Fee Collection**. | Must |
| FR-9 | KPIs are drillable into actionable worklists. | Should |
| FR-10 | Dashboard reflects near real-time state. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Summary endpoint p95 < 800ms at expected data volume. | Should |
| NFR-2 | Metrics are computed consistently with source-of-truth specs (no drift). | Must |
| NFR-3 | Dashboard is admin-only (RBAC). | Must |
| NFR-4 | Read-only: dashboard never mutates rental/deposit/penalty state. | Must |

---

## Accepted criteria

- [ ] FR-1..FR-8 each KPI returns correct value against seeded data.
- [ ] FR-5 overdue list matches SPEC-008 detector.
- [ ] FR-7 deposits held matches SPEC-006 held sum.
- [ ] FR-8 late-fee collection matches SPEC-008 collected sum.
- [ ] NFR-3 non-admin blocked (test).

## Edge cases considered

- Timezone/day-boundary for "due today" and "upcoming".
- Empty state (no rentals) renders zeros, not errors.
- Large volume performance (pagination on worklists).
- Revenue definition: booked vs collected (see Open Q).

## Testing guidelines

- Integration: seed known rentals/deposits/penalties → assert each KPI.
- Cross-check dashboard sums against SPEC-006/008 source queries.

## Security

**Done:** admin RBAC (NFR-3), read-only (NFR-4).
**Not yet done:** per-store scoping if multi-tenant (SPEC-000 Open Q).
**Vuln tests:** portal_user hitting `/dashboard/*` → 403.

## Open questions

1. Revenue = confirmed/booked, or actually collected? Include deposits or exclude?
2. Definition window for "upcoming" pickups/returns (next 24h? 7 days?).

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done — gap-close: dashboard/overdue.
