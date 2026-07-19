# SPEC-018 — Procurement & Suppliers

| Field | Value |
|-------|-------|
| ID | SPEC-018 |
| Status | Deferred (no Must FRs) |
| Owner | Product |
| Depends on | SPEC-000, 012, 013, 014, 017 |
| Referenced by | SPEC-013, 017, 019 |

## Spec name

**ID:** SPEC-018
**Title:** Procurement & Suppliers
**One line:** Manage suppliers, purchase orders, goods receipt into inventory, and supplier bills — so the rental fleet can be replenished, repaired stock re-sourced, and costs tracked.

---

## What this spec does

Owns how new rentable stock and repair parts enter the business: supplier master,
purchase orders, receiving goods into inventory (SPEC-013), and recording supplier bills
into finance (SPEC-017). This is the "buy side" that feeds the asset base the rental
system rents out.

**Out of scope:** the inventory/asset model itself (SPEC-013 owns it — this spec
increases it), GL mechanics (SPEC-017 owns posting).

---

## How it works

```
 Supplier master (vendor, contact, terms, tax id)
        │
        ▼
 PURCHASE ORDER (supplier, lines: product/asset, qty, cost, tax SPEC-014)
        │  status: draft → sent → confirmed
        ▼
 GOODS RECEIPT ──▶ create/increment AssetUnits & stock (SPEC-013)
        │            (serials captured, condition = NEW)
        ▼
 SUPPLIER BILL ──▶ Accounts Payable + GL posting (SPEC-017)
        │
        ▼
 payment to supplier (SPEC-017)
```

**Modules**

- `supplier` — vendor master + payment terms.
- `purchase-order` — PO lifecycle and lines.
- `goods-receipt` — receive against PO → inventory in (SPEC-013).
- `supplier-bill` — AP invoice → finance (SPEC-017).

**Representative routes** (admin/procurement)

- `GET/POST/PATCH /admin/suppliers`.
- `GET/POST/PATCH /admin/purchase-orders`, `POST /admin/purchase-orders/:id/confirm`.
- `POST /admin/purchase-orders/:id/receive` — goods receipt → stock in.
- `POST /admin/supplier-bills` → AP (SPEC-017).

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin can CRUD suppliers with contact and payment terms. | Should |
| FR-2 | Admin can create purchase orders with lines (product/asset, qty, cost, tax). | Should |
| FR-3 | Goods receipt against a PO creates/increments asset units & stock (SPEC-013). | Should |
| FR-4 | Supplier bills post to accounts payable and GL (SPEC-017). | Should |
| FR-5 | PO status lifecycle tracked (draft → sent → confirmed → received → billed). | Should |
| FR-6 | Partial receipts and partial billing supported. | Could |
| FR-7 | Procurement cost feeds asset cost basis for analytics/depreciation (SPEC-019). | Could |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Goods receipt → inventory increment is atomic and consistent (SPEC-013 NFR-2). | Must |
| NFR-2 | Procurement writes are admin/procurement-role gated and audited. | Must |
| NFR-3 | Money in minor units; supplier bill posts balanced to GL (SPEC-017 NFR-1). | Must |
| NFR-4 | Received quantity cannot exceed ordered (unless over-receipt explicitly allowed). | Should |

---

## Accepted criteria

- [ ] FR-1 supplier CRUD works.
- [ ] FR-2 PO with lines creatable and confirmable.
- [ ] FR-3 receipt increments stock/asset units (SPEC-013) atomically.
- [ ] FR-4 supplier bill creates AP + GL posting (SPEC-017).
- [ ] FR-5 status lifecycle enforced.
- [ ] NFR-1 receipt atomic (test).
- [ ] NFR-4 over-receipt blocked unless allowed (test).

## Edge cases considered

- Partial receipt then remainder later.
- Bill amount ≠ PO amount (price variance) → variance handling.
- Receiving serialized items → serial capture per unit (SPEC-013).
- Cancelling a PO after partial receipt.
- Supplier with pending bills cannot be hard-deleted.

## Testing guidelines

- Integration: PO → receive → stock up (SPEC-013) → bill → AP/GL (SPEC-017).
- Negative: over-receipt; non-procurement-role write; delete supplier with open bills.

## Security

**Done:** RBAC + audit (NFR-2), atomic receipt (NFR-1), balanced posting (NFR-3).
**Not yet done:** three-way match (PO↔receipt↔bill) automation; approval limits on POs.
**Vuln tests:** portal_user creating POs; inflated goods receipt; bill without PO.

## Open questions

1. Is procurement in MVP scope, or a later phase (all items are Should/Could)?
2. Track asset depreciation for owned rental assets (feeds SPEC-019)?
3. Approval workflow / spend limits on purchase orders?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Deferred — no Must FRs; fleet via asset CRUD until needed.
