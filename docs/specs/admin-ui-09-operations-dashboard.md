# SPEC-ADMIN-UI-09 — Operations Dashboard (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-09 |
| Status | Done |
| Owner | Product |
| Target repository | `master-admin` |
| Depends on | SPEC-ADMIN-UI-00, BACKEND [SPEC-009](../../BACKEND/spec/09-rental-operations-dashboard.md) |
| Created | 2026-07-19 |

## Spec name

**ID:** SPEC-ADMIN-UI-09  
**Title:** Rental Operations Dashboard (Admin UI)  
**One line:** Master-admin `/dashboard` shows live ops KPIs and an overdue worklist wired to rental admin APIs.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Show **Active Rentals** count. | Must |
| FR-2 | Show **Rentals Due Today** count. | Must |
| FR-3 | Show **Upcoming Pickups** count. | Must |
| FR-4 | Show **Upcoming Returns** count. | Must |
| FR-5 | Show **Overdue Rentals** count (highlighted). | Must |
| FR-6 | Show **Revenue from Rentals** (money). | Must |
| FR-7 | Show **Security Deposits Held** (money). | Must |
| FR-8 | Show **Late Fee Collection** (money). | Must |
| FR-9 | Show overdue worklist from API on same page. | Should |
| FR-10 | Loading and error states with retry. | Must |
| FR-11 | Page is read-only (no mutations). | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Uses `rentalGet` against admin dashboard APIs only. | Must |
| NFR-2 | Money rendered via shared paise formatter (INR). | Must |
| NFR-3 | Admin-only (inherits shell RBAC). | Must |
| NFR-4 | KPI labels match SPEC-009 language (no InstantCafe copy). | Must |

## What this spec does

### In scope

- `/dashboard` page UI + React Query fetch
- Overdue list section (Should)

### Out of scope

- Drill routes to rentals/returns (later FE specs)
- Widget customization (BACKEND SPEC-011)

## How it works

```
/dashboard
  ├─ GET /api/v1/rental/admin/dashboard     → counts + money KPIs
  └─ GET /api/v1/rental/admin/dashboard/overdue → worklist rows
```

Proxy path in app: `rentalGet("/admin/dashboard")`, `rentalGet("/admin/dashboard/overdue")`.

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [x] | FR-1…8 | Eight KPIs render from live API | `dashboard/page.tsx` + `npm run build` |
| [x] | FR-9 | Overdue table/list visible when items exist | Same page → `GET /admin/dashboard/overdue` |
| [x] | FR-10 | Error shows retry | `ErrorState` + refetch |
| [x] | FR-11 | No write buttons on page | Code review (read-only queries) |
| [x] | NFR-2 | Money shows currency formatting | `formatRentalMoney` |

## Edge cases

- Empty tenant → zeros / empty overdue list
- API 401 → auth layer redirects
- Partial money null → show em dash

## Testing guidelines

```bash
cd master-admin && npm run build
# Manual: login as rental admin → /dashboard KPIs match GET /admin/dashboard
```

## Security

| Area | Status | Notes |
|------|--------|-------|
| Authn | done | shell |
| Authz | done | admin JWT |
| Secrets / PII | done | overdue may show customer name from API snapshot |

## Open questions

- None.

## Changelog

- 2026-07-19 — Overdue worklist: more bottom spacing + pagination; seed adds **200** `R-DEMO-OD-*` rows across last 90 days (API total ≈ 201 with `R-DEMO-OVERDUE`).
- 2026-07-19 — Analytics range: Vercel-style single dropdown (presets + Custom last → calendar). Start/End text fields removed.
- 2026-07-19 — Analytics **Custom** range uses popover date-range picker (calendar + Apply).
- 2026-07-19 — Dashboard + overdue worklist shipped; acceptance checked.
- 2026-07-19 — Initial FE wiring for hard-reset dashboard rebuild.
