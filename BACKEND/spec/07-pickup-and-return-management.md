# SPEC-007 — Pickup & Return Management

| Field | Value |
|-------|-------|
| ID | SPEC-007 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 002, 006, 008 |
| Referenced by | SPEC-009 |

## Spec name

**ID:** SPEC-007
**Title:** Pickup & Return Management
**One line:** Streamlined daily pickup and return workflows — schedules, confirmations, product inspection, damage/missing-accessory handling, automatic stock updates, deposit settlement, and repair initiation.

---

## What this spec does

Owns the physical operational workflow that moves a rental through PICKUP and RETURN
states (SPEC-000). Drives stock updates, triggers deposit settlement (SPEC-006), and
feeds late-fee calculation (SPEC-008).

**Out of scope:** deposit math (SPEC-006), late-fee rules (SPEC-008), dashboard rollups
(SPEC-009).

---

## How it works

```
 PICKUP                                    RETURN
 ──────                                    ──────
 Daily pickup schedule                     Daily return schedule
   │  (route/sequence plan)                  │
   ▼                                         ▼
 Pickup checklist + scan (QR/barcode)      Product condition INSPECTION
   │  notify customer                        │  • damage report?
   ▼                                         │  • missing accessories?
 PICKUP CONFIRMED                            ▼
   │  stock ── (out)                       RETURN CONFIRMED
   ▼                                         │  stock ── (in / to-repair)
 state: IN USE (active rental)               ▼
                                           on time? ──▶ SPEC-008 (late?) ──▶ SPEC-006 settle
                                             │
                                             ├─ OK        → full deposit refund
                                             ├─ late      → penalty deducted
                                             └─ damaged   → deduction + REPAIR workflow
```

**Modules**

- `pickup-schedule` — daily list, route/sequence, confirmation, customer notify.
- `return-schedule` — daily list, inspection, confirmation.
- `inspection` — condition check, damage report, missing-accessory verification.
- `stock` — automatic decrement on pickup, increment/return-to-repair on return.
- `repair` — repair workflow initiation when damage found.

**Representative routes** (admin)

- `GET /pickups?date=`, `POST /pickups/:orderId/confirm`.
- `GET /returns?date=`, `POST /returns/:orderId/inspect`, `POST /returns/:orderId/confirm`.
- Confirm-return triggers SPEC-008 late check + SPEC-006 settlement.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin sees a daily **pickup schedule**. | Must |
| FR-2 | Admin can confirm pickup; stock is automatically decremented; rental → in-use. | Must |
| FR-3 | Pickup checklist supported. | Should |
| FR-4 | Customer is notified around pickup. | Should |
| FR-5 | Barcode/QR scanning supported for pickup/return. | Could |
| FR-6 | Route/sequence planning for pickups. | Could |
| FR-7 | Admin sees a daily **return schedule**. | Must |
| FR-8 | Return inspection records product condition. | Must |
| FR-9 | Damage reporting and missing-accessory verification supported. | Must |
| FR-10 | Admin confirms return; stock is automatically updated. | Must |
| FR-11 | Return confirmation triggers late-fee check (SPEC-008) and deposit settlement (SPEC-006). | Must |
| FR-12 | Damaged items initiate a repair workflow. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Stock updates on pickup/return are atomic with the state transition. | Must |
| NFR-2 | Confirm operations are idempotent (double-scan/double-submit safe). | Must |
| NFR-3 | Pickup/return actions are admin-only (RBAC) and audited (SPEC-000). | Must |
| NFR-4 | Inspection evidence (photos/notes) validated and stored safely. | Should |

---

## Accepted criteria

- [ ] FR-1/FR-7 daily schedules render by date.
- [ ] FR-2 pickup confirm decrements stock + sets in-use.
- [ ] FR-8/FR-9 inspection captures condition, damage, missing accessories.
- [ ] FR-10 return confirm updates stock.
- [ ] FR-11 return confirm triggers SPEC-008 + SPEC-006.
- [ ] FR-12 damage opens repair workflow.
- [ ] NFR-1 stock+state atomic (test).
- [ ] NFR-2 double-confirm safe (test).

## Edge cases considered

- Return earlier than due date.
- Return confirmed but settlement fails → atomicity/rollback.
- Partial return (some items of a multi-item order).
- Item returned damaged AND late → both deductions, bounded by deposit (SPEC-006).
- Missing accessories treated as damage/deduction.
- No-show at pickup / no-show at return (→ overdue, SPEC-008).

## Testing guidelines

- Integration: pickup confirm → in-use → return inspect → confirm → settlement.
- Negative: double-confirm; non-admin action; settlement failure rollback.

## Security

**Done:** atomic stock+state (NFR-1), idempotency (NFR-2), admin RBAC + audit (NFR-3).
**Not yet done:** signed/verified scan payloads. Defer.
**Vuln tests:** portal_user confirming return; replayed confirm double-updating stock.

## Open questions

1. Are pickups delivered by the business, or is "pickup" the customer collecting from store?
2. Repair workflow depth — status only, or full work-order lifecycle?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 1: inspection requires three photo URLs (front/side/back); optional Cloudinary upload `POST .../inspection/photos`; stores `rental.inspection` evidence. Deferred: daily pickup/return schedules.
- In progress — Step 2: `GET /admin/pickups?date=` + `GET /admin/returns?date=` daily schedules.
- Done — gap-close: schedules + repair WO.
