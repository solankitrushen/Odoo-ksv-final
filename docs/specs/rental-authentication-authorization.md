# Rental Authentication & Authorization — Phase 1 Specification

| Field | Value |
|---|---|
| Status | **In progress** — Must auth implemented; FR-A2/A4 + Should items open |
| Owner | Product and engineering |
| Created | 2026-07-18 |
| Last updated | 2026-07-18 |
| Parent | [`SPEC-RMS-001`](rental-management-system.md) |
| Architecture | [`../RENTAL_ARCHITECTURE.md`](../RENTAL_ARCHITECTURE.md) |
| Runtime scope | `BACKEND/` — Node.js ESM, Express 4, Mongoose 7 |
| Module home | `BACKEND/src/Rental/` |
| Frontend / admin UI | **Out of scope** |
| Storage (specs) | `docs/specs/rental-authentication-authorization.md` |
| Storage (auth data) | Mongo collections below; secrets in env only |

## Spec name

**ID:** SPEC-RMS-AUTH-001  
**Title:** Rental authentication, authorization, and SMTP email verification  
**One line:** Ship secure Rental Admin and Portal Customer auth with email verification and OTP over SMTP, tenant isolation, and no realm mixing.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-A1 | Rental admin routes accept only a valid rental-admin JWT (legacy realm `vb`) whose membership is **active** and includes role `admin`. `tenantId` is taken from membership, never from the client body/query. | Must |
| FR-A2 | Membership roles `manager`, `officer`, `vendor`, inactive/revoked members, missing tenant, and expired/invalid tokens are denied on rental admin (403/401 as appropriate). | Must |
| FR-A3 | A `rental_customer` JWT is never accepted as an admin principal. Admin and customer middleware chains are distinct. | Must |
| FR-A5 | Rental admin can log in with **password** or **SMTP email OTP** (same choice as portal customer). OTP request/verify use Hostinger helper; hashed challenge on admin user. | Must |
| FR-C1 | Portal user can **register** under a public tenant slug with email, password (min 8), optional phone and display name. Creates `RentalCustomer` + `RentalCustomerAuth` + identity claims in one transaction. | Must |
| FR-C2 | Registration sends an **email verification** code via SMTP. Account remains `emailVerified=false` until verify succeeds. Unverified accounts cannot obtain a full session via password or OTP login. | Must |
| FR-C3 | Portal user can **verify email** with email + code; on success sets verified flag, clears challenge, and may issue tokens. | Must |
| FR-C4 | Portal user can **resend** verification email subject to rate limits; response does not reveal whether the email exists beyond a generic accepted shape where required. | Must |
| FR-C5 | Portal user can **password login** with email + password only when active, email verified, and password matches (bcrypt). Issues `rental_customer` access/refresh tokens carrying `tenantId`, `customerId`, credentials version. | Must |
| FR-C6 | Portal user can request a **login OTP** emailed via SMTP; code stored as HMAC hash only; TTL and attempt limits enforced; timing-safe compare. | Must |
| FR-C7 | Portal user can **verify login OTP** and receive tokens only when email verified and account active. | Must |
| FR-C8 | Authenticated customer can **GET /me** (profile + masked identity) and **PATCH /me** for allowlisted fields only (display name, phone, addresses subset). Login email is immutable after register. | Must |
| FR-C9 | Duplicate email or phone within the same tenant returns a deterministic conflict (`409`); cross-tenant duplicates are allowed. | Must |
| FR-C10 | Password change (authenticated) or admin-forced credential bump increments `credentialsVersion` and invalidates prior tokens. | Should |
| FR-C11 | Password-reset via SMTP email link/code. | Should |
| FR-E1 | All auth-code email uses shared Hostinger helper `BACKEND/src/Utils/smtpMail.js` (`sendAuthCodeEmail`) for user register, store verify, password-reset, rental portal (self + admin provision). No parallel OTP mailers. | Must |
| FR-E2 | If SMTP is not configured and delivery is required: fail closed with `424 PROVIDER_NOT_CONFIGURED` (or equivalent) for send operations. Test env may skip send. Non-production may echo OTP only when `RENTAL_OTP_DEV_ECHO=true`. | Must |
| FR-E3 | Raw OTP / verification codes never appear in application logs, audit payloads, or success responses in production. | Must |
| FR-E4 | Request endpoints for verify-email, resend, and OTP are rate-limited per tenant + email (and IP where middleware allows). | Must |
| FR-E5 | SMTP credentials (`SMTP_PASS`, etc.) never appear in API responses, client bundles, or committed files. | Must |
| FR-S1 | Every register, verify, login success/failure (without secrets), OTP request, and admin denial writes a tenant-scoped audit event where actor is known; failures that must not leak existence still audit with hashed/masked destination. | Must |
| FR-S2 | Public tenant resolution uses slug `^[a-z0-9-]{2,60}$` and active tenant only; unknown slug → 404 indistinguishably. | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Password storage | bcrypt via existing password hooks; `password` select:false. Must |
| NFR-2 | OTP / verify storage | HMAC-SHA256 (or stronger keyed hash) of code; never plaintext. Key from `JWT_SECRET` or dedicated `RENTAL_OTP_PEPPER`. Must |
| NFR-3 | Token security | JWT signed with `JWT_SECRET`; customer realm claim required; credentialsVersion binding. Must |
| NFR-4 | Tenant isolation | Every auth query includes `tenantId`; no find-by-email alone across tenants. Must |
| NFR-5 | Timing / enumeration | Login and OTP verify return generic errors; OTP request returns generic accepted when account missing. Must |
| NFR-6 | OTP TTL / attempts | TTL ≤ 10 minutes (default 5); max attempts ≤ 5 then expire challenge. Must |
| NFR-7 | Auth latency | p95 password login &lt; 500 ms excluding SMTP. Should |
| NFR-8 | Availability | Core register/login validation works when SMTP down; send paths return explicit provider error, not silent success. Must |
| NFR-9 | Observability | Structured logs with request id, tenant id, actor type; no OTP/password. Must |
| NFR-10 | Layering | routes → validators → services → schema/mail helper; no SMTP in route handlers. Must |

## What this spec does

### In scope

- Admin rental authorization gate (reuse tenant-admin auth middleware + active admin).
- Portal customer register, email verification, password login, OTP login, `/me` read/update.
- SMTP delivery for verification and login OTP with rental branding and fail-closed rules.
- Identity uniqueness via `RentalIdentityClaim` for email/phone.
- Audit, rate limits, token invalidation basics.
- Security abuse cases and test mapping.

### Out of scope

- Frontend splash/login/signup screens and admin UI.
- Profile image upload/storage (open question).
- Catalog, cart, checkout, payments, deposits, quotations, dashboard APIs (except existing admin routes remaining gated by FR-A*).
- MSG91 SMS/WhatsApp as auth channel (future Should).
- Renaming legacy `/vb` auth routes or `Vb*` models (separate migration).

## Locked auth decisions

1. **Realms:** Admin = `vb`; Customer = `rental_customer`. Never interchange.
2. **Email is login identity** for portal users; phone optional uniqueness when present.
3. **Email verification is mandatory** before password or OTP session issuance (fixes current register→immediate token gap).
4. **Admin does not use rental customer OTP**; operator auth stays rental-admin password/session.
5. **Module flag:** disabled module → 404 for all rental auth surfaces.
6. **Dev echo:** `RENTAL_OTP_DEV_ECHO=true` only when `NODE_ENV !== "production"`.

## Data storage (auth)

| Store | What | Notes |
|-------|------|-------|
| `rental_customers` | Profile, status, masked email/phone, addresses | No password |
| `rental_customer_auths` | email, password hash, otpHash, otpExpiresAt, otpAttempts, emailVerified, credentialsVersion, isActive | Secrets select:false |
| `rental_identity_claims` | Active unique email/phone per tenant | Partial unique index |
| `rental_audit_events` (or existing rental audit) | Auth lifecycle events | No raw codes |
| Env | `JWT_SECRET`, `SMTP_*`, `RENTAL_MODULE_ENABLED`, `RENTAL_OTP_DEV_ECHO` | Never commit real secrets |
| Specs | `docs/specs/*.md` | Source of truth for behavior |

### Auth document fields to add/confirm

| Field | Collection | Purpose |
|-------|------------|---------|
| `emailVerified` | `RentalCustomerAuth` | Gate login until true |
| `emailVerifyHash` / `emailVerifyExpiresAt` / `emailVerifyAttempts` | `RentalCustomerAuth` | Verification challenge (or reuse shared challenge fields with purpose discriminator) |
| `credentialsVersion` | `RentalCustomerAuth` | Token binding (exists) |

## How it works

### Principals

```
┌─────────────────┐     ┌──────────────────────┐
│ Admin (vb JWT)  │     │ Customer (rental_    │
│ + active admin  │     │  customer JWT)       │
└────────┬────────┘     └──────────┬───────────┘
         │                         │
         ▼                         ▼
 /api/v1/rental/admin/*    /api/v1/rental/customer/*
         │                         │
         └──────────┬──────────────┘
                    ▼
         tenantId from trusted principal only
```

### Portal flows

```
Register ──► SMTP verify email ──► emailVerified=true
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
           Password login        OTP request          OTP verify
                 │                    │                    │
                 └────────────────────┴────────────────────┘
                                      ▼
                              Issue customer JWT
```

### Route groups (path examples only)

```
POST /api/v1/rental/public/:tenantSlug/auth/register
POST /api/v1/rental/public/:tenantSlug/auth/verify-email
POST /api/v1/rental/public/:tenantSlug/auth/resend-verification
POST /api/v1/rental/public/:tenantSlug/auth/login
POST /api/v1/rental/public/:tenantSlug/auth/otp/request
POST /api/v1/rental/public/:tenantSlug/auth/otp/verify
GET  /api/v1/rental/customer/me
PATCH /api/v1/rental/customer/me
```

Admin: existing `/api/v1/rental/admin/*` behind `requireModuleEnabled` → tenant `authMiddleware` → `requireActiveAdmin`.

### Layers

`routes/public.js` + `routes/customer.js` → Zod validators → `customerAuthService` / mail helper → Mongoose models. Admin gate in `middleware/auth.js`.

### SMTP

- Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, from address/name.
- Rental from-name default: tenant brand or `Rental` (not `InstaCafe`).
- Purposes: `email-verify`, `login-otp`.
- Implementation may extend or replace `BACKEND/src/Utils/otpManager.js` with a rental-scoped helper under `BACKEND/src/Rental/` that does not leak InstaCafe copy into rental emails.

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [x] | FR-A1 | Admin route with valid admin JWT succeeds; wrong tenant body ignored | `api.test.js` + lifecycle |
| [ ] | FR-A2 | manager/officer/vendor → 403; bad token → 401 | Partial: bad token in api.test; non-admin role matrix not yet dedicated |
| [x] | FR-A5 | Admin password or OTP login | `vbFlow.test.js` otp login |
| [ ] | FR-A4 | Module disabled → 404 | Not covered by automated test yet |
| [x] | FR-C1 | Register creates customer+auth+claims atomically; no tokens until verify | `customerAuth.test.js` |
| [x] | FR-C2 | Unverified login/OTP → rejected | `customerAuth.test.js` |
| [x] | FR-C3 | Verify-email then login works | `customerAuth.test.js` |
| [x] | FR-C4 | Resend returns generic shape + new code (rate limiter wired; burst not load-tested) | `customerAuth.test.js` |
| [x] | FR-C5 | Password login issues realm customer tokens | `customerAuth.test.js` |
| [x] | FR-C6 | OTP stored hashed; TTL/attempts in service | Implemented; expiry/attempt lock not separately asserted |
| [x] | FR-C7 | OTP verify issues tokens only if verified | `customerAuth.test.js` |
| [x] | FR-C8 | /me GET returns profile + emailVerified | `customerAuth.test.js` (PATCH allowlist pre-existing) |
| [x] | FR-C9 | Duplicate email same tenant → 409 | `customerAuth.test.js` |
| [x] | FR-E1 | Rental mail helper subjects/from (`rentalMail.js`) | Code review + subjects in helper |
| [x] | FR-E2 | Test skips send; non-test missing SMTP → 424 via `requireSmtpForSend` | Test path covered; live 424 manual |
| [x] | FR-E3 | No raw OTP in production responses (`devCode` gated) | Code path |
| [x] | FR-E4 | Resend/OTP/login rate limiters mounted | Middleware present; high max in test |
| [x] | FR-E5 | SMTP_PASS not returned by APIs | Code review |
| [x] | FR-S1 | Audit on register/verify/login/OTP/admin deny | `writeAudit` calls in service + middleware |
| [x] | FR-S2 | Bad slug → 404 | `customerAuth.test.js` |
| [x] | NFR-1–NFR-6, NFR-8–NFR-10 | Implemented in auth path | `npm run test:rental` (94 passed) |
| [ ] | FR-C10 | Should — credential bump invalidates old JWT | Deferred |
| [ ] | FR-C11 | Should — password reset | Deferred |

## Edge cases considered / possible

- Register with existing unverified email: conflict or resend-only path (prefer 409 + resend).
- SMTP send fails after challenge persisted: return provider error; allow resend.
- Clock skew on OTP expiry: server clock authoritative.
- Empty password / whitespace email: validation 400.
- Blocked/archived customer: login denied.
- Concurrent register same email: unique index → 409.
- Admin JWT with stale membership: deny (fresh membership check as VB middleware already does).
- Customer token with mismatched `credentialsVersion`: 401.
- Cross-tenant: customer of tenant A cannot use slug of tenant B to login as A’s email without B’s auth row.

## Testing guidelines

**Prerequisites:** Mongo (replica set if transactions required), `NODE_ENV=test`, SMTP mocked or skipped.

```bash
cd BACKEND
npm run test:rental
# Auth-focused:
npx jest __tests__/rental/api/customerAuth.test.js
```

**Fixtures:** Never commit real SMTP passwords. Use `RENTAL_OTP_DEV_ECHO=true` only in test/dev.

**Manual (non-prod):** With real `SMTP_*`, register → receive verify email → verify → login; request OTP → receive → verify.

## Security

| Area | Status | Notes |
|------|--------|-------|
| Admin authn | done | Reuse VB |
| Admin authz | done | Active `admin` only; customer realm → 401 |
| Customer authn | done | Verify-before-login; bcrypt; JWT realm |
| Customer authz | done | `/me` scoped to `req.customerId` + `req.tenantId` |
| OTP / verify codes | done | Hashed, TTL, attempts, timing-safe, no prod echo |
| Enumeration | done | Generic login/OTP errors; register duplicate → 409 |
| Secrets | done | Env only; redacted logs |
| Tenant isolation | done | All auth queries filtered |
| Audit | done | Auth lifecycle without secrets |
| Rate limit | done | Public auth endpoints |
| CSRF | Existing | Cookie admin clients; Bearer customer APIs |
| Dependency | done | Reused nodemailer + express-rate-limit already in repo |

### Vulnerability / abuse tests

| ID | Case | Expected | Covered |
|----|------|----------|---------|
| SEC-1 | Customer JWT on `/rental/admin/*` | Reject 401 | yes |
| SEC-2 | Admin JWT on `/rental/customer/me` | Reject 401 | yes |
| SEC-3 | Login with wrong password | 401 generic | yes |
| SEC-4 | OTP brute force beyond max attempts | Challenge invalid | code |
| SEC-5 | Response/logs contain OTP in production config | Fail | gated echo |
| SEC-6 | Injection in email field | Validation reject | zod |
| SEC-7 | Mass-assignment on PATCH /me | Ignored/rejected | zod strict |
| SEC-8 | Module disabled probing | 404 | not automated |
| SEC-9 | Stolen refresh after password change | 401 cv | deferred C10 |
| SEC-10 | SMTP_PASS in error payload | Absent | yes |

### Known gaps (post-implementation)

| Gap | Status |
|-----|--------|
| Register without email verify | Fixed |
| InstaCafe-branded rental OTP | Fixed (`rentalMail.js`) |
| Silent success when SMTP missing | Fixed (424 outside test) |
| `emailVerified` missing | Fixed |
| Rate limits missing | Fixed |
| FR-A2 non-admin role matrix / FR-A4 module-off test | Still open |
| Profile photo / FR-C10 / FR-C11 | Deferred |

## Open questions

1. Profile image: local disk vs object storage vs defer to portal profile phase?
2. Ship FR-C10/FR-C11 next?
3. Prefer dedicated `RENTAL_OTP_PEPPER` in production (optional env added).

## Missed edge cases

None recorded beyond gaps table.

## Changelog

| Date | Change |
|------|--------|
| 2026-07-18 | Unified Hostinger SMTP helper (`smtpMail.js`); removed Gmail hardcode from `mailService`; admin portal provision; callers use `sendAuthCodeEmail`. |
| 2026-07-18 | Implemented Must auth path: verify-before-login, rental SMTP helper, rate limits, realm rejection; `npm run test:rental` 94 passed. |
| 2026-07-18 | Initial AUTH Phase 1 spec: admin + portal customer + SMTP verify/OTP + security matrix. |
