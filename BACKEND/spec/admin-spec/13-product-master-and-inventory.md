# SPEC-013 — Product Master & Inventory (Admin CRUD)

| Field | Value |
|-------|-------|
| ID | SPEC-013 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 002, 003, 012 |
| Referenced by | SPEC-005, 007, 015, 018, 019 |

## Spec name

**ID:** SPEC-013
**Title:** Product Master & Inventory (Admin CRUD)
**One line:** Full admin CRUD for the rentable product master — categories, SKUs, variants, individual asset units with serials, condition, and stock/availability across locations.

---

## What this spec does

Owns the **complete product master** and physical inventory the whole ERP references.
Expands SPEC-002 (portal read/browse) and SPEC-010 FR-1 (basic product create) into a
full CRUD + asset-unit + stock model. This is the single owner of product and stock
data (SPEC-012 FR-1).

**Out of scope:** pricing (SPEC-003), buying stock from suppliers (SPEC-018), moving
stock during pickup/return (SPEC-007 executes; this spec defines the stock model).

---

## How it works

```
 Category ──1:N── Product (template: name, desc, images, attributes, tax class)
                     │
                     ├─1:N── ProductVariant (brand/color/size — SPEC-003)
                     │
                     └─1:N── AssetUnit (a physical rentable item)
                                • serial / barcode / QR
                                • condition: NEW / GOOD / DAMAGED / REPAIR / RETIRED
                                • location / warehouse
                                • status: AVAILABLE / RESERVED / OUT / MAINTENANCE

 Stock (per product/variant/location) = count of AssetUnits by status
        │
        └─ availability(window) = units not RESERVED/OUT for overlapping rentals (SPEC-002)
```

**CRUD surface (admin)**

| Entity | Create | Read | Update | Delete/Archive |
|--------|:------:|:----:|:------:|:--------------:|
| Category | ✓ | ✓ | ✓ | archive |
| Product | ✓ | ✓ | ✓ | archive (guarded if active rentals) |
| ProductVariant | ✓ | ✓ | ✓ | archive |
| AssetUnit | ✓ | ✓ | ✓ | retire |

**Representative routes** (admin)

- `POST/GET/PATCH/DELETE /admin/categories`, `/admin/products`, `/admin/products/:id/variants`.
- `POST/GET/PATCH /admin/products/:id/units`, `POST /admin/units/:id/retire`.
- `GET /admin/inventory/stock?product=&location=` — stock rollup.
- `PATCH /admin/units/:id/condition` — condition transition (feeds SPEC-016 risk, SPEC-007 repair).

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin can create/read/update/archive product categories. | Must |
| FR-2 | Admin can CRUD products (name, description, images, attributes, tax class ref SPEC-014). | Must |
| FR-3 | Admin can CRUD product variants (brand, manufacturer, color, size — SPEC-003). | Must |
| FR-4 | Admin can register individual **asset units** with serial/barcode/QR. | Should |
| FR-5 | Each asset unit tracks condition (new/good/damaged/repair/retired) and location. | Should |
| FR-6 | System maintains stock counts and availability per product/variant/location. | Must |
| FR-7 | Product carries a **tax class** used by SPEC-014 at invoicing. | Must |
| FR-8 | Archiving/deleting a product referenced by active rentals is guarded. | Must |
| FR-9 | Bulk import/export of products (CSV) for onboarding. | Could |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Product/inventory writes are admin-only (or warehouse sub-role) and audited. | Must |
| NFR-2 | Stock mutations are atomic and consistent with rental state (SPEC-007 NFR-1). | Must |
| NFR-3 | Inputs validated at boundary (SKU uniqueness, non-negative stock, valid images). | Must |
| NFR-4 | Master edits snapshot onto booked rentals; no retro-change (SPEC-012 FR-2). | Must |
| NFR-5 | Availability query performant with indexes on product/location/date. | Should |

---

## Accepted criteria

- [ ] FR-1..FR-3 category/product/variant CRUD works and reflects in catalog (SPEC-002).
- [ ] FR-4/FR-5 asset units with serial + condition manageable.
- [ ] FR-6 stock rollup + availability correct across locations.
- [ ] FR-7 product tax class resolves at invoicing (SPEC-014).
- [ ] FR-8 archive guarded when active rentals exist (test).
- [ ] NFR-2 stock mutation atomic (test).
- [ ] NFR-4 booked rental unaffected by later product edit (test).

## Edge cases considered

- SKU/serial collision on create.
- Deleting a category containing products → block or cascade-archive.
- Asset unit set to DAMAGED/REPAIR → removed from availability (SPEC-007/016).
- Stock count vs asset-unit count divergence (reconciliation).
- Variant archived while base product active.
- Negative/zero stock attempts.

## Testing guidelines

- Unit: availability across locations + overlapping rentals; SKU uniqueness.
- Integration: create product → appears in catalog; retire unit → drops from availability.
- Negative: archive product with active rental; duplicate serial.

## Security

**Done:** admin/warehouse RBAC + audit (NFR-1), atomic stock (NFR-2), validation (NFR-3), snapshot protection (NFR-4).
**Not yet done:** warehouse sub-role definition (SPEC-012 Open Q); image malware scanning.
**Vuln tests:** portal_user CRUD on `/admin/products`; negative stock injection; archive-in-use bypass.

## Open questions

1. Serialized (unique asset units) vs bulk-quantity products — support both?
2. Multi-location/warehouse stock from day one, or single location?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — backend MVP: category/product/variant CRUD + archive, stock rollup (`GET /admin/inventory/stock`), asset condition patch + retire, FR-8 archive-in-use guards. **FR-7 tax class deferred** until SPEC-014. Flat `/api/v1/rental/admin/*` routes (no nested rewrite). Admin UI out of scope this pass.
- Done — gap-close: `locationId` in availability.
