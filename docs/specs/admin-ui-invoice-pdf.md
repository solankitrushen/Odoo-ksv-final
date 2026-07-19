# Admin invoice PDF (Elite layout + preview)

| Field | Value |
|---|---|
| Status | Done |
| Owner | Rental Portal |
| Created | 2026-07-19 |
| Last updated | 2026-07-19 |
| Target repository | ksv-odooo |
| Runtime scope | `BACKEND` PDFKit + `master-admin` rental detail |

## Spec name

**ID:** SPEC-ADMIN-UI-INVOICE-PDF  
**Title:** Elite-style rental invoice PDF + admin preview modal  
**One line:** Tax invoices render as a clean A4 PDF; admin PDF opens a modal preview with download.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | PDF shows INVOICE title, tenant brand, BILL TO, invoice meta, line table, TOTAL / TOTAL PAYABLE bar, footer | Must |
| FR-2 | Amounts use INR with en-IN grouping; deposit / late / damage appear as table lines when present | Must |
| FR-3 | Admin rental detail **PDF** opens a modal that embeds the real PDF | Must |
| FR-4 | Modal has **Download PDF** that saves `{invoiceNumber}.pdf` | Must |
| FR-5 | Existing download routes keep working for email + customer portal | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | No new PDF stack (stay on PDFKit) | Must |
| NFR-2 | Standard Helvetica only (no ₹ glyph) — label currency as INR | Must |

## What this spec does

### In scope

- Rewrite `renderInvoicePdf` Elite layout
- Admin rental detail modal preview + download

### Out of scope

- Uploaded logo image / custom brand colors
- HTML→PDF / Puppeteer
- Customer portal modal (download-only remains)

## How it works

```
Admin PDF click → GET /admin/invoices/:id/download → blob
       → modal iframe(blob URL) + Download button
Email / customer download → same renderInvoicePdf
```

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [x] | FR-1 | PDF buffer is valid and downloadable | cartCheckoutStep2 PDF asserts |
| [x] | FR-3/4 | PDF opens modal; Download saves file | Manual on `/rentals/[id]` |

## Edge cases considered / possible

- Missing customer address → BILL TO name only
- No deposit → deposit line omitted
- Multi-page when many ledger lines

## Testing guidelines

```bash
cd BACKEND && npm test -- --testPathPattern=cartCheckoutStep2
```

## Security

| Area | Status | Notes |
|------|--------|-------|
| Authn | done | Admin JWT / customer JWT on download routes |
| Authz | done | Tenant-scoped invoice lookup; customer ownership check |
| Secrets / PII | done | Address/name on PDF; same trust as email attachment |

### Vulnerability / abuse tests

| ID | Case | Expected |
|----|------|----------|
| SEC-1 | Customer downloads another rental’s invoice | 403 / not found |

## Open questions

- Optional: embed tenant logo asset when branding settings exist

## Missed edge cases

None recorded at drafting.

## Changelog

| Date | Change |
|------|--------|
| 2026-07-19 | Initial + implemented |
