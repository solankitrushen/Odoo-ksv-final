# SPEC-ADMIN-UI-RENTALS — Rentals hub (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-RENTALS |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | UI-UX, BACKEND SPEC-004…008 |
| Created | 2026-07-19 |

## Spec name

**Title:** Rentals list / detail / create + lifecycle  
**One line:** Day-to-day rental hub with plain-language actions.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List `GET /admin/rentals`. | Must |
| FR-2 | Row → `/rentals/:id`. | Must |
| FR-3 | Detail `GET /admin/rentals/:id`. | Must |
| FR-4 | Create draft: customer + variant + dates → `POST /admin/rentals`. | Must |
| FR-5 | Detail actions: reserve/confirm/issue/return/confirm-delivery (status-gated). | Must |
| FR-6 | Dashboard overdue rows link here. | Must |
| FR-7 | Search (rental # / customer) + status filter + status chips. | Must |

## Routes

`/rentals` · `/rentals/new` · `/rentals/:id`

## Acceptance criteria

| Done | Requirement | Test / evidence |
|------|-------------|-----------------|
| [x] | FR-1…7 | Build + code review |

## Changelog

- 2026-07-19 — Ops MVP rentals hub.
- 2026-07-19 — Search, status filter, chips.
