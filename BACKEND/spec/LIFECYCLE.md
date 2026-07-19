# Rental Portal — end-to-end lifecycle & services

Base path: `/api/v1/rental`

## Actors

| Realm | Auth | Mount |
|-------|------|--------|
| Public | tenant slug | `/public/:tenantSlug` |
| Customer | customer JWT | `/customer` |
| Admin | rental admin JWT | `/admin` |
| Webhooks | provider signatures | `/api/v1/rental/webhook` |

---

## Lifecycle (happy path)

```text
┌────────────── PUBLIC ──────────────┐
│ register → verify email → login    │
│ browse catalog (?q=) + availability│
└───────────────┬────────────────────┘
                ▼
┌────────────── CUSTOMER ────────────┐
│ profile / addresses / photo        │
│ cart add (avail gate) → preview    │
│ cart checkout → DRAFT rental       │
│ (pay via rental checkout / admin)  │
└───────────────┬────────────────────┘
                ▼
┌────────────── ADMIN OPS ───────────┐
│ reserve → assets HELD              │
│ confirm → invoice + CONFIRMED      │
│   (blocked customer → 403)         │
│ pay (manual / Razorpay)            │
│ delivery? dispatch (Borzo) → …     │
│ issue → ACTIVE (stock out)         │
│ due −24h → pre-due reminder email  │
│ overdue sweep → OVERDUE            │
│   daily overdue invoice email      │
│ return → RETURNED                  │
│ inspect (3 photos Cloudinary)      │
│   → repair WO + risk incident      │
│ generate → MASTER (final) invoice  │
│   rent + Overdue day N + damage    │
│   LESS deposit credit → payable    │
│ clear → settle payable + CLOSED    │
│   (close alone: shortfall → email) │
└────────────────────────────────────┘
```

### Status machine (rental)

`draft → reserved → confirmed → [dispatch_pending → dispatched] → active → [overdue] → returned → inspection → closed`

Cancel possible from early states.

---

## Service map (by phase)

| Phase | Services | Key routes |
|-------|----------|------------|
| Auth | `customerAuthService`, `vbAuthController` (admin) | public `/auth/*`, `/vb/auth/*` |
| Catalog | `catalogAdminService`, `publicCatalogService` | admin products/variants; public `/catalog` |
| Images | `integrations/cloudinary` | `POST /admin/products/images`, inspect photos, `POST /customer/me/photo` |
| Pricing | `catalogResolver`, `pricing`, `rentalPricing`, `taxService` | pricelists/rates; quote on draft/confirm |
| Cart | `cartService`, `availability` | `/customer/cart*` |
| Orders | `rentalService`, `availability` | admin/customer rentals; reserve/confirm/issue/return/close |
| Payments | `financeService`, Razorpay adapter | manual pay, razorpay-order, webhooks |
| Deposit | `depositLedger`, `depositStatusService`, `financeService` | apply/forfeit; `GET …/deposit` |
| Delivery | `deliveryService` (**mock 4–5 days**, Borzo off) | `dispatch`, **`confirm-delivery`**, `GET /deliveries` |
| Schedules | `scheduleService` | `/pickups`, `/returns`, `/rentals/overdue` |
| Late fees | `lateFee` (`computeRentalLateFee`, `computeOverdueSchedule`), `overdueSweep` | penalty GET; sweep job |
| Inspect | `rentalService.inspectRental` + Cloudinary | 3-angle photos required |
| Repair | `repairService` | `/admin/repairs` |
| Risk | `riskService` | block customer; `/admin/incidents` |
| Invoice | `invoiceService` (`writeFinalInvoice`), `lateFee.buildMasterInvoiceParts`, `templateService` | invoice JSON/PDF; templates; `POST /rentals/:id/invoice/generate` |
| Settlement | `rentalService.clearRental` / `closeRental` | `POST /rentals/:id/clear`, `POST /rentals/:id/close` |
| Dashboard | `reportingService` | `/dashboard`, `/dashboard/overdue` |
| Finance reports | `reportingService`, `analyticsService` | `/reports/financial`, `/reports/ar-aging` |
| Analytics | `analyticsService` | `/analytics/sales`, `/analytics/revenue` |
| Config | `catalogAdminService` settings + commercial-rules | settings, tax codes, users/roles |
| Bonus | `bonusService` | `/admin/bonus/*` (disable: `RENTAL_BONUS_DISABLED`) |
| Messaging | Msg91 adapter, `rentalMail` | OTP/SMS; settlement shortfall email |

---

## Money flow

```text
Quote (preTax + GST + deposit)
  → Confirm snapshots invoice (tax_invoice); deposit held
  → Payments allocate charge + deposit
  → Overdue: per-day late fee accrues (Overdue day N lines, cap-aware)
  → Master (final) invoice = rent + overdue days + damage
       LESS deposit applied (held credit)
       final payable = charges − payments − deposit applied
       surplus deposit → refundable
  → Clear: collect final payable (cash) → balance ₹0 → CLOSED
       (close without clear leaves shortfall → balanceDue + alerts)
```

Deposit is always a **credit** offsetting charges — never a charge line.

---

## External providers

| Provider | Used for | Config |
|----------|----------|--------|
| Cloudinary | product / inspect / profile images | `CLOUDINARY_*` |
| Razorpay | online pay + webhooks | Razorpay env + tenant toggle |
| Delivery mock | 4–5 day promise + admin confirm | no 3PL; Borzo adapter unused |
| Msg91 | OTP / SMS | Msg91 env |
| SMTP | shortfall mail; pre-due reminder; daily overdue invoice mail | mail env (`RENTAL_DUE_SOON_LEAD_HOURS`=24, `RENTAL_REMINDER_EMAILS_DISABLED`) |

Unconfigured provider → `424 PROVIDER_NOT_CONFIGURED` (core rental still works offline for manual pay / pickup).

---

## Deferred / thin

| Area | Notes |
|------|--------|
| Procurement (018) | No Must FRs — assets created manually |
| Full GL double-entry | Should — AR aging + buckets only |
| Own fleet drivers | 3PL Borzo path; no driver master |
| Bonus IoT/AI | Thin stubs under `/bonus` |
| Reserve-at-cart | Open Q — hold only after admin reserve |
