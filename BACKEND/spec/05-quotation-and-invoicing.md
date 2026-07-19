# SPEC-005 — Quotation & Invoicing

| Field | Value |
|-------|-------|
| ID | SPEC-005 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000, 003, 006 |
| Referenced by | SPEC-004, 007, 009, 010 |

## Spec name

**ID:** SPEC-005
**Title:** Quotation & Invoicing (Admin in-store flow)
**One line:** Admin creates a quotation for a walk-in customer, confirms it on the spot, generates an invoice, and collects payment + deposit — using reusable quotation templates with configurable header/footer.

---

## What this spec does

Owns the **admin-assisted in-store** entry into the rental lifecycle and the invoice
artifact used by both entry paths. A confirmed quotation becomes a rental order
(SPEC-000) identical in downstream behavior to an online order (SPEC-004).

**Out of scope:** deposit settlement/refund (SPEC-006), online cart (SPEC-004),
org-wide config screens (SPEC-010 owns where templates are authored).

---

## How it works

```
  Walk-in customer
        │
        ▼
  Admin creates QUOTATION ──(optional)──▶ apply Quotation Template
   • customer, products, variants,          (prefilled lines, header/footer)
     periods, dates, price (SPEC-003),
     deposit (SPEC-006)
        │
        ▼
  Send to client  OR  customer accepts on the spot
        │
        ▼
  Admin CONFIRMS quotation ──▶ INVOICE generated ──▶ collect payment + deposit
        │                                                  │
        ▼                                                  ▼
  Rental order = confirmed (SPEC-000) ───────────▶ enters shared lifecycle (pickup)
```

**Modules**

- `quotation` — draft/build, line items, totals, status (draft → sent → confirmed → invoiced).
- `quotation-template` — reusable prefilled quotations for faster creation.
- `document-layout` — header & footer configuration for quotations/invoices.
- `invoice` — generated on confirmation; downloadable; shared with SPEC-004.

**Representative routes** (admin)

- `POST /quotations`, `PATCH /quotations/:id`, `POST /quotations/:id/confirm`.
- `GET/POST /quotation-templates`.
- `GET /invoices/:id`, `GET /invoices/:id/download`.
- `POST /rentals/:id/invoice/generate` — build/refresh the master (settlement) invoice.
- `POST /rentals/:id/clear` — settle outstanding payable (deposit credit + cash) and close.

---

## Invoice lifecycle & the master (settlement) invoice

One rental accrues a running invoice history; the **master invoice** (`type: "final"`)
is the settlement document.

```
confirm  ─▶ tax_invoice  (rent + deposit held)                     [type: tax_invoice]
 due −24h ─▶ EMAIL rent invoice (pre-due reminder, once)           SPEC-008 / SPEC-011
 overdue  ─▶ each calendar day: refresh running invoice → EMAIL    (Overdue day 1..N lines)
 return   ─▶ inspect (3 photos + damage, SPEC-007)
 GENERATE ─▶ MASTER invoice = rent + Overdue day 1..N + damage     [type: "final"]
             LESS deposit applied (held credit) ─▶ final payable   → added to history
 CLEAR    ─▶ apply deposit + collect remainder (cash) + close      → balance ₹0
```

- **Deposit is a held credit, never a charge line.** The master invoice shows charges,
  then `Less: deposit applied`, then **final payable = charges − payments − deposit applied**.
  (Fixes the earlier "deposit added to total" bug.)
- **Overdue days** render as discrete `Overdue day N` lines. They are derived from the
  late-fee policy (SPEC-008) via `computeOverdueSchedule`, whose per-day sum reconciles
  **exactly** with the total late fee even under a cap (later days contribute 0).
- **Idempotent:** one `final` invoice per rental — `generate` and `close` upsert the same doc.
- **Generate** is the explicit "Generate invoice" button (adds/refreshes in history, downloadable).
- **Clear** is the one-click settle: applies the deposit credit, collects the remainder as
  cash, and transitions the rental to `closed`.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Admin can create a quotation for a customer with products, variants, periods, dates. | Must |
| FR-2 | Quotation totals resolve rental price (SPEC-003) + deposit (SPEC-006). | Must |
| FR-3 | Admin can confirm a quotation, generating a rental order + invoice. | Must |
| FR-4 | Admin collects payment + deposit at confirmation. | Must |
| FR-5 | Admin can create/reuse quotation templates for faster quotation creation. | Should |
| FR-6 | Admin can configure quotation/invoice header & footer. | Should |
| FR-7 | Quotation can be sent to a client before confirmation. | Should |
| FR-8 | Invoice is downloadable (admin and, for that customer, portal — SPEC-004). | Must |
| FR-9 | A rental keeps a full invoice history (tax invoice on confirm → master/final on settlement). | Must |
| FR-10 | "Generate invoice" builds/refreshes the master invoice (rent + per-day overdue + damage) and adds it to history. | Must |
| FR-11 | Master invoice applies the security deposit as a **credit** (`final payable = charges − payments − deposit applied`); deposit is never a charge line. | Must |
| FR-12 | "Clear" settles the outstanding payable (deposit credit + cash) and closes the rental in one action. | Must |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Prices/deposits resolved server-side; not editable to arbitrary values without audit. | Must |
| NFR-2 | Quotation → order → invoice creation is atomic on confirm. | Must |
| NFR-3 | Only admins can create/confirm quotations and edit templates (RBAC). | Must |
| NFR-4 | Every confirmation/price override is recorded in the audit trail (SPEC-000). | Must |
| NFR-5 | Invoice numbering is unique and sequential. | Should |

---

## Accepted criteria

- [ ] FR-1 Quotation creation works with correct line items.
- [ ] FR-2 Totals include rental + deposit.
- [ ] FR-3 Confirm creates order + invoice.
- [ ] FR-4 Payment + deposit recorded at confirm.
- [ ] FR-5 Template speeds up creation (prefilled).
- [ ] FR-6 Header/footer appear on generated documents.
- [ ] NFR-2 confirm is atomic (test rollback).
- [ ] NFR-3 non-admin cannot confirm (test).

## Edge cases considered

- Confirming a quotation whose products became unavailable → blocked/re-checked.
- Admin manual price override → allowed but audited (NFR-4).
- Confirm partially fails (invoice yes, payment no) → rollback (NFR-2).
- Template referencing a discontinued product/pricelist.

## Testing guidelines

- Integration: create → (template) → confirm → invoice → pay.
- Negative: non-admin confirm → 403; unavailable product at confirm.

## Security

**Done:** server-side pricing (NFR-1), atomic confirm (NFR-2), admin RBAC (NFR-3), audit (NFR-4).
**Not yet done:** approval workflow for large overrides. Defer.
**Vuln tests:** portal_user hitting `/quotations/:id/confirm`; unaudited price override.

## Open questions

1. Can quotations expire? If so, default validity window?
2. ~~Is invoice a rendered PDF or structured data + client render?~~ **Answered:** server-rendered PDF (PDFKit) via `GET /invoices/:id/download`; structured `totals`/`lines` also returned for on-screen render.

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- In progress — Step 2: invoice list/GET + PDF download (customer latest + admin by id). Tax invoice still issued on confirm; final on close. Deferred: quotation templates (Should).
- Done — gap-close: templates + invoice tax breakdown PDF.
- Done — settlement/master invoice: single `final` invoice per rental (upsert), per-day `Overdue day N` lines (reconcile with SPEC-008 late fee), **deposit applied as a credit** (`final payable = charges − payments − deposit`; fixes deposit-added-to-total bug). Explicit `POST /rentals/:id/invoice/generate` (Generate invoice) + `POST /rentals/:id/clear` (settle + close). Master-invoice math centralized in `lateFee.buildMasterInvoiceParts`; unit-reconciliation + generate/clear API tests added.
