# SPEC-019 — Analytics & Business Intelligence

| Field | Value |
|-------|-------|
| ID | SPEC-019 |
| Status | Done (thin) |
| Owner | Product |
| Depends on | SPEC-000, 004, 005, 006, 007, 008, 013, 014, 015, 016, 017, 018 |
| Referenced by | SPEC-009 |

## Spec name

**ID:** SPEC-019
**Title:** Analytics & Business Intelligence
**One line:** A read-only analytical layer over the whole ERP — sales trends and "hype"/demand signals, revenue and margin, product utilization, customer and risk analytics, forecasting, and exportable KPI reports.

---

## What this spec does

Owns the **decision-support** layer: it aggregates operational data (rentals, finance,
inventory, risk, procurement) into trends, rankings, forecasts, and reports so managers
can see what's selling, what's hot ("hype"), what's underused, and where money and risk
concentrate. Extends the operational dashboard (SPEC-009), which stays focused on
today's worklists.

**Out of scope:** operational KPIs/worklists (SPEC-009), mutating any source data
(strictly read-only — SPEC-012 FR-5), customizable widget UI (bonus SPEC-011 FR-7).

---

## How it works

```
        SOURCES (read-only, via reporting views / read replica)
        ─────────────────────────────────────────────────────
  rentals(004/005) · finance(017) · deposits(006) · late-fees(008)
  inventory(013) · delivery(015) · risk(016) · procurement(018) · tax(014)
                                   │
                                   ▼
                        ┌───────────────────────┐
                        │   ANALYTICS ENGINE     │  (aggregations, time-series,
                        │   (metrics + trends)   │   cohorts, rankings, forecast)
                        └───────────┬───────────┘
                                    ▼
   ┌───────────── ANALYTICAL OUTPUTS ─────────────────────────────────────┐
   │ Sales & "hype":  top products by bookings/velocity, trending ↑↓,      │
   │                  demand spikes, conversion (cart→confirmed)           │
   │ Revenue:         gross/net revenue, by product/category/period,       │
   │                  rental vs penalty vs delivery, margin (cost SPEC-018)│
   │ Utilization:     asset utilization %, idle stock, turnaround time     │
   │ Customer:        LTV, repeat rate, cohort retention, top customers    │
   │ Risk:            overdue/damage/loss rates, deposit forfeiture trend  │
   │ Forecast:        demand & availability forecast (bonus SPEC-011 FR-2) │
   └───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
             Dashboards · scheduled reports · CSV/PDF export
```

**"Sales hype" defined:** a demand-velocity signal per product = normalized rate of
recent bookings/views vs its trailing baseline, surfaced as **trending up / down /
spiking**, plus a leaderboard. It flags what's hot early so managers can adjust stock
(SPEC-018) and pricing (SPEC-003).

**Modules**

- `metrics-engine` — parameterized aggregations (period, product, category, customer).
- `trends` — time-series + velocity/"hype" scoring + rankings.
- `forecast` — demand & availability projection (ties to SPEC-011 FR-2).
- `reports` — saved/scheduled reports, export.

**Representative routes** (admin/analyst)

- `GET /admin/analytics/sales?from=&to=&groupBy=` — bookings/revenue trends.
- `GET /admin/analytics/hype` — trending/velocity leaderboard.
- `GET /admin/analytics/utilization`, `/customers`, `/risk`.
- `GET /admin/analytics/forecast?product=`.
- `POST /admin/reports` (define), `GET /admin/reports/:id/export?format=csv|pdf`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Sales trend analytics: bookings & revenue over time, by product/category/period. | Must |
| FR-2 | "Hype"/demand-velocity ranking: trending-up/down and spiking products. | Should |
| FR-3 | Revenue breakdown: rental vs penalty vs delivery; gross vs net; margin using cost (SPEC-018). | Must |
| FR-4 | Asset utilization %, idle stock, and average turnaround time (SPEC-007/013). | Should |
| FR-5 | Customer analytics: LTV, repeat rate, cohort retention, top customers. | Should |
| FR-6 | Risk analytics: overdue/damage/loss rates, deposit forfeiture trend (SPEC-016). | Should |
| FR-7 | Demand & availability forecasting. | Could |
| FR-8 | Conversion funnel: browse → cart → checkout → confirmed (SPEC-002/004). | Should |
| FR-9 | Saved, scheduled, and exportable (CSV/PDF) reports. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Strictly read-only over source data; never mutates operational state (SPEC-012 FR-5). | Must |
| NFR-2 | Analytics reads isolated (reporting views / read replica) so they don't degrade live ops. | Should |
| NFR-3 | Metrics reconcile with source-of-truth modules (finance SPEC-017, deposits SPEC-006). | Must |
| NFR-4 | Analytics access is admin/analyst-role gated; respects data scope (per-store if multi-tenant). | Must |
| NFR-5 | Report queries are bounded/paginated; heavy aggregations cached with clear freshness. | Should |

---

## Accepted criteria

- [ ] FR-1 sales trend returns correct bookings/revenue by group against seeded data.
- [ ] FR-2 hype ranking flags a seeded demand spike.
- [ ] FR-3 revenue split + margin computed correctly (reconciles with SPEC-017).
- [ ] FR-4 utilization/idle/turnaround correct.
- [ ] FR-8 funnel conversion computed.
- [ ] FR-9 CSV/PDF export works.
- [ ] NFR-1 no write path exists (test).
- [ ] NFR-3 revenue total matches finance total (test).

## Edge cases considered

- Sparse data / new product with no history → hype/forecast labeled low-confidence or hidden.
- Timezone and period-boundary consistency with SPEC-009.
- Revenue definition (booked vs collected) aligned with SPEC-009 Open Q.
- Cancelled/refunded rentals excluded/adjusted in revenue.
- Large date ranges → pagination/caching (NFR-5).
- Margin needs cost basis; if procurement (SPEC-018) absent → margin hidden.

## Testing guidelines

- Unit: velocity/"hype" scoring; utilization %; funnel conversion; forecast baseline.
- Integration/reconciliation: analytics revenue == SPEC-017 revenue; deposits held == SPEC-006.
- Negative: attempt any write via analytics route → rejected; non-analyst access → 403.

## Security

**Done:** read-only (NFR-1), reconciliation (NFR-3), RBAC + data scope (NFR-4).
**Not yet done:** row/column-level data scoping for sub-roles; PII minimization in exports.
**Vuln tests:** write attempt on analytics endpoint; cross-store data leak; unauthorized export.

## Open questions

1. Revenue = booked or collected (must match SPEC-009)? Include/exclude deposits and tax?
2. Hype window & baseline (7-day vs 30-day trailing)? Views tracked, or bookings only?
3. Forecasting method — simple moving average (MVP) vs ML later?
4. Live queries vs nightly-materialized reporting tables?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done (thin) — `GET /admin/analytics/sales` + `/analytics/revenue`.
