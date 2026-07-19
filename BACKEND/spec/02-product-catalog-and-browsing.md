# SPEC-002 — Product Catalog & Browsing

| Field | Value |
|-------|-------|
| ID | SPEC-002 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, SPEC-003 (pricing/variants) |
| Referenced by | SPEC-004, SPEC-007 (stock) |

## Spec name

**ID:** SPEC-002
**Title:** Product Catalog & Browsing
**One line:** The rentable product catalog with availability, plus the portal browsing, search, and product-detail experience.

---

## What this spec does

Owns the **rentable product** entity and how portal users discover and inspect
products before renting. Surfaces availability for a chosen rental period so a user
never adds an unavailable item to the cart.

**Out of scope:** pricing math and variants definition (SPEC-003), cart/checkout
(SPEC-004), stock mutation on pickup/return (SPEC-007).

---

## How it works

```
  Portal user ──▶ Catalog list ──▶ filter/search ──▶ Product detail
                                                        │
                                          pick rental period (SPEC-003)
                                                        │
                                                        ▼
                                        availability check for [start,end]
                                          available? ──▶ "Add to cart" (SPEC-004)
                                          unavailable ─▶ show next free window
```

**Modules**

- `catalog` — product CRUD (admin side in SPEC-010), public read/list/search.
- `availability` — given a product + date range, compute rentable quantity.

**Representative routes**

- `GET /products` — list with filters (category, variant attrs, availability window).
- `GET /products/:id` — detail incl. images, description, base price ref.
- `GET /products/:id/availability?start=&end=` — availability for a window.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Portal user can browse a list of rentable products. | Must |
| FR-2 | User can view product detail (images, description, attributes, price). | Must |
| FR-3 | User can search/filter products (by name, category, variant attributes). | Should |
| FR-4 | System shows availability of a product for a selected rental period. | Must |
| FR-5 | Products expose their variants (brand, color, size, etc. — see SPEC-003). | Should |
| FR-6 | Unavailable products/periods are clearly indicated, not addable to cart. | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Availability is computed against confirmed rentals + stock, server-side. | Must |
| NFR-2 | Catalog listing p95 < 400ms for typical page sizes. | Should |
| NFR-3 | Product images validated and served efficiently. | Should |
| NFR-4 | Public catalog endpoints are read-only for portal users (RBAC). | Must |

---

## Accepted criteria

- [ ] FR-1 Catalog list renders.
- [ ] FR-2 Product detail renders with attributes + price.
- [ ] FR-4 Availability endpoint returns correct rentable qty for a window.
- [ ] FR-6 Unavailable item cannot be added to cart.
- [ ] NFR-1 Availability excludes overlapping confirmed rentals.

## Edge cases considered

- Overlapping rental windows partially consuming stock.
- Product with zero available units for a window.
- Rental window crossing an existing rental's return/late window.
- Variant out of stock while base product available.

## Testing guidelines

- Unit: availability calculation across overlapping ranges and quantities.
- Integration: create rental → availability for that window decreases.

## Security

**Done:** read-only public access (NFR-4), server-side availability (NFR-1).
**Not yet done:** abuse/scraping protection on public list. Defer.
**Vuln tests:** attempt write on public catalog route as portal_user → 403.

## Open questions

1. Is quantity-per-product supported (multiple identical units) or is each product unique?
2. Do we reserve stock at cart stage or only at confirmation? (impacts availability accuracy)

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 2 polish: public catalog `?q=` + `?categoryId=` filter. Cart blocks unavailable on add (SPEC-004).
- Done — gap-close: cart availability annotate + catalog `?q=`.
