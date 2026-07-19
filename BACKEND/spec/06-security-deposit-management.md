# SPEC-006 — Security Deposit Management

| Field | Value |
|-------|-------|
| ID | SPEC-006 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 003 |
| Referenced by | SPEC-004, 005, 007, 008, 009 |

## Spec name

**ID:** SPEC-006
**Title:** Security Deposit Management
**One line:** Collect fixed or percentage-based deposits at confirmation, hold them through the rental, and settle at return — full refund on-time, penalty-deducted refund when late/damaged — with complete deposit history.

---

## What this spec does

Owns the deposit's whole lifecycle: how much is collected, its payment status, holding
it until successful return, and settling it (full refund, or penalty deduction with the
remainder refunded in cash). Deposit history is auditable end to end.

**Out of scope:** how the penalty amount is calculated (SPEC-008), the physical return
inspection (SPEC-007).

---

## How it works

```
 Deposit lifecycle
 ─────────────────
 CONFIGURED (fixed amt OR % of rental)  ── SPEC-003/010 config
        │
        ▼
 COLLECTED at confirmation (SPEC-004/005)  → status: HELD
        │
        ▼
 HELD for duration of rental
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
 RETURN ON TIME & OK          RETURN LATE / DAMAGED
   │                               │  penalty from SPEC-008
   ▼                               ▼
 FULL REFUND                 deposit − penalty:
 (no deduction)              • remainder REFUNDED in cash
   │                         • penalty RETAINED
   ▼                               │
 status: REFUNDED            status: PARTIALLY_REFUNDED / FORFEITED
        └──────────────┬────────────┘
                       ▼
             DEPOSIT HISTORY entry closed (audit)
```

**Modules**

- `deposit` — deposit record per rental: type (fixed/percent), amount, status.
- `deposit-settlement` — refund / deduction / cash-remainder at return.
- `deposit-history` — immutable ledger of deposit events.

**Representative routes** (admin-driven at return; read by portal)

- `GET /orders/:id/deposit` — current deposit + status.
- `POST /orders/:id/deposit/settle` — settle at return (full refund or deduct + refund).
- `GET /deposits/history?customer=` — deposit ledger.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Security deposit is collected during confirmation (online + in-store). | Must |
| FR-2 | Deposit supports **fixed amount** or **percentage-based** (of rental) configuration. | Must |
| FR-3 | Deposit payment status is tracked (pending, held, refunded, partially refunded, forfeited). | Must |
| FR-4 | Deposit is held until the product is successfully returned. | Must |
| FR-5 | On on-time, undamaged return → **full deposit refunded, no deduction**. | Must |
| FR-6 | On late return → penalty (SPEC-008) deducted from deposit; **remainder refunded in cash**. | Must |
| FR-7 | On damage/missing accessories → deduction handled through settlement (SPEC-007). | Should |
| FR-8 | Complete deposit history is maintained per rental/customer. | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Deposit + settlement money math in minor units, server-side. | Must |
| NFR-2 | Deposit history is append-only / immutable (audit integrity). | Must |
| NFR-3 | Settlement is atomic: deduction, refund, and status change succeed together. | Must |
| NFR-4 | Refund never exceeds deposit held; penalty never exceeds deposit (see SPEC-008 cap). | Must |
| NFR-5 | Settlement actions are admin-only and audited (SPEC-000). | Must |

---

## Accepted criteria

- [ ] FR-1 Deposit collected at confirmation.
- [ ] FR-2 Fixed and percentage deposits both compute correctly.
- [ ] FR-3 Status transitions tracked.
- [ ] FR-5 On-time → full refund, zero deduction.
- [ ] FR-6 Late → penalty deducted, remainder refunded in cash.
- [ ] FR-8 History records every event.
- [ ] NFR-3 settlement atomic (test rollback).
- [ ] NFR-4 refund/penalty bounded by deposit (test).

## Edge cases considered

- Penalty ≥ deposit → deposit fully forfeited, refund = 0 (never negative).
- Percentage deposit rounding.
- Return with both lateness and damage → combined deduction, bounded by deposit.
- Deposit configured as 0 → no hold, no refund step.
- Refund attempted twice → idempotent / blocked by status.

## Testing guidelines

- Unit: fixed vs percentage computation; deduction bounded by deposit; rounding.
- Integration: confirm (held) → on-time return (full refund); late return (deduct + cash remainder).
- Negative: double settlement; refund > deposit.

## Security

**Done:** minor-unit math (NFR-1), immutable history (NFR-2), atomic settlement (NFR-3), bounds (NFR-4), admin RBAC + audit (NFR-5).
**Not yet done:** dual-control for high-value refunds. Defer.
**Vuln tests:** portal_user triggering settlement; refund amount tampering; replay of settle.

## Open questions

1. Is refund method always cash for the remainder, or also original-method for online payers?
2. Where is percentage-vs-fixed chosen — per product, per pricelist, or org-wide (SPEC-010)?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 1: close applies deposit to late+damage balance; refund remainder; `settlementShortfallPaise` when deposit insufficient; email alert to customer + admin (best-effort SMTP).
- Done — gap-close: `GET /customer/rentals/:id/deposit` status.
