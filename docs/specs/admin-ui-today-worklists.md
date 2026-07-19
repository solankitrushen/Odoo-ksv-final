# SPEC-ADMIN-UI-TODAY — Today worklists (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-TODAY |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | UI-UX, UI-RENTALS, BACKEND SPEC-007 / 008 / 015 |
| Created | 2026-07-19 |

## Spec name

**Title:** Today’s pickups / returns / deliveries  
**One line:** Thin dated worklists; every row opens rental detail.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Pickups `GET /admin/pickups`. | Must |
| FR-2 | Returns `GET /admin/returns`. | Must |
| FR-3 | Deliveries `GET /admin/deliveries`. | Must |
| FR-4 | Row → `/rentals/:id`. | Must |
| FR-5 | Nav: Today’s pickups / returns / deliveries. | Must |

## Routes

`/today/pickups` · `/today/returns` · `/today/deliveries`

## Acceptance criteria

| Done | Requirement | Test / evidence |
|------|-------------|-----------------|
| [x] | FR-1…5 | Build + code review |

## Changelog

- 2026-07-19 — Ops MVP today worklists.
