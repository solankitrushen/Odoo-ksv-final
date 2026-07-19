# SPEC-008 — Late Return Fee Management

| Field | Value |
|-------|-------|
| ID | SPEC-008 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 003, 006, 007 |
| Referenced by | SPEC-009 |

## Spec name

**ID:** SPEC-008
**Title:** Late Return Fee Management
**One line:** Automatically detect overdue rentals and apply configurable penalties (hourly/daily/weekly/monthly) with grace period and max caps, deduct them from the security deposit, and generate a penalty invoice.

---

## What this spec does

Owns overdue detection and penalty calculation. When a product is returned after its
period (or is not yet returned past due), it is flagged **late** and a penalty is
computed by configurable rules, then handed to SPEC-006 for deduction from the deposit
(remainder refunded in cash) and invoiced.

**Out of scope:** the deposit hold/refund mechanics (SPEC-006), the physical return
(SPEC-007), pricing of the rental itself (SPEC-003).

---

## How it works

```
 Overdue detection (scheduled + on return-confirm)
 ─────────────────────────────────────────────────
 due_date  +  grace_period  <  now/return_time  ? ──▶ NOT LATE (stop)
                                                  └─▶ LATE
                                                        │
                             overdue_duration = return_time − (due + grace)
                                                        │
                     charging rule (hourly/daily/weekly/monthly rate)  ── config SPEC-010
                                                        │
                             penalty = ceil(duration/unit) × rate
                             penalty = min(penalty, max_late_fee_cap)
                                                        │
                             ┌──────────────────────────┴───────────┐
                             ▼                                       ▼
                   deduct from deposit (SPEC-006)         generate PENALTY INVOICE
                   remainder refunded in cash             outstanding penalty visible
```

**Modules**

- `overdue-detector` — scheduled sweep + on-return evaluation; flags overdue rentals.
- `late-fee-calculator` — applies charging rule, grace, cap → penalty amount.
- `late-fee-config` — rules: unit, rate, grace period, max cap (see SPEC-010).
- `penalty-invoice` — auto-generated invoice for the penalty.

**Representative routes**

- `GET /rentals/overdue` — current overdue list (feeds SPEC-009).
- Internal: return-confirm (SPEC-007) → calculate → settle (SPEC-006) → invoice.
- `GET /rentals/:id/penalty` — penalty breakdown + outstanding.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | System automatically detects overdue returns (past due date, beyond grace). | Must |
| FR-2 | A late return incurs a penalty. | Must |
| FR-3 | Charging rules configurable: hourly, daily, weekly, or monthly. | Must |
| FR-4 | Grace period is configurable. | Must |
| FR-5 | Maximum late-fee limit (cap) is configurable and enforced. | Must |
| FR-6 | Penalty is deducted from the security deposit; remainder refunded in cash (SPEC-006). | Must |
| FR-7 | A penalty invoice is generated automatically. | Should |
| FR-8 | Outstanding penalties are clearly visible (portal + dashboard). | Must |
| FR-9 | A pre-due reminder email is sent before the due date (lead window `RENTAL_DUE_SOON_LEAD_HOURS`, default 24h), once. | Should |
| FR-10 | While overdue, the customer is emailed the running invoice once per calendar day (per-day `Overdue day N` lines) until return. | Should |
| FR-11 | Per-day overdue amounts reconcile exactly with the total capped late fee (`computeOverdueSchedule`; once capped, later days = 0). | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Penalty math is deterministic, server-side, in minor units. | Must |
| NFR-2 | Penalty is capped at `max_late_fee` and never exceeds deposit for deduction (SPEC-006). | Must |
| NFR-3 | Overdue detection runs on schedule reliably and is idempotent (no duplicate penalties). | Must |
| NFR-4 | Config changes are admin-only and audited (SPEC-000/010). | Must |

---

## Accepted criteria

- [ ] FR-1 overdue detected past due+grace.
- [ ] FR-3 each charging unit computes correctly.
- [ ] FR-4 grace period suppresses penalty within window.
- [ ] FR-5 cap enforced.
- [ ] FR-6 penalty deducted via SPEC-006, remainder cash-refunded.
- [ ] FR-8 outstanding penalty visible.
- [ ] NFR-2 penalty ≤ cap and deduction ≤ deposit (test).
- [ ] NFR-3 re-running detection doesn't double-charge (test).

## Edge cases considered

- Return exactly at due date / exactly at grace boundary.
- Overdue duration less than one charging unit → rounding rule (ceil).
- Penalty exceeds cap → clamped to cap.
- Penalty exceeds deposit → deposit forfeited, excess handling per Open Q.
- Not-yet-returned but overdue → accrues; finalized at return.
- Detector runs multiple times before return → single penalty (idempotent).

## Testing guidelines

- Unit: calculator across units, grace boundaries, cap, rounding.
- Integration: overdue detect → deduct (SPEC-006) → penalty invoice.
- Idempotency: repeated detection sweeps.

## Security

**Done:** deterministic server-side math (NFR-1), caps/bounds (NFR-2), idempotent detection (NFR-3), admin-only audited config (NFR-4).
**Not yet done:** notification of accruing penalty (link SPEC-011 reminders).
**Vuln tests:** config tampering by non-admin; forcing duplicate penalties via repeated confirm.

## Open questions

1. If penalty exceeds deposit, is the excess billed to the customer or written off? **Answered (MVP):** excess → `balanceDue`, settled at Clear or emailed as shortfall.
2. ~~Does penalty accrue continuously before return, or only computed once at return?~~ **Answered:** accrues per day while overdue — `computeOverdueSchedule` emits `Overdue day N` lines (cumulative-diff, cap-aware) that reconcile with the final total; daily invoice emailed until return.

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 1: late fee on close (existing) + shortfall path when deposit < late+damage; `GET /admin/rentals/:id/penalty`; Open Q1 answered for MVP: excess → `balanceDue` + mail both parties. Deferred: scheduled overdue sweep job.
- In progress — Step 2: `GET /admin/rentals/overdue` worklist; customer `GET /rentals/:id/penalty`.
- Done — gap-close: overdue sweep job + list.
- Done — per-day overdue billing: `computeOverdueSchedule` (leaf `lateFee.js`) emits cap-aware `Overdue day N` lines that reconcile with the total late fee; sweep now sends a pre-due reminder email (`RENTAL_DUE_SOON_LEAD_HOURS`, default 24h, once) and a daily overdue invoice email (deduped per calendar day via `rental.dueSoonEmailedAt` / `lastOverdueEmailDay`) until return. Feeds the master invoice (SPEC-005) where deposit is applied as a credit.
