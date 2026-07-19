# Rental Management System — Product Master Specification

| Field | Value |
|---|---|
| Status | **Draft** — Phase 1 active (AUTH only) |
| Owner | Product and engineering |
| Created | 2026-07-18 |
| Last updated | 2026-07-18 |
| Target repository | `ksv-odooo` |
| Backend | `BACKEND/` — Node.js ESM, Express 4, Mongoose 7 |
| Frontend | Deferred — not in Phase 1 |
| Architecture | [`../RENTAL_ARCHITECTURE.md`](../RENTAL_ARCHITECTURE.md) |
| Active child | [`rental-authentication-authorization.md`](rental-authentication-authorization.md) (SPEC-RMS-AUTH-001) |
| Workflow mockup | [Excalidraw](https://app.excalidraw.com/l/65VNwvy7c4X/5l50ctoqUXw) (reference only) |

## Spec name

**ID:** SPEC-RMS-001  
**Title:** Rental Management System — master product boundary  
**One line:** Define Portal User + Admin rental product scope; Phase 1 ships authentication, authorization, and SMTP email verification only.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-M1 | The product has two human principals: **Admin** (operator) and **Portal Customer** (end user). Realms never mix. | Must |
| FR-M2 | Phase 1 delivers authentication, authorization, and SMTP email verification per SPEC-RMS-AUTH-001. | Must |
| FR-M3 | Later phases deliver catalog, cart/checkout, deposits, late fees, quotations, pickup/return, and dashboard per problem statement. | Must |
| FR-M4 | All rental data is tenant-scoped; client-supplied tenant IDs are ignored. | Must |
| FR-M5 | Frontend / admin UI is out of Phase 1; backend APIs and specs only. | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-M1 | Spec-driven development | Spec in `docs/specs/` before implementation; registry updated; Must FR mapped to tests. Must |
| NFR-M2 | Security baseline | OWASP-minded authn/authz, secret redaction, tenant isolation. Must |
| NFR-M3 | Maintainability | Rental module under `BACKEND/src/Rental/`; no reuse of food/procurement order collections. Must |

## Locked decisions

1. **Problem statement wins** over any prior “admin-only / no customer portal” documents (those specs were removed).
2. **Admin** authenticates via rental-admin JWT (legacy realm `vb`) + active `admin` membership.
3. **Portal Customer** authenticates via distinct `rental_customer` JWT realm with `tenantId` + `customerId`.
4. **Email** for verification and OTP uses SMTP (`SMTP_*` env). Fail closed when send is required and SMTP is missing (except test / explicit non-prod echo).
5. **Money / catalog / cart** rules are deferred to later child specs; do not invent them inside AUTH.
6. **No Figma section** — design input is Excalidraw workflow mockup only.

## What this spec does

### In scope

- Product roles, phase order, and authority of child specs.
- Pointer to Phase 1 AUTH as the only implementation-authorizing child today.

### Out of scope

- Detailed auth routes, OTP, SMTP (owned by SPEC-RMS-AUTH-001).
- Catalog, cart, payments, deposits, late fees, quotations, dashboard, frontend.

## How it works

```
Problem statement
       │
       ▼
 SPEC-RMS-001 (this file) ──► Phase 1: SPEC-RMS-AUTH-001
       │                      later: CAT / ORD / PAY / DOC / OPS
       ▼
 docs/RENTAL_ARCHITECTURE.md ──► BACKEND/src/Rental/
```

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [ ] | FR-M1 | AUTH spec defines both realms; no cross-realm acceptance | AUTH SEC tests |
| [ ] | FR-M2 | SPEC-RMS-AUTH-001 Must FR checked or in progress | Registry + AUTH changelog |
| [ ] | FR-M3 | Later children absent until AUTH Done or explicitly started | README registry |
| [ ] | FR-M4 | Restated in AUTH and architecture | Cross-tenant tests in AUTH |
| [ ] | FR-M5 | No frontend files required for Phase 1 Done | Diff review |
| [ ] | NFR-M1 | Specs under `docs/specs/`; README lists IDs | Registry |
| [ ] | NFR-M2 | AUTH security table complete | AUTH security section |
| [ ] | NFR-M3 | Architecture points at `BACKEND/src/Rental/` | Architecture doc |

## Edge cases considered / possible

- Prior docs forbade customer auth; those files are deleted — do not resurrect that lock.
- Partial rental code may already exist; AUTH spec is normative for auth behavior going forward.

## Testing guidelines

Phase 1 evidence lives under SPEC-RMS-AUTH-001. Master does not add separate test suites.

## Security

| Area | Status | Notes |
|------|--------|-------|
| Product role model | Draft | Admin vs customer realms locked here |
| Detailed authn/authz | Deferred to AUTH | See SPEC-RMS-AUTH-001 |
| Frontend attack surface | N/A Phase 1 | No UI in this phase |

## Open questions

- Profile image storage provider for later portal profile phase.
- Whether password-reset email ships in AUTH Phase 1 or a follow-up (AUTH lists as Should).

## Missed edge cases

None recorded at drafting.

## Changelog

| Date | Change |
|------|--------|
| 2026-07-18 | Initial thin master after removing contradicted admin-only suite; Phase 1 = AUTH. |
