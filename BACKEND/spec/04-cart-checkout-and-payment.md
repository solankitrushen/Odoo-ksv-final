# SPEC-004 — Cart, Checkout & Payment

| Field | Value |
|-------|-------|
| ID | SPEC-004 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 002, 003, 006 |
| Referenced by | SPEC-005, 007, 009 |

## Spec name

**ID:** SPEC-004
**Title:** Cart, Checkout & Payment (Portal self-service)
**One line:** Portal user builds a cart with rental periods, chooses delivery or store pickup, pays rental + security deposit, and downloads the invoice.

---

## What this spec does

Owns the **online self-service** path from "add to cart" to a confirmed, paid rental
order with an invoice the customer can download. This is the portal counterpart to the
admin quotation flow (SPEC-005) — both converge on the shared rental lifecycle (SPEC-000).

**Out of scope:** deposit rules/refunds (SPEC-006), pickup/return operations (SPEC-007),
invoice template header/footer (SPEC-005/010).

---

## How it works

```
 Add to cart ──▶ Cart review ──▶ Fulfillment choice ──▶ Payment ──▶ Order + Invoice
   (product,      (adjust qty,     ┌───────────────┐     rental       download
    period,        periods)        │ DELIVERY: addr │     + deposit
    dates)                         │ STORE PICKUP   │
                                   └───────────────┘
                                          │
                              order created in "confirmed" state (SPEC-000)
```

**Modules**

- `cart` — line items (product, variant, rental period, start/end dates, qty).
- `checkout` — fulfillment choice, address selection, totals (rental + deposit).
- `payment` — record/collect payment for rental + deposit.
- `order` — rental order creation, status, customer's order list.
- `address` — customer shipping/delivery addresses.

**Representative routes**

- `GET/POST/PATCH/DELETE /cart` and `/cart/items`.
- `GET/POST /me/addresses`.
- `POST /checkout` — validate availability + resolve price + create order.
- `POST /orders/:id/pay` — pay rental + deposit; transition to confirmed.
- `GET /orders`, `GET /orders/:id`, `GET /orders/:id/invoice` (download).

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | User can add a product with chosen variant, rental period, and start/end dates to a cart. | Must |
| FR-2 | User can review and modify cart (qty, periods, remove items). | Must |
| FR-3 | User chooses fulfillment: delivery (with address) or store pickup. | Must |
| FR-4 | User can add/select a delivery address. | Must |
| FR-5 | Checkout computes totals = rental price (SPEC-003) + security deposit (SPEC-006). | Must |
| FR-6 | User provides payment info and pays rental + deposit together. | Must |
| FR-7 | On successful payment, a confirmed rental order is created. | Must |
| FR-8 | User can download the invoice from the portal after payment. | Must |
| FR-9 | User can view and manage all their rental orders. | Must |
| FR-10 | Checkout re-validates availability before confirming (SPEC-002). | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Totals and deposit computed server-side; client-sent amounts rejected. | Must |
| NFR-2 | Order confirmation + payment + stock/availability update is atomic. | Must |
| NFR-3 | Payment credentials never persisted in plaintext; PCI-aware handling. | Must |
| NFR-4 | A user can only see/download their own orders and invoices (RBAC + ownership). | Must |
| NFR-5 | Idempotent payment: retrying the same payment does not double-charge/double-book. | Must |

---

## Accepted criteria

- [ ] FR-1..FR-4 cart + fulfillment + address flow works.
- [ ] FR-5 totals include correct rental + deposit.
- [ ] FR-6/FR-7 payment creates a confirmed order.
- [ ] FR-8 invoice downloadable by owner.
- [ ] FR-10 unavailable item blocks checkout.
- [ ] NFR-1 client-tampered amount rejected (test).
- [ ] NFR-2 partial failure rolls back cleanly (test).
- [ ] NFR-4 cross-user invoice access denied (test).

## Edge cases considered

- Item becomes unavailable between add-to-cart and checkout.
- Payment succeeds but order-write fails (and vice versa) → atomicity/rollback.
- Duplicate submit / network retry → idempotency.
- Store pickup selected → no delivery address required.
- Deposit = 0 configuration (SPEC-006).

## Testing guidelines

- Integration: full path add → checkout → pay → invoice download.
- Negative: tampered total, cross-user invoice fetch, double-submit.
- Concurrency: two users checkout the last available unit.

## Security

**Done:** server-side totals (NFR-1), atomic confirm (NFR-2), ownership checks (NFR-4), idempotency (NFR-5).
**Not yet done:** real gateway integration & PCI scope (NFR-3) — depends on Open Q in SPEC-000.
**Vuln tests:** amount tampering, IDOR on `/orders/:id/invoice`, replay of `/pay`.

## Open questions

1. Payment: real gateway or recorded/manual for MVP?
2. Is stock reserved at cart stage or only at checkout?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 2: `RentalCart` + customer cart CRUD/preview/checkout → draft; payment stays on existing rental checkout. Invoice PDF download on customer rental. Deferred: multi-window cart lines; reserve-at-cart.
- Done — gap-close: multi-window cart (reserve-at-cart Open Q deferred).
