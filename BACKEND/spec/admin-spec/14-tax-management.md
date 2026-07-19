# SPEC-014 — Tax Management

| Field | Value |
|-------|-------|
| ID | SPEC-014 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 003, 012, 013 |
| Referenced by | SPEC-005, 008, 017, 019 |

## Spec name

**ID:** SPEC-014
**Title:** Tax Management
**One line:** Admin CRUD for tax codes, rates, and tax groups; deterministic tax computation applied to rental charges, late fees, and invoices, with jurisdiction and exemption handling.

---

## What this spec does

Owns how tax is defined and applied across the system. Products carry a **tax class**
(SPEC-013 FR-7); quotations/invoices (SPEC-005), late fees (SPEC-008), and finance
(SPEC-017) all resolve tax through this spec.

**Out of scope:** the rental price itself (SPEC-003), GL posting of collected tax
(SPEC-017), deposit (deposits are typically non-taxable — see Open Q).

---

## How it works

```
 TaxCode (e.g. GST-18, VAT-5, EXEMPT)
    │ rate %, type (inclusive/exclusive), jurisdiction
    ▼
 TaxGroup (composite: e.g. CGST 9% + SGST 9%)  ── for split taxes
    │
    ▼
 Product.tax_class ─┐
 LateFee.tax_class ─┼──▶ TAX RESOLUTION(line, date, customer jurisdiction, exemption)
 Delivery.tax_class ┘         │
                              ▼
                 line_tax = round(taxable_base × effective_rate)   [minor units]
                              │
                              ▼
             Invoice tax breakdown (per code) + total tax  (SPEC-005/017)
```

**CRUD surface (admin)**

- `POST/GET/PATCH/DELETE /admin/tax/codes` — tax codes (rate, inclusive/exclusive, jurisdiction, effective dates).
- `POST/GET/PATCH /admin/tax/groups` — composite groups.
- `PATCH /admin/products/:id/tax-class` — assign (also SPEC-013).
- Internal: `resolveTax(line, context)` used by invoicing/late-fee/finance.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin can CRUD tax codes (name, rate, inclusive/exclusive, jurisdiction, effective dates). | Must |
| FR-2 | Admin can define composite tax groups (e.g. CGST+SGST). | Should |
| FR-3 | Products/late-fees/delivery reference a tax class. | Must |
| FR-4 | Tax is computed deterministically per invoice line and shown as a breakdown. | Must |
| FR-5 | Support tax-inclusive and tax-exclusive pricing modes. | Must |
| FR-6 | Support customer/line tax exemptions. | Should |
| FR-7 | Time-effective rates: correct rate applied by rental/invoice date. | Must |
| FR-8 | Tax breakdown appears on quotation and invoice (SPEC-005). | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Tax math deterministic, server-side, minor units, documented rounding per line. | Must |
| NFR-2 | Rate changes are versioned by effective date; historical invoices immutable. | Must |
| NFR-3 | Tax config writes admin/accountant-role only and audited. | Must |
| NFR-4 | Snapshot resolved tax onto the order at confirmation (SPEC-012 FR-2). | Must |

---

## Accepted criteria

- [ ] FR-1 tax code CRUD works.
- [ ] FR-2 composite group sums correctly.
- [ ] FR-4/FR-5 inclusive and exclusive computations correct with breakdown.
- [ ] FR-6 exemption zeroes tax on eligible lines.
- [ ] FR-7 date-correct rate applied (test across a rate change).
- [ ] NFR-1 rounding rule covered by test.
- [ ] NFR-4 booked invoice tax unchanged after later rate edit.

## Edge cases considered

- Rate change between quotation and confirmation → snapshot at confirm.
- Rounding: per-line vs total rounding difference.
- Inclusive price back-computation (extract tax from gross).
- Exempt customer with mixed taxable/non-taxable lines.
- Deposit taxability (Open Q).
- Cross-jurisdiction rental (pickup vs delivery location).

## Testing guidelines

- Unit: inclusive/exclusive, composite groups, rounding, effective-date selection.
- Integration: invoice tax breakdown matches resolved codes; rate change doesn't alter old invoice.

## Security

**Done:** deterministic math (NFR-1), effective-date versioning (NFR-2), RBAC + audit (NFR-3), snapshot (NFR-4).
**Not yet done:** external tax-authority integration/filing exports.
**Vuln tests:** non-accountant editing rates; tampering exemption flag at checkout.

## Open questions

1. Are security deposits taxable? (assumed no)
2. Single jurisdiction or multi-jurisdiction (delivery-address-based) tax?
3. Reverse charge / B2B tax handling needed?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 1 MVP: `RentalTaxCode` CRUD (`/admin/tax/codes`); `product.taxClassId` **required** on create; quote resolves GST from tax class (exclusive). Deferred: tax groups, exemptions, inclusive back-calc.
- Done — gap-close: inclusive + `taxBreakdown`.
