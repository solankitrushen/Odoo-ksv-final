# SPEC-ADMIN-UI-15 — Penalties settings (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-15 |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | BACKEND SPEC-003 / 008 commercial rules |
| Created | 2026-07-19 |

## Spec name

**Title:** Penalty / late-fee rules  
**One line:** Admin manages late fees, grace, caps, and deposits via commercial rules.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List `GET /admin/commercial-rules` (late/grace/cap/deposit). | Must |
| FR-2 | Create via `POST /admin/commercial-rules`. | Must |
| FR-3 | Archive via `DELETE /admin/commercial-rules/:id`. | Must |
| FR-4 | Nav “Penalties”. | Must |

## Routes

`/settings/penalties`

## Changelog

- 2026-07-19 — Penalties settings screen.
