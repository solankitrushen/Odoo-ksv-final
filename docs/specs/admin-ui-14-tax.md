# SPEC-ADMIN-UI-14 — Tax settings (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-14 |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | BACKEND SPEC-014 |
| Created | 2026-07-19 |

## Spec name

**Title:** Tax codes CRUD  
**One line:** Admin creates/edits/archives custom GST (tax) codes.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List via `GET /admin/tax/codes` with search + status filter + chips. | Must |
| FR-2 | Create via `POST /admin/tax/codes`. | Must |
| FR-3 | Edit via `PATCH /admin/tax/codes/:id` (If-Match). | Must |
| FR-4 | Archive via `DELETE /admin/tax/codes/:id`. | Must |
| FR-5 | Nav “Tax”. | Must |

## Routes

`/settings/tax`

## Changelog

- 2026-07-19 — Tax settings screen.
