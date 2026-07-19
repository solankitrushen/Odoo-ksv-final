# SPEC-000 — Overview & Architecture

| Field | Value |
|-------|-------|
| ID | SPEC-000 |
| Status | Draft |
| Owner | Product |
| Depends on | — |
| Referenced by | All specs |

## Spec name

**ID:** SPEC-000
**Title:** Rental Management System — Overview & Architecture
**One line:** Defines the whole-system product flow, actor roles, domain model, and the master rental lifecycle state machine that every other spec builds on.

---

## What this spec does

Establishes the shared foundation for the Rental Management System (RMS): a platform
that lets a rental business run its **complete rental lifecycle** — from a customer
browsing products online to deposit settlement after return — from a single
operational interface, while automating repetitive workflows (late-fee calculation,
overdue detection, deposit reconciliation, scheduling).

**Boundary:** this spec owns vocabulary, roles, the domain entity map, the rental
state machine, and cross-cutting NFRs. It does **not** define screen-level behavior —
those live in the module specs (SPEC-001…011).

**Outcome:** any engineer can read this one document and understand how the whole
system connects and where each behavior is specified.

---

## Actors & roles

```
                        ┌──────────────────────────────────────┐
                        │          RENTAL MANAGEMENT SYSTEM       │
                        └──────────────────────────────────────┘
                             ▲                         ▲
              online, self-service                 backend, operational
                             │                         │
            ┌────────────────┴──────┐        ┌─────────┴───────────────┐
            │   PORTAL USER          │        │   ADMIN / RENTAL MANAGER │
            │  (Client / Customer)   │        │                          │
            ├────────────────────────┤        ├──────────────────────────┤
            │ • register / profile   │        │ • products & pricelists  │
            │ • browse & rent        │        │ • rental periods         │
            │ • cart & checkout      │        │ • quotation templates    │
            │ • pay + deposit        │        │ • in-store quotation flow │
            │ • download invoice     │        │ • confirm pickup/return  │
            │ • manage orders/addr   │        │ • deposit settlement     │
            │ • return in store      │        │ • late-fee handling      │
            │                        │        │ • dashboard & config     │
            └────────────────────────┘        │ • manage customer records│
                                              └──────────────────────────┘
```

| Role | Description | Detailed in |
|------|-------------|-------------|
| **Portal User (Client)** | Self-service customer. Registers, browses, rents online, manages orders/profile/address, returns products in store. | SPEC-001, 002, 004 |
| **Admin / Rental Manager** | Runs org-wide config and daily rental operations. Creates in-store quotations, confirms rentals, handles pickup/return, settles deposits, manages users. | SPEC-005, 007, 009, 010 |

> RBAC is enforced system-wide (see NFR-1). Portal users never reach admin backend routes; admins may act on behalf of walk-in customers.

---

## End-to-end product flow

Two entry paths converge on the same rental lifecycle: **online self-service** and
**in-store admin-assisted**.

```
 ONLINE (Portal User)                         IN-STORE (Admin-assisted)
 ─────────────────────                        ─────────────────────────
 Splash → Login/Signup                         Walk-in customer
        │                                              │
        ▼                                              ▼
 Browse catalog (SPEC-002)                     Admin creates Quotation (SPEC-005)
        │                                              │
        ▼                                              ▼
 Select product + rental period                Customer accepts on the spot
        │                                              │
        ▼                                              ▼
 Add to cart (SPEC-004)                         Admin confirms quotation
        │                                              │
        ▼                                              ▼
 Delivery address OR store pickup               Invoice generated (SPEC-005)
        │                                              │
        ▼                                              ▼
 Pay rental + SECURITY DEPOSIT ◄───────────────► Collect payment + deposit (SPEC-006)
        │
        ▼
 Invoice available to download (SPEC-004/005)
        │
        ▼
 ┌───────────────── SHARED RENTAL LIFECYCLE ─────────────────┐
 │                                                            │
 │  PICKUP (SPEC-007)  →  IN USE  →  RETURN due date          │
 │     scan/checklist        (active rental)                  │
 │                              │                             │
 │                 ┌────────────┴────────────┐                │
 │                 ▼                          ▼                │
 │        RETURNED ON TIME            RETURNED LATE / not yet  │
 │        (SPEC-007 inspection)       (SPEC-008 overdue)       │
 │                 │                          │               │
 │                 ▼                          ▼               │
 │   Inspect: OK? damage? missing?    Auto-detect overdue     │
 │                 │                  Calculate penalty        │
 │                 ▼                          │               │
 │   DEPOSIT SETTLEMENT (SPEC-006)  ◄─────────┘               │
 │   • on time & OK → full refund                             │
 │   • late/damage  → deduct penalty, refund remainder in cash│
 │                 │                                          │
 │                 ▼                                          │
 │   Stock updated, deposit history closed, rental COMPLETED  │
 └────────────────────────────────────────────────────────────┘

 All of the above is monitored in real time via the ADMIN DASHBOARD (SPEC-009).
```

---

## Domain model (entities)

Conceptual entities and their key relationships. Field-level detail lives in the owning module spec.

```
User ──1:N── Address
User ──1:N── RentalOrder
User ──1:N── PaymentMethod (portal-managed)

Product ──1:N── ProductVariant        (Brand/Manufacturer/Color/Size — SPEC-003)
Product ──N:M── Pricelist (via PricelistItem)   (SPEC-003)
Pricelist ──1:N── PricelistItem
RentalPeriod (hour/day/week/month definitions)  (SPEC-003)

Quotation ──1:N── QuotationLine        (SPEC-005)
Quotation ──0:1── QuotationTemplate     (header/footer, defaults)
Quotation ──1:1── RentalOrder (on confirm)

RentalOrder ──1:N── RentalOrderLine (product/variant + period + price)
RentalOrder ──1:1── Invoice            (SPEC-005)
RentalOrder ──1:1── SecurityDeposit    (SPEC-006)
RentalOrder ──1:1── PickupSchedule     (SPEC-007)
RentalOrder ──1:1── ReturnSchedule     (SPEC-007)
RentalOrder ──0:N── LateFee            (SPEC-008)

SecurityDeposit ──1:N── DepositLedgerEntry   (hold/refund/deduct history — SPEC-006)
Return ──0:N── DamageReport / MissingAccessory (SPEC-007)
```

| Entity | Purpose | Owning spec |
|--------|---------|-------------|
| User | Portal customer or admin account | SPEC-001 |
| Address / PaymentMethod | Portal-managed profile data | SPEC-001, 004 |
| Product / ProductVariant | Rentable catalog item and its variants | SPEC-002, 003 |
| Pricelist / PricelistItem / RentalPeriod | Pricing rules and rentable durations | SPEC-003 |
| Quotation / QuotationTemplate | In-store offer and reusable template | SPEC-005 |
| RentalOrder / RentalOrderLine | The confirmed rental and its line items | SPEC-004, 005 |
| Invoice | Billing document, downloadable | SPEC-005 |
| SecurityDeposit / DepositLedgerEntry | Deposit and its full history | SPEC-006 |
| PickupSchedule / ReturnSchedule | Scheduled logistics events | SPEC-007 |
| DamageReport / MissingAccessory | Return inspection outcomes | SPEC-007 |
| LateFee | Calculated overdue penalty | SPEC-008 |

---

## Master rental state machine

The single source of truth for a rental's lifecycle. Every module transitions the
order through these states; the dashboard reports on them.

```
   DRAFT ──confirm──► CONFIRMED ──pay+deposit──► RESERVED
  (quote/cart)                                      │
                                              pickup │ confirmed
                                                     ▼
                                                  PICKED_UP ───► ACTIVE (in use)
                                                                   │
                        ┌──────────────────────────────────────────┤
                        │                                          │
              on/before due date                          past due date
                        │                                          │
                        ▼                                          ▼
                   RETURNED                                    OVERDUE
                (inspection)                            (penalty accrues, SPEC-008)
                        │                                          │
              ┌─────────┴─────────┐                    returned late │
              ▼                   ▼                                 ▼
        OK / no damage      damage/missing                     RETURNED_LATE
              │                   │                                 │
              └───────► DEPOSIT SETTLEMENT (SPEC-006) ◄─────────────┘
                                  │
                        ┌─────────┴──────────┐
                        ▼                    ▼
                  FULL REFUND        PARTIAL (deduct penalty/damage,
                                     refund remainder in cash)
                                  │
                                  ▼
                             COMPLETED
```

| State | Meaning | Set by |
|-------|---------|--------|
| DRAFT | Quotation or cart, not yet confirmed | SPEC-004/005 |
| CONFIRMED | Customer accepted; awaiting payment | SPEC-005 |
| RESERVED | Paid + deposit collected; awaiting pickup | SPEC-004/006 |
| PICKED_UP / ACTIVE | Product handed over; in customer's possession | SPEC-007 |
| OVERDUE | Past return due date, not yet returned | SPEC-008 (auto) |
| RETURNED / RETURNED_LATE | Product back in store; inspection pending/done | SPEC-007 |
| COMPLETED | Deposit settled, stock restored, closed | SPEC-006 |
| CANCELLED | Terminated before pickup (refund per policy) | SPEC-004/005 |

---

## System context (logical layers)

```
┌───────────────┐   ┌───────────────┐      Backend
│  Portal (web) │   │ Admin backend │   ┌──────────────────────────────┐
│  Portal User  │   │    Admin      │──►│ API layer (REST)              │
└──────┬────────┘   └──────┬────────┘   │  auth · catalog · pricing ·  │
       │  HTTPS/JWT        │            │  cart · quotation · invoice ·│
       └───────────────────┴───────────►│  deposit · pickup/return ·   │
                                        │  late-fee · dashboard · admin│
                                        ├──────────────────────────────┤
                                        │ Domain services & schedulers │
                                        │  (overdue sweep, reminders)  │
                                        ├──────────────────────────────┤
                                        │ Persistence (DB) · file store│
                                        │  (invoices, profile images)  │
                                        └──────────────────────────────┘
```

- **API layer** — role-guarded REST endpoints; module specs define exact routes.
- **Domain services** — pricing, deposit ledger, late-fee engine, scheduling.
- **Schedulers/jobs** — periodic overdue detection (SPEC-008), reminders (SPEC-011).
- **Persistence** — relational store for transactional integrity of orders/deposits; object store for invoices and profile images.

---

## Functional requirements (system-level)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | System supports two entry paths — online self-service and in-store admin-assisted — that converge on one shared rental lifecycle. | Must |
| FR-2 | Every rental progresses through the master state machine; no state is skipped without an explicit transition rule. | Must |
| FR-3 | Two roles exist — Portal User and Admin — with distinct capability sets enforced by RBAC. | Must |
| FR-4 | A rental order links to exactly one invoice, one security deposit, one pickup schedule, and one return schedule. | Must |
| FR-5 | All monetary movements (rental charge, deposit hold, penalty, refund) are recorded as auditable ledger entries. | Must |
| FR-6 | Admin dashboard reflects rental state changes in near real time. | Should |

## Non-functional requirements (system-level)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Security — role-based access control on every endpoint; portal users cannot access admin routes. | Must |
| NFR-2 | Security — passwords hashed (bcrypt/argon2); auth via signed tokens with expiry. | Must |
| NFR-3 | Integrity — deposit/refund/late-fee amounts computed server-side; never trusted from client. | Must |
| NFR-4 | Consistency — order confirmation + payment + deposit + stock reservation are atomic (all-or-nothing). | Must |
| NFR-5 | Auditability — every financial and state transition is timestamped and attributable to an actor. | Must |
| NFR-6 | Performance — dashboard KPI queries p95 < 500ms; catalog browse p95 < 400ms. | Should |
| NFR-7 | Reliability — overdue-detection job runs on a fixed schedule and is idempotent. | Must |
| NFR-8 | Observability — health endpoint + structured logs for financial operations. | Should |
| NFR-9 | Accessibility — portal screens meet WCAG 2.1 AA for core rental flow. | Should |
| NFR-10 | Data protection — profile images and invoices stored with access control; PII handled per policy. | Must |

---

## Accepted criteria

- [ ] Vocabulary, roles, and entity map are agreed and reused verbatim by module specs.
- [ ] Master state machine covers every path in the product flow (online + in-store, on-time + late + damage).
- [ ] Each domain entity has exactly one owning spec.
- [ ] System-level Must NFRs are inherited (not contradicted) by every module spec.

## Edge cases considered

- Online and in-store paths creating the same rental for the same product/period — availability must be reserved atomically (NFR-4).
- Cancellation before pickup — refund path defined by SPEC-004/005.
- Rental with multiple line items where one is returned late and another on time — settlement is per-order but penalty is per-line (SPEC-008).

## Edge cases possible (to resolve in module specs)

- Partial pickup (some items picked up, others not).
- Deposit shared across a multi-line order vs per-line deposits.
- Admin overriding an auto-calculated late fee.

## Testing guidelines

- Model the state machine as a table of `(currentState, event) → nextState`; unit-test every legal and illegal transition.
- Integration test both entry paths end-to-end to `COMPLETED`.

## Security

**Done (specified):** RBAC (NFR-1), server-side money math (NFR-3), atomic confirmation (NFR-4), audit trail (NFR-5).
**Not yet done:** concrete threat model, rate limiting, and secrets management — defer to implementation phase, track here.
**Vuln tests to add:** privilege escalation across roles; tampering with client-sent amounts; replay of payment confirmation.

## Open questions

1. Single-tenant per rental business, or multi-tenant/multi-store from day one?
2. Is payment real (gateway) or recorded/manual for MVP? (affects SPEC-004/005/006)
3. Currency — single currency, or multi-currency pricing?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial standalone architecture spec derived from the RMS problem statement.
