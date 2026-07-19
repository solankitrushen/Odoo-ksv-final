# SPEC-ADMIN-UI-13 — Products (FE)

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-13 |
| Status | Done |
| Target repository | `master-admin` |
| Depends on | UI-UX, BACKEND SPEC-002 / 003 |
| Created | 2026-07-19 |

## Spec name

**Title:** Products list / detail / create  
**One line:** Catalog products with image, qty, tax, category; row opens editable detail (CRUD + stock).

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | List via `GET /admin/products` with image, category, tax, qty (stock rollup). | Must |
| FR-2 | Row → `/products/:id`. | Must |
| FR-3 | Detail via `GET /admin/products/:id` with edit (PATCH) + archive (DELETE). | Must |
| FR-4 | Create: sku, name, tax, category, brand, description, images, starting qty. | Must |
| FR-5 | Nav “Products”. | Must |
| FR-6 | Filters: search, category, status. | Must |
| FR-7 | Stock: add units via variants + asset batch; qty from `/admin/inventory/stock`. | Must |
| FR-8 | Status chips + ⋮ row actions (edit / deactivate / activate). | Must |
| FR-9 | Detail: read-first info, top-right Edit/Deactivate/Activate, metrics, rental history. | Must |
| FR-10 | Activate via `POST /admin/products/:id/restore`. | Must |

## Routes

`/products` (Add product = modal) · `/products/:id`  
Legacy `/products/new` redirects to `/products`.

## Acceptance criteria

| Done | Requirement | Test / evidence |
|------|-------------|-----------------|
| [x] | FR-1…10 | Build + code review |

## Changelog

- 2026-07-19 — Ops MVP products (no pricelists/assets).
- 2026-07-19 — Rich list + detail CRUD, images, stock qty.
- 2026-07-19 — Chips, ⋮ actions, metrics, history, restore.
- 2026-07-19 — Create moved to modal on `/products`; `/products/new` redirects.
