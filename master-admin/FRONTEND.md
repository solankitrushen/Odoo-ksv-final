# Rental Admin — Frontend

Next.js App Router admin for the **Rental Portal**. Auth is rental admin JWT (cookie + auth-flag middleware). The browser talks to Next route handlers / proxy helpers; secrets stay server-side.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js (App Router) |
| Auth | Rental admin JWT via backend login + `AUTH_FLAG` cookie |
| UI | shadcn/ui + Tailwind |
| Data | TanStack Query + `rentalGet` / `rental-api` |
| Theme | next-themes |
| Language | TypeScript |

---

## Hard reset (current scope)

Shell + operations dashboard only. Other screens rebuild from `docs/specs/admin-ui-*.md` against `BACKEND/spec/`.

| Keep | Notes |
|------|--------|
| `(auth)/auth/login` | Rental admin sign-in |
| `(dashboard)/layout` + `components/layout/*` | Shell |
| `contexts/auth-context.tsx`, `middleware.ts` | Session |
| `lib/rental-api.ts`, `rental-types.ts`, `backend-fetch.ts` | API wiring |
| `/dashboard` | SPEC-ADMIN-UI-09 → `GET /admin/dashboard` (+ overdue) |

Nav: `SIDEBAR_NAV` → Dashboard only (`src/constants/nav.constants.ts`).

---

## Project structure (relevant)

```
master-admin/src/
├── app/
│   ├── (auth)/auth/login/…     # JWT login
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── dashboard/page.tsx  # Ops KPIs + overdue worklist
│   └── api/                    # Proxies where needed
├── components/layout/          # Sidebar, header, shell
├── components/features/dashboard/
├── constants/nav.constants.ts
├── contexts/auth-context.tsx
├── hooks/rental/
├── lib/rental-api.ts
└── middleware.ts               # Public: /auth/login, /auth/forgot
```

---

## Specs

| Spec | Path |
|------|------|
| Shell | `docs/specs/admin-ui-00-shell-and-nav.md` |
| Dashboard | `docs/specs/admin-ui-09-operations-dashboard.md` |
| Rebuild queue | `docs/specs/admin-ui-BUILD-ROADMAP.md` |
| API truth | `BACKEND/spec/` (e.g. SPEC-009) |

---

## Environment

See `.env.example`. Typical:

- `NEXT_PUBLIC_APP_NAME` — e.g. Renton Admin
- Backend URL / login path for rental admin JWT
- `AUTH_FLAG_SECRET` — middleware cookie verification

---

## Commands

```bash
cd master-admin
npm install
npm run dev
npm run build
```
