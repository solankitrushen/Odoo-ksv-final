# SPEC-ADMIN-UI-10 — Customers (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-10 |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | UI-UX, BACKEND SPEC-001 / 010 |
| Created | 2026-07-19 |

## Spec name

**Title:** Customers list / detail / create  
**One line:** Non-tech admin manages customers; row opens detail.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List customers via `GET /admin/customers`. | Must |
| FR-2 | Row → `/customers/:id`. | Must |
| FR-3 | Detail via `GET /admin/customers/:id`. | Must |
| FR-4 | Create form → `POST /admin/customers` (displayName + required email + phone). | Must |
| FR-5 | Nav label “Customers”. | Must |

## Routes

`/customers` · `/customers/new` · `/customers/:id`

## Acceptance criteria

| Done | Requirement | Test / evidence |
|------|-------------|-----------------|
| [x] | FR-1…5 | Build + code review |

## Changelog

- 2026-07-19 — Ops MVP customers.
