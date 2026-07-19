# SPEC-003 — Pricing & Attributes

| Field | Value |
|-------|-------|
| ID | SPEC-003 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000 |
| Referenced by | SPEC-002, 004, 005, 008 |

## Spec name

**ID:** SPEC-003
**Title:** Pricing & Attributes
**One line:** A default pricelist applied to all products, plus custom and time-bound pricelists, configurable rental periods, and product variants (brand, manufacturer, color, size).

---

## What this spec does

Owns how a rental price is determined for a product over a rental period, and the
attribute/variant model that distinguishes product units. Every quotation, cart, and
invoice resolves price through this spec.

**Out of scope:** deposit amounts (SPEC-006), late-fee rules (SPEC-008), catalog display (SPEC-002).

---

## How it works

```
  Product + Variant  ┐
  Rental period      ├──▶  PRICE RESOLUTION  ──▶ unit rental price
  Date of rental     ┘         │
                               ├─ default pricelist (always exists, fallback)
                               ├─ custom pricelist (if assigned & applicable)
                               └─ time-bound pricelist (if date in its window)
                                    → most specific / highest-priority match wins
```

**Rental period** = a reusable unit of rental duration (e.g. hourly, daily, weekly,
monthly) with its associated rate on a pricelist.

**Modules**

- `pricelist` — default + custom + time-bound lists; price lines per product/period.
- `rental-period` — definition of period units used across pricing and late fees.
- `attributes` — variant attributes (brand, manufacturer, color, size) and product variants.

**Representative routes** (admin-managed, read at checkout)

- `GET /pricelists`, `POST /pricelists` (admin), price resolution used internally.
- `GET /rental-periods`, `POST /rental-periods` (admin).
- `GET /products/:id/variants`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Exactly one **default pricelist** exists and applies to all products by default. | Must |
| FR-2 | Admin can create multiple additional pricelists. | Should |
| FR-3 | A pricelist can be **time-bound** (valid only within a date window). | Should |
| FR-4 | Admin can define rental periods (hourly/daily/weekly/monthly). | Must |
| FR-5 | Price resolution picks the correct applicable pricelist for a product + period + date. | Must |
| FR-6 | Admin can create product variants via attributes (brand, manufacturer, color, size). | Should |
| FR-7 | Variants may carry their own price differences where configured. | Could |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Price resolution is deterministic and server-side; client never sets price. | Must |
| NFR-2 | Money computed in integer minor units (no float drift). | Must |
| NFR-3 | Priority/precedence between overlapping pricelists is explicit and documented. | Must |
| NFR-4 | Pricelist/period/attribute writes are admin-only (RBAC). | Must |

---

## Accepted criteria

- [ ] FR-1 Default pricelist seeded and applied when no other matches.
- [ ] FR-4 Rental periods definable and selectable.
- [ ] FR-5 Resolution returns correct price for product+period+date across pricelist types.
- [ ] NFR-2 Money math uses minor units end-to-end.
- [ ] NFR-3 Precedence rule documented and covered by test.

## Edge cases considered

- Two applicable pricelists overlap in time → precedence resolves deterministically.
- No custom/time-bound match → default pricelist used.
- Rental period not on the selected pricelist → fallback/behavior defined.
- Variant without explicit price inherits base product price.

## Testing guidelines

- Unit: price resolution matrix (default vs custom vs time-bound, in/out of window).
- Unit: minor-unit money arithmetic, rounding rules.

## Security

**Done:** server-side resolution (NFR-1), admin-only writes (NFR-4).
**Not yet done:** audit of pricelist changes (link to SPEC-000 audit trail).
**Vuln tests:** client attempts to override resolved price at checkout → ignored.

## Open questions

1. Precedence order when multiple pricelists apply — by priority field, specificity, or date?
2. Are variant prices absolute or deltas on base price?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — backend MVP wire:
  - Admin pricelist CRUD + rate CRUD under `/api/v1/rental/admin` (default uniqueness; cannot archive default).
  - `GET /admin/rental-periods` read-only from platform `PERIOD_CODES` / `UNIT_MINUTES` (FR-4 MVP; not tenant-definable).
  - Public `GET /public/:slug/catalog/:productId` (+ variants) attaches display rates via variant→product→default ladder on the **default** pricelist (matches checkout `resolveLinePricing`).
  - **Deferred:** custom/time-bound pricelist *selection* in resolver (FR-2/3/5 full), attribute dictionary (FR-6 harden), variant price deltas (FR-7).
- Done — gap-close: custom/time-bound pricelist resolve.
