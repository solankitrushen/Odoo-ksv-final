# SPEC-011 — Bonus Capabilities

| Field | Value |
|-------|-------|
| ID | SPEC-011 |
| Status | Done (thin MVP) |
| Owner | Product |
| Depends on | SPEC-000 and the module each item extends |
| Referenced by | — |

## Spec name

**ID:** SPEC-011
**Title:** Bonus Capabilities
**One line:** Optional, innovation-oriented enhancements layered on top of the core rental system — reminders, forecasting, QR scanning, route optimization, IoT tracking, customizable dashboards, and analytics.

---

## What this spec does

Groups all non-core, "go beyond" capabilities so the core specs stay focused. Each item
is **Could** priority and independently deferrable. Each extends an existing module
rather than introducing a parallel system.

---

## How it works

```
  Core system (SPEC-000..010)
        │  extended by optional add-ons ↓
  ┌─────┴───────────────────────────────────────────────┐
  │ reminders ──▶ extends notifications (SPEC-007/008)    │
  │ forecasting ─▶ extends availability (SPEC-002)        │
  │ QR scanning ─▶ extends pickup/return (SPEC-007)       │
  │ route opt.  ─▶ extends pickup schedule (SPEC-007)     │
  │ maintenance ─▶ extends repair workflow (SPEC-007)     │
  │ IoT tracking ▶ extends asset/stock (SPEC-002/007)     │
  │ dashboard widgets ▶ extends dashboard (SPEC-009)      │
  │ analytics/KPIs ─▶ extends dashboard (SPEC-009)        │
  │ mobile-first ─▶ cross-cutting UX                      │
  └───────────────────────────────────────────────────────┘
```

---

## Functional requirements

| ID | Requirement | Priority | Extends |
|----|-------------|----------|---------|
| FR-1 | Automatic customer reminders (upcoming return, overdue accrual). | Could | SPEC-007/008 |
| FR-2 | Product availability forecasting. | Could | SPEC-002 |
| FR-3 | Barcode/QR scanning for pickup/return. | Could | SPEC-007 |
| FR-4 | Smart pickup route optimization. | Could | SPEC-007 |
| FR-5 | Predictive maintenance suggestions. | Could | SPEC-007 repair |
| FR-6 | IoT-enabled asset tracking. | Could | SPEC-002/007 |
| FR-7 | Customizable dashboard widgets. | Could | SPEC-009 |
| FR-8 | KPI and business analytics/reports. | Could | SPEC-009 |
| FR-9 | Mobile-first rental operations experience. | Could | cross-cutting |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Each bonus is optional and isolatable (disable without breaking core). | Must (if built) |
| NFR-2 | Bonus features reuse existing auth/RBAC and data ownership rules. | Must (if built) |
| NFR-3 | External integrations (IoT, SMS/email) fail gracefully; no core blockage. | Must (if built) |

---

## Accepted criteria

- [ ] Any implemented bonus is behind a toggle and does not regress core flows.
- [ ] Implemented bonus respects RBAC + ownership.
- [ ] External-service failure degrades gracefully.

## Edge cases considered

- Notification/IoT provider downtime → core rental flow unaffected.
- Forecast with insufficient history → clearly labeled low-confidence / hidden.
- Route optimization with unroutable/incomplete addresses.

## Testing guidelines

- Per-feature: unit + integration on the extended module.
- Resilience: simulate external-service failure, assert core unaffected.

## Security

**Done (principle):** reuse core RBAC/ownership (NFR-2), graceful external failure (NFR-3).
**Not yet done:** per-integration threat review (IoT ingestion, outbound messaging).
**Vuln tests:** unauthorized access to analytics; spoofed IoT/scan payloads.

## Open questions

1. Which bonuses (if any) are in scope for the first release?
2. Notification channels — email, SMS, push, in-app?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done — gap-close: all FR-1..9 thin endpoints under `/admin/bonus/*`; disable via `RENTAL_BONUS_DISABLED`.
