# Admin UI — Build Roadmap (master-admin)

Ops MVP for non-tech day-to-day operators. API truth: [`BACKEND/spec/`](../../BACKEND/spec/).

## Pairing: FE spec ↔ BACKEND ↔ route

| Order | FE spec | BACKEND | Route | Status |
|------:|---------|---------|-------|--------|
| 0 | [admin-ui-00-shell-and-nav](admin-ui-00-shell-and-nav.md) | AUTH-001 / 010 | shell | Done |
| 1 | [admin-ui-09-operations-dashboard](admin-ui-09-operations-dashboard.md) | SPEC-009 | `/dashboard` | Done |
| — | [admin-ui-ux-data-table](admin-ui-ux-data-table.md) | — | shared kit | Done |
| 2 | [admin-ui-10-customers](admin-ui-10-customers.md) | SPEC-001 / 010 | `/customers` | Done |
| 3 | [admin-ui-13-products](admin-ui-13-products.md) | SPEC-002 / 003 | `/products` | Done |
| 4 | [admin-ui-rentals](admin-ui-rentals.md) | SPEC-004…008 | `/rentals` | Done |
| 5 | [admin-ui-today-worklists](admin-ui-today-worklists.md) | SPEC-007 / 008 / 015 | `/today/*` | Done |
| 6 | [admin-ui-payments](admin-ui-payments.md) | SPEC-006 / analytics | `/payments` | Done |
| 7 | [admin-ui-14-tax](admin-ui-14-tax.md) | SPEC-014 | `/settings/tax` | Done |
| 8 | [admin-ui-15-penalties](admin-ui-15-penalties.md) | SPEC-003 / 008 | `/settings/penalties` | Done |
| — | pricelists / assets / repairs | — | — | Deferred |

## Rules

1. Spec first → implement → acceptance → Done.
2. Nav link only when FE spec In progress / Done.
3. Whole-row click → detail when detail exists.
4. Plain labels for non-tech users.
5. `rentalGet` / `rentalCommand` only.

## Changelog

- 2026-07-19 — Ops MVP queue for non-tech admin rebuild.
