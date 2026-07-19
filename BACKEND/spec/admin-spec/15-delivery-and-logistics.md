# SPEC-015 — Delivery & Logistics

| Field | Value |
|-------|-------|
| ID | SPEC-015 |
| Status | Done (thin) |
| Owner | Product |
| Depends on | SPEC-000, 004, 007, 012, 013 |
| Referenced by | SPEC-009, 016, 017, 019 |

## Spec name

**ID:** SPEC-015
**Title:** Delivery & Logistics
**One line:** Admin management of delivery orders, drivers, vehicles, route/sequence planning, delivery & collection scheduling, proof-of-delivery, and delivery fees — extending the pickup/return workflow.

---

## What this spec does

Owns outbound **delivery** and inbound **collection** logistics for rentals whose
fulfillment is "delivery" (SPEC-004 FR-3), and route planning for store pickups. It
extends SPEC-007 (which owns the pickup/return state transitions) with the logistics
resources and execution around them.

**Out of scope:** the rental state transition on handover/return (SPEC-007 owns it),
deposit/late-fee (SPEC-006/008), inventory model (SPEC-013).

---

## How it works

```
 Confirmed rental (delivery fulfillment)
        │
        ▼
 DELIVERY ORDER created ──▶ assign DRIVER + VEHICLE ──▶ ROUTE/sequence plan (per day)
        │                                                    │
        ▼                                                    ▼
 Dispatch ──▶ deliver ──▶ PROOF OF DELIVERY (signature/photo/OTP) ──▶ SPEC-007 pickup-confirm
                                                                        (stock OUT)
 ...rental active...

 On return due:
 COLLECTION ORDER ──▶ driver collects OR customer returns to store ──▶ SPEC-007 return-confirm
                                                                        (inspection, stock IN)
```

**Resources & modules**

- `delivery-order` — one per rental delivery/collection leg; status lifecycle.
- `driver` / `vehicle` — fleet master data + availability.
- `route-plan` — daily sequence/route (bonus optimization → SPEC-011 FR-4).
- `proof-of-delivery` — signature/photo/OTP capture.
- `delivery-fee` — chargeable delivery cost (taxable via SPEC-014, billed via SPEC-017).

**Representative routes** (admin/dispatcher)

- `GET/POST/PATCH /admin/delivery-orders`, `POST /admin/delivery-orders/:id/assign`.
- `GET/POST/PATCH /admin/drivers`, `/admin/vehicles`.
- `GET /admin/routes?date=`, `POST /admin/delivery-orders/:id/pod`.
- `POST /admin/delivery-orders/:id/status` — dispatched/delivered/failed.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | A delivery order is created for delivery-fulfillment rentals. | Must |
| FR-2 | Admin can manage drivers and vehicles (fleet master). | Should |
| FR-3 | Admin can assign a driver + vehicle to a delivery/collection order. | Must |
| FR-4 | Daily delivery & collection schedules are viewable. | Must |
| FR-5 | Route/sequence planning for the day's deliveries. | Should |
| FR-6 | Proof of delivery captured (signature/photo/OTP). | Should |
| FR-7 | Delivery fee computed, taxed (SPEC-014), and billed (SPEC-017). | Should |
| FR-8 | Delivery status flows dispatched → delivered/failed, feeding SPEC-007 confirm. | Must |
| FR-9 | Failed delivery handling (reschedule / return to depot). | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Delivery status changes are consistent with rental state (SPEC-007) and idempotent. | Must |
| NFR-2 | Logistics writes are admin/dispatcher-role gated and audited. | Must |
| NFR-3 | POD artifacts (photo/signature) validated and stored safely. | Must |
| NFR-4 | Driver/vehicle double-booking prevented for overlapping slots. | Should |

---

## Accepted criteria

- [ ] FR-1 delivery order auto-created for delivery rentals.
- [ ] FR-3 assignment works; FR-4 daily schedules render.
- [ ] FR-6 POD captured and linked to the leg.
- [ ] FR-7 delivery fee taxed + billed.
- [ ] FR-8 delivered → triggers SPEC-007 pickup-confirm.
- [ ] NFR-1 status↔rental-state consistent and idempotent (test).
- [ ] NFR-4 driver double-booking blocked (test).

## Edge cases considered

- Store-pickup rentals → no delivery order (only optional route plan).
- Failed delivery / customer absent → reschedule, rental state unchanged.
- Driver/vehicle unavailable on the day.
- Partial delivery of a multi-item order.
- POD missing but item physically delivered (exception path).

## Testing guidelines

- Integration: delivery rental → order → assign → deliver+POD → SPEC-007 confirm → stock OUT.
- Negative: double-book driver; non-dispatcher write; failed-delivery reschedule.

## Security

**Done:** RBAC + audit (NFR-2), consistent/idempotent status (NFR-1), POD validation (NFR-3).
**Not yet done:** live GPS tracking / geofencing (bonus, SPEC-011); OTP anti-fraud.
**Vuln tests:** portal_user managing fleet; forged POD; replayed delivered-status double-confirm.

## Open questions

1. Own fleet, 3rd-party couriers, or both?
2. Is delivery fee flat, distance-based, or zone-based?
3. Is store pickup ever delivered, or strictly customer-collected?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done (thin) — Borzo dispatch + `GET /admin/deliveries?date=`; own-fleet drivers deferred.
