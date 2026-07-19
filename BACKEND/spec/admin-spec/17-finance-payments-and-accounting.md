# SPEC-017 — Finance, Payments & Accounting

| Field | Value |
|-------|-------|
| ID | SPEC-017 |
| Status | Done (thin) |
| Owner | Product |
| Depends on | SPEC-000, 004, 005, 006, 008, 012, 014, 015, 016 |
| Referenced by | SPEC-009, 019 |

## Spec name

**ID:** SPEC-017
**Title:** Finance, Payments & Accounting
**One line:** The financial backbone — payment capture/refunds, accounts receivable, deposit ledger, tax collected, a double-entry general ledger, and reconciliation across every money movement in the rental lifecycle.

---

## What this spec does

Owns all **money truth** for the ERP. Every charge, deposit hold/refund, penalty, and
delivery fee posts here as auditable entries; it reconciles collected payments against
invoices and feeds financial analytics (SPEC-019). It consumes the amounts other
modules compute (it does not recompute tax or penalties).

**Out of scope:** computing rental price (SPEC-003), tax rate (SPEC-014), penalty amount
(SPEC-008), deposit rule (SPEC-006). This spec **records and settles** them.

---

## How it works

```
 Rental money events ──▶ posted as double-entry GL journal entries
 ────────────────────
 Invoice issued (005)     → DR Accounts Receivable   CR Rental Revenue + Tax Payable(014)
 Payment received (004/005)→ DR Cash/Bank            CR Accounts Receivable
 Deposit collected (006)  → DR Cash                  CR Deposit Liability (held)
 On-time refund (006)     → DR Deposit Liability     CR Cash
 Late penalty (008)       → DR Deposit Liability     CR Penalty Revenue + Tax
 Delivery fee (015)       → DR AR                     CR Delivery Revenue + Tax
 Damage/loss claim (016)  → DR Deposit Liability/AR   CR Claim Revenue
        │
        ▼
 RECONCILIATION: payments ↔ invoices ↔ bank; deposit liability ↔ deposits held (006)
        │
        ▼
 Reports: AR aging, revenue, tax collected, deposits held, refunds  → SPEC-009/019
```

**Modules**

- `payment` — capture, refund, method, gateway/manual, idempotency (shared w/ SPEC-004).
- `accounts-receivable` — invoices owed, aging, settlement.
- `deposit-ledger-finance` — financial view of SPEC-006 deposit liability.
- `general-ledger` — chart of accounts + double-entry journals.
- `reconciliation` — match payments/refunds to invoices and bank statements.

**Representative routes** (admin/accountant)

- `POST /admin/payments`, `POST /admin/payments/:id/refund`.
- `GET /admin/ar/aging`, `GET /admin/gl/journals`, `GET /admin/gl/trial-balance`.
- `GET /admin/finance/deposits-held`, `POST /admin/reconciliation/run`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Every invoice creates an AR entry; payments settle it. | Must |
| FR-2 | Payments and refunds are captured with method and status. | Must |
| FR-3 | Deposits are held as a liability and released/deducted per SPEC-006. | Must |
| FR-4 | Tax collected (SPEC-014) is tracked as a payable per invoice. | Must |
| FR-5 | Every money movement posts a balanced double-entry GL journal. | Should |
| FR-6 | AR aging, revenue, tax, deposit, and refund reports are available. | Must |
| FR-7 | Reconciliation matches payments/refunds to invoices (and bank, if integrated). | Should |
| FR-8 | Penalty (008), delivery fee (015), and damage claims (016) post to finance. | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | All money in integer minor units; GL journals always balance (Σdebits=Σcredits). | Must |
| NFR-2 | Financial postings are transactional and idempotent (no double-post on retry). | Must |
| NFR-3 | Ledger is append-only; corrections via reversing entries, never edits. | Must |
| NFR-4 | Finance writes are accountant/admin-role gated and audited. | Must |
| NFR-5 | Refund never exceeds captured amount; deposit refund bounded by held (SPEC-006). | Must |

---

## Accepted criteria

- [ ] FR-1/FR-2 invoice → AR → payment settles.
- [ ] FR-3 deposit shows as liability; release/deduct posts correctly.
- [ ] FR-4 tax payable tracked per invoice.
- [ ] FR-5 journals balance for each event type.
- [ ] FR-6 reports return correct figures against seeded data.
- [ ] FR-8 penalty/delivery/claim postings appear.
- [ ] NFR-1 trial balance nets to zero (test).
- [ ] NFR-2 retried posting doesn't duplicate (test).
- [ ] NFR-3 correction is a reversing entry, original intact (test).

## Edge cases considered

- Partial payment / partial refund.
- Overpayment → credit balance handling.
- Refund of a deposit already partially deducted (SPEC-006 bound).
- Posting failure mid-event → rollback / reliable retry (SPEC-012 NFR-4).
- Currency rounding at line vs total (align with SPEC-014).
- Reconciliation mismatch (payment without invoice, or vice versa).

## Testing guidelines

- Unit: journal balancing per event; refund/deposit bounds; minor-unit math.
- Integration: full lifecycle → assert AR, GL, deposit liability, tax payable.
- Idempotency: replay payment/refund/posting.

## Security

**Done:** balanced minor-unit GL (NFR-1), idempotent transactional posting (NFR-2), append-only ledger (NFR-3), RBAC + audit (NFR-4), bounds (NFR-5).
**Not yet done:** bank feed integration; dual-control on large refunds; period close/lock.
**Vuln tests:** non-accountant posting journals; refund > captured; editing a posted journal; replay double-post.

## Open questions

1. Full double-entry GL in scope for MVP, or AR + payments + deposit ledger only?
2. Real payment gateway vs manual/recorded (inherits SPEC-000/004 Open Q)?
3. Accounting period close/lock required?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done (thin) — payment/deposit ledgers + `/reports/financial` + `/reports/ar-aging`; full GL deferred.
