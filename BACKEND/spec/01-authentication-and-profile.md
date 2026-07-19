# SPEC-001 — Authentication & Profile

| Field | Value |
|-------|-------|
| ID | SPEC-001 |
| Status | Done |
| Owner | Product |
| Depends on | SPEC-000 |
| Referenced by | SPEC-002, 004, 010 |

## Spec name

**ID:** SPEC-001
**Title:** Authentication & Profile
**One line:** Splash → login/registration → profile creation → dashboard, with role-based access control for portal users and admins.

---

## What this spec does

Owns identity: how a user enters the system, proves who they are, creates and manages
their profile (including profile image), and is routed by role. Establishes the RBAC
boundary that all other specs rely on.

**Out of scope:** order/address management once inside the app (SPEC-004), admin user
record management (SPEC-010).

---

## How it works

**Screens / flow**

```
  ┌──────────┐     ┌──────────┐        first-time?  ┌──────────────┐
  │  SPLASH  │ ──▶ │  LOGIN   │ ──── no ──────────▶ │   SIGN UP     │
  └──────────┘     └────┬─────┘                     └──────┬───────┘
                        │ success                          │
                        ▼                                  ▼
                  ┌─────────────┐                  ┌──────────────┐
                  │  role check │◀──────────────── │ PROFILE      │
                  └──────┬──────┘   after signup   │ CREATION      │
             portal │        │ admin               └──────────────┘
                    ▼        ▼
          Portal dashboard   Admin dashboard (SPEC-009)
```

**Modules**

- `auth` — registration, login, session/token issue + refresh, logout.
- `profile` — read/update profile fields, upload/replace profile image.
- `rbac` — role assignment (`portal_user`, `admin`), route guard middleware.

**Representative routes**

- `POST /auth/register` — new portal user.
- `POST /auth/login` — issue session/token.
- `POST /auth/logout`, `POST /auth/refresh`.
- `GET /me`, `PATCH /me` — profile read/update.
- `POST /me/photo` — profile image upload.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Splash screen shown on app start, then routes to login. | Must |
| FR-2 | New user can self-register (portal_user role by default). | Must |
| FR-3 | Registered user can log in and receive an authenticated session/token. | Must |
| FR-4 | User can create/complete a profile (name, contact, etc.) after signup. | Must |
| FR-5 | User can upload and replace a profile image. | Must |
| FR-6 | After successful auth, user is redirected to the role-appropriate dashboard. | Must |
| FR-7 | System distinguishes `portal_user` and `admin` roles and guards routes by role. | Must |
| FR-8 | User can log out, invalidating the session. | Must |
| FR-9 | User can update editable profile fields later. | Should |
| FR-10 | Password reset / recovery flow. | Should |

---

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Security — passwords stored with a strong one-way hash; never logged. | Must |
| NFR-2 | Security — auth tokens expire; refresh rotates; logout revokes. | Must |
| NFR-3 | Validation — all auth/profile inputs validated & sanitized at the boundary. | Must |
| NFR-4 | RBAC enforced server-side on every protected route (not just UI). | Must |
| NFR-5 | Profile image upload validated for type/size; stored safely. | Must |
| NFR-6 | Performance — login p95 < 300ms (excluding network). | Should |

---

## Accepted criteria

- [ ] FR-1 Splash → login routing works on cold start.
- [ ] FR-2 Registration creates a portal_user.
- [ ] FR-3 Login issues a valid session/token.
- [ ] FR-4 Profile creation completes and persists.
- [ ] FR-5 Profile image upload + replace works.
- [ ] FR-6 Post-auth redirect matches role.
- [ ] FR-7 Portal user blocked from admin routes; admin allowed.
- [ ] FR-8 Logout invalidates session.
- [ ] NFR-1 Passwords hashed; verified in storage.
- [ ] NFR-4 RBAC guard rejects wrong-role requests (test).

## Edge cases considered

- Duplicate email/phone on registration → clear conflict error.
- Login with unverified/incomplete profile → allowed but prompted to complete.
- Image upload of wrong type or oversized → rejected with message.
- Concurrent logins / token refresh races.

## Testing guidelines

- Unit: hashing, token issue/verify, RBAC guard.
- Integration: register → login → complete profile → hit protected route (both roles).
- Negative: wrong-role access returns 403; bad credentials return 401.

## Security

**Done (specified):** hashing (NFR-1), token lifecycle (NFR-2), input validation (NFR-3), RBAC (NFR-4), upload validation (NFR-5).
**Not yet done:** rate limiting / lockout on brute force; MFA. Defer, track here.
**Vuln tests:** privilege escalation portal→admin; token replay after logout; upload of executable disguised as image.

## Open questions

1. Login identifier — email, phone, or both?
2. Is email/phone verification required before first rental?

## Missed edge cases

_(post-review)_

## Changelog

- Draft — initial.
- Done — customer auth realm + profile/addresses; `POST /customer/me/photo` via Cloudinary.
