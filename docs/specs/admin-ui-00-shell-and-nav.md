# SPEC-ADMIN-UI-00 — Admin Shell & Nav

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-00 |
| Status | Done |
| Owner | Product |
| Target repository | `master-admin` |
| Depends on | SPEC-RMS-AUTH-001, BACKEND SPEC-010 |
| Created | 2026-07-19 |

## Spec name

**ID:** SPEC-ADMIN-UI-00  
**Title:** Rental Admin Shell & Navigation  
**One line:** Auth-gated master-admin shell with sidebar nav that only lists screens that have an approved FE wiring spec.

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Unauthenticated users are redirected to `/auth/login`. | Must |
| FR-2 | Authenticated rental admin lands on `/dashboard`. | Must |
| FR-3 | Sidebar lists only nav items for shipped FE specs (hard reset: Dashboard only). | Must |
| FR-4 | Non-admin / vendor sessions cannot access dashboard chrome (rental admin gate). | Must |
| FR-5 | Logout clears session flag and returns to login. | Must |
| FR-6 | Unknown routes under dashboard show Next 404 (no dead stubs). | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Browser talks to backend only via Next/proxy helpers (`apiFetch` / `rentalGet`); no secrets in client env beyond public API base. | Must |
| NFR-2 | Nav constants are the single source for sidebar links. | Must |
| NFR-3 | InstantCafe / Clerk / cuisine leftovers removed from shell docs and unused public auth routes. | Must |

## What this spec does

### In scope

- Login page, middleware auth flag, dashboard layout, sidebar, profile logout
- Hard-reset nav policy (Dashboard only until later FE specs land)

### Out of scope

- Any feature screen content (owned by later `admin-ui-XX` specs)
- Customer portal UI

## How it works

```
Browser → middleware (auth flag) → /auth/login | (dashboard) layout
                                         │
                                         ├─ left-sidebar ← nav.constants SIDEBAR_NAV
                                         └─ page slot (only /dashboard this phase)
```

**Auth API (existing):** `GET /vb/auth/me`, `POST /vb/auth/logout` (rental admin JWT realm).

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [x] | FR-1 | Unauthed visit `/dashboard` → `/auth/login` | `middleware.ts` PUBLIC_PATHS + auth flag |
| [x] | FR-2 | Login succeeds → `/dashboard` | Login page + middleware redirect |
| [x] | FR-3 | Sidebar shows only Dashboard | `nav.constants.ts` SIDEBAR_NAV |
| [x] | FR-4 | Non-admin blocked by rental admin boundary | Existing rental admin gate |
| [x] | FR-5 | Logout → login | Profile dropdown + auth context |
| [x] | FR-6 | `/customers` etc. 404 after hard reset | `npm run build` routes: `/dashboard` only |
| [x] | NFR-3 | No signup route; FRONTEND.md describes JWT admin | Signup removed; FRONTEND.md rewrite |

## Edge cases

- Stale auth cookie → middleware clears flag and sends to login
- Tenant switch invalidates rental query cache (existing auth context)

## Testing guidelines

```bash
cd master-admin && npm run build
# Manual: login → sidebar → logout
```

## Security

| Area | Status | Notes |
|------|--------|-------|
| Authn | done | JWT via `/vb/auth/*` |
| Authz | done | admin role required for rental shell |
| Secrets / PII | done | no secrets in client beyond public URLs |

## Open questions

- None for shell hard reset.

## Changelog

- 2026-07-19 — Hard reset shipped; Dashboard-only nav; acceptance checked.
- 2026-07-19 — Draft for hard reset; Dashboard-only nav.
