# SPEC-010 — Admin Configuration & User Management

| Field | Value |
|-------|-------|
| ID | SPEC-010 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 001, 003, 006, 008 |
| Referenced by | SPEC-002, 005, 007 |

## Spec name

**ID:** SPEC-010
**Title:** Admin Configuration & User Management
**One line:** The admin backend to configure org-wide rental settings — products, pricelists, rental periods, deposit and late-fee rules, quotation templates + header/footer — and to manage customer records and user accounts.

---

## What this spec does

Owns the **configuration source of truth** consumed by the rest of the system, and the
management of customer/user records. This is where an admin sets up everything the
lifecycle depends on.

**Out of scope:** the runtime behavior those configs drive (pricing SPEC-003, deposits
SPEC-006, late fees SPEC-008, quotations SPEC-005) — this spec owns *authoring* them.

---

## How it works

```
                 ┌──────────────── ADMIN BACKEND ────────────────┐
                 │                                                │
  Products ──────┤ create/edit products (+ variants → SPEC-003)   │
  Pricing  ──────┤ pricelists (default + custom + time-bound)     │──▶ consumed by
  Periods  ──────┤ rental periods (hourly/daily/weekly/monthly)   │    SPEC-002/003/
  Deposits ──────┤ deposit rule: fixed vs % , amount              │    004/005/006/
  Late fees ─────┤ charging unit, rate, grace, max cap            │    007/008
  Quotation ─────┤ templates + header/footer layout               │
  Users   ───────┤ customer records, user accounts, roles         │
                 └────────────────────────────────────────────────┘
```

**Modules**

- `admin-products` — product CRUD (feeds catalog SPEC-002).
- `admin-pricing` — pricelists + rental periods (SPEC-003).
- `admin-deposit-config` — deposit type/amount defaults (SPEC-006).
- `admin-latefee-config` — late-fee rules, grace, cap (SPEC-008).
- `admin-quotation-config` — templates + header/footer (SPEC-005).
- `admin-users` — customer records and user/role management (SPEC-001).

**Representative routes** (all admin)

- `POST/PATCH/DELETE /admin/products`, `/admin/pricelists`, `/admin/rental-periods`.
- `PUT /admin/config/deposit`, `PUT /admin/config/late-fee`.
- `POST /admin/quotation-templates`, `PUT /admin/document-layout`.
- `GET/POST/PATCH /admin/users`, `GET /admin/customers`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin can create/manage products (feeding catalog). | Must |
| FR-2 | Admin can create/manage pricelists incl. the default and time-bound ones. | Must |
| FR-3 | Admin can create/manage rental periods. | Must |
| FR-4 | Admin can configure deposit rule (fixed vs percentage, amount). | Must |
| FR-5 | Admin can configure late-fee rules (unit, rate, grace, max cap). | Must |
| FR-6 | Admin can create quotation templates and configure header/footer. | Should |
| FR-7 | Admin can manage user records (customers) and roles. | Must |
| FR-8 | Admin can maintain org-specific rental settings in one place. | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | All configuration writes are admin-only (RBAC). | Must |
| NFR-2 | Every config change is audited (who/when/what — SPEC-000). | Must |
| NFR-3 | Config inputs validated at the boundary (amounts, ranges, caps ≥ 0). | Must |
| NFR-4 | Deleting/editing config referenced by active rentals is guarded (no orphan/retro-break). | Must |

---

## Accepted criteria

- [ ] FR-1 product CRUD works and appears in catalog.
- [ ] FR-2 default + custom + time-bound pricelists manageable.
- [ ] FR-3 rental periods manageable.
- [ ] FR-4 deposit rule configurable and applied at confirmation.
- [ ] FR-5 late-fee rule configurable and applied by SPEC-008.
- [ ] FR-6 template + header/footer used in SPEC-005.
- [ ] FR-7 user/customer records manageable.
- [ ] NFR-1 non-admin write blocked (test).
- [ ] NFR-4 editing in-use config guarded (test).

## Edge cases considered

- Editing a pricelist/period referenced by active rentals → existing rentals unaffected (snapshot at confirm).
- Deleting the default pricelist → blocked (must always exist, SPEC-003 FR-1).
- Invalid config (negative amount, cap < 0, grace < 0) → rejected.
- Deactivating a product with active rentals.

## Testing guidelines

- Integration: create config → verify downstream spec consumes it.
- Negative: non-admin write; delete default pricelist; invalid values.

## Security

**Done:** admin RBAC (NFR-1), audit (NFR-2), validation (NFR-3), reference guards (NFR-4).
**Not yet done:** config change approval/versioning. Defer.
**Vuln tests:** portal_user hitting `/admin/*`; deleting referenced config; negative-amount injection.

## Open questions

1. Are config values snapshotted onto each rental at confirmation (recommended) or resolved live?
2. Multi-store: is config global or per-store (SPEC-000 Open Q)?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done — gap-close: commercial-rules list, users/roles, templates.
