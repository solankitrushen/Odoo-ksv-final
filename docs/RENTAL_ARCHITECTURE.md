# Rental Management System Architecture

> Boundaries and ownership for rental. Behavior and acceptance live in [`docs/specs/`](specs/). Phase 1 authority: [`SPEC-RMS-AUTH-001`](specs/rental-authentication-authorization.md).

| Field | Value |
|---|---|
| Status | **Draft** — Phase 1 auth/email |
| Date | 2026-07-18 |
| Runtime | Express monolith + MongoDB/Mongoose |
| API | `http://localhost:4469/api/v1` |
| Module | `BACKEND/src/Rental/` |
| Admin UI / Portal UI | **Not in Phase 1** |

## 1. Executive decision

Build rental as a **modular domain** inside the existing Express monolith. Two human principals:

| Principal | Realm | How auth works |
|-----------|-------|----------------|
| Admin (operator) | `vb` (legacy realm id) | Rental-admin JWT + **active `admin` membership** |
| Portal Customer | `rental_customer` | Dedicated customer JWT (`tenantId` + `customerId`) after email verification |

Do **not** reuse food `Order`, procurement `PurchaseOrder`/`Invoice`, or legacy IMS collections for rental records.

Prior “customer UI: none / no customer auth” architecture is **revoked**. Portal customer auth is in scope for Phase 1 backend APIs (UI later).

## 2. Spec storage and registry

| Artifact | Path |
|----------|------|
| Spec registry | `docs/specs/README.md` |
| Spec template | `docs/specs/_SPEC_TEMPLATE.md` |
| Master product | `docs/specs/rental-management-system.md` |
| Phase 1 AUTH | `docs/specs/rental-authentication-authorization.md` |
| This architecture | `docs/RENTAL_ARCHITECTURE.md` |

Implementation updates acceptance checkboxes in specs after tests pass. Specs are never stored under `BACKEND/src/`.

## 3. HTTP mount

| Surface | Mount | Chain |
|---------|-------|-------|
| Admin | `/api/v1/rental/admin/*` | module flag → VB `authMiddleware` → `requireActiveAdmin` |
| Customer | `/api/v1/rental/customer/*` | module flag → `customerAuth` (rental JWT) |
| Public | `/api/v1/rental/public/:tenantSlug/*` | module flag → active tenant by slug |
| Webhooks | `/api/v1/rental/webhook/*` | raw body + provider verify (later phases) |

Module disabled → **404** (no capability disclosure).

## 4. Auth data ownership

```
Tenant (existing)
   │
   ├── VbUser / VbMembership ──► Admin rental access (role admin only)
   │
   └── RentalCustomer
          ├── RentalIdentityClaim (email/phone uniqueness)
          └── RentalCustomerAuth (password, verify/OTP challenges, credentialsVersion)
```

**Rules:**

- `tenantId` always from trusted principal or public slug resolution — never from client tenant fields after auth.
- Customer password and OTP/verify hashes: `select: false`; bcrypt passwords; HMAC for codes.
- Audit auth lifecycle without storing raw codes or passwords.

## 5. SMTP / email (single helper)

| Concern | Rule |
|---------|------|
| Helper | [`BACKEND/src/Utils/smtpMail.js`](../BACKEND/src/Utils/smtpMail.js) — **only** Hostinger SMTP transport |
| Auth codes | `sendAuthCodeEmail` — register verify, login OTP, password-reset (admins, users, rental portal) |
| Other mail | `sendSmtpMail` — legacy templates use the same transporter |
| Config | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SENDER_EMAIL`, `SMTP_FROM_NAME` |
| Fail closed | Required auth-code send + missing SMTP → error (`PROVIDER_NOT_CONFIGURED` / throw) |
| Dev echo | `RENTAL_OTP_DEV_ECHO=true` only if `NODE_ENV !== "production"` (rental portal) |
| Test | Skip real send; assert challenge persistence |

Do **not** add parallel nodemailer clients. `otpManager.js` only generates OTPs; it does not own SMTP.

## 6. Security boundaries

1. Realm separation enforced in middleware (SEC tests in AUTH spec).
2. Unverified email → no session tokens.
3. Rate-limit public verify/resend/OTP endpoints.
4. Generic errors to reduce account enumeration on login/OTP.
5. No secrets in responses, logs, or git.
6. Mass-assignment allowlists on customer profile PATCH.
7. CSRF remains as project-wide middleware for cookie sessions; Bearer customer tokens follow existing API conventions.

## 7. Layering

```
routes → validators (Zod) → services → schema / mail helper / tx
```

Pricing, payments, and providers must not live inside auth services. Auth services must not send provider SMS in Phase 1.

## 8. Later phases (not designed here)

Catalog/pricing, cart/orders, deposits/late fees, quotations/PDFs, dashboard KPIs, Borzo, Razorpay, MSG91 — each gets its own spec under `docs/specs/` after AUTH Must items are Done.

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-07-18 | Replaced admin-only architecture with Portal+Admin Phase 1 auth/email boundaries and spec registry paths. |
