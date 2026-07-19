# SPEC-016 — Risk Management

| Field | Value |
|-------|-------|
| ID | SPEC-016 |
| Status | Done (thin) |
| Owner | Product |
| Depends on | SPEC-000, 004, 005, 006, 007, 008, 013 |
| Referenced by | SPEC-009, 017, 019 |

## Spec name

**ID:** SPEC-016
**Title:** Risk Management
**One line:** Assess and control rental risk — customer risk scoring, credit/exposure limits, blacklist, damage/loss and fraud handling, and risk-based deposit/approval rules that gate the rental lifecycle.

---

## What this spec does

Owns the business-risk controls the ERP applies before and during a rental: who can
rent, how much exposure is allowed, when a manual approval or higher deposit is needed,
and how damage/loss/fraud incidents are recorded and resolved. It **gates** confirmation
(SPEC-004/005) and **influences** deposit (SPEC-006).

**Out of scope:** deposit mechanics (SPEC-006), late-fee math (SPEC-008), physical
inspection capture (SPEC-007 records damage; this spec assesses/actions its risk).

---

## How it works

```
 At confirmation (SPEC-004/005):
   customer + order value ──▶ RISK EVALUATION
        │  inputs: history, overdue/damage record, blacklist, current exposure
        ▼
   risk score / band (LOW / MEDIUM / HIGH / BLOCKED)
        │
        ├─ LOW      → standard deposit, auto-approve
        ├─ MEDIUM   → higher deposit % (SPEC-006) and/or ID verification
        ├─ HIGH     → manual admin approval required
        └─ BLOCKED  → blacklist / over-limit → confirmation refused

 During/after rental:
   damage/missing (SPEC-007) or non-return ──▶ INCIDENT (damage/loss/fraud)
        │
        ▼
   incident resolution ──▶ deduction (SPEC-006) + finance claim (SPEC-017)
                          + update customer risk record
```

**Modules**

- `risk-profile` — per-customer risk score, band, history rollup.
- `credit-limit` — max concurrent exposure (open rental value + deposits) per customer.
- `blacklist` — blocked customers/identifiers with reason + audit.
- `incident` — damage/loss/fraud case with status, evidence, resolution.
- `risk-rules` — configurable thresholds → deposit uplift / approval / block.

**Representative routes** (admin/risk-officer)

- `GET /admin/customers/:id/risk`, `PATCH /admin/customers/:id/risk`.
- `GET/POST /admin/blacklist`.
- `GET/POST/PATCH /admin/incidents`.
- `PUT /admin/config/risk-rules` (thresholds, limits).
- Internal: `evaluateRisk(customer, order)` called at confirmation.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | System computes a customer risk score/band from history + current exposure. | Should |
| FR-2 | Configurable credit/exposure limit per customer; over-limit blocks confirmation. | Should |
| FR-3 | Blacklist blocks confirmation for listed customers/identifiers. | Must |
| FR-4 | Risk band can require higher deposit (SPEC-006) or manual approval before confirm. | Should |
| FR-5 | Damage/loss/fraud incidents are recorded with evidence and status. | Must |
| FR-6 | Incident resolution drives deposit deduction (SPEC-006) and finance claim (SPEC-017). | Must |
| FR-7 | Non-return past a threshold is escalated to a loss/fraud incident. | Should |
| FR-8 | Risk rules (thresholds, limits, actions) are configurable. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Risk gating at confirmation is server-side and cannot be bypassed by client. | Must |
| NFR-2 | Blacklist/limit/incident writes are admin/risk-role gated and audited. | Must |
| NFR-3 | Risk decisions are explainable (record which rule fired). | Should |
| NFR-4 | Incident evidence validated and stored safely; PII handled per policy. | Must |

---

## Accepted criteria

- [ ] FR-3 blacklisted customer cannot confirm a rental (test).
- [ ] FR-2 over-limit customer blocked (test).
- [ ] FR-4 medium/high risk applies deposit uplift / approval gate.
- [ ] FR-5 incident lifecycle works with evidence.
- [ ] FR-6 resolution triggers SPEC-006 deduction + SPEC-017 claim.
- [ ] NFR-1 client cannot bypass gate (test).
- [ ] NFR-3 fired rule recorded.

## Edge cases considered

- Blacklist added while a rental is already active (existing rental honored, new blocked).
- Exposure exactly at limit boundary.
- Incident opened but deposit already refunded → claim/recovery path (SPEC-017).
- False-positive risk block → manual override (audited).
- Repeat late/damage history escalating risk band.

## Testing guidelines

- Unit: risk band from inputs; limit boundary; rule firing/explainability.
- Integration: blacklist → confirm blocked; incident → deduction + claim.
- Negative: client attempting to bypass gate; non-risk-role writing rules.

## Security

**Done:** server-side gating (NFR-1), RBAC + audit (NFR-2), evidence validation (NFR-4).
**Not yet done:** external credit-bureau / KYC integration; ML scoring model.
**Vuln tests:** bypass confirmation gate; edit own risk record as portal_user; tamper incident resolution amount.

## Open questions

1. Is risk scoring rules-based (MVP) or ML-based later?
2. Is KYC/ID verification required for HIGH band, and via which provider?
3. Exposure = open rental value + deposits, or rental value only?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done (thin) — blacklist blocks confirm; `/admin/incidents` + auto damage incident on inspect.
