# Rental Portal

**Rental Management System** — catalog, bookings, deposits, late fees, pickup/return, and portal customer self-service, with a rental admin backend.

Single repository:

| App | Stack | Path | Port |
|-----|-------|------|------|
| Backend API | Node · Express · MongoDB | `BACKEND/` | 4469 |
| Admin web app | Next.js · React · Tailwind · shadcn/ui | `master-admin/` (or legacy `FRONTEND/`) | 3000 |

> Product name is **Rental Portal** — not VendorBridge. See `.cursor/rules/rental-portal-product.mdc`.

---

## Prerequisites

- **Node.js 18+**
- **MongoDB** connection string (local or Atlas)

---

## Setup

### 1. Backend

```bash
cd BACKEND
npm install
cp .env.example .env
```

Set at least these in `BACKEND/.env`:

```
MONGODB_URI=<your mongodb connection string>
JWT_SECRET=<any long random string, 32+ chars>
RENTAL_MODULE_ENABLED=true
```

SMTP (Hostinger) for email verification / login codes:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<your mailbox>
SMTP_PASS=<your password>
SENDER_EMAIL=<your mailbox>
SMTP_FROM_NAME=Rental Portal
```

Run it:

```bash
npm run dev      # http://localhost:4469
```

Auth emails use a single helper: `BACKEND/src/Utils/smtpMail.js`.

### 2. Seed (optional)

```bash
cd BACKEND
npm run seed:rental   # if available — rental fixtures
```

### 3. Frontend

```bash
cd master-admin   # or FRONTEND/master-admin if that is your checkout
npm install
```

Create `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4469/api/v1
NEXT_PUBLIC_APP_NAME=Rental Admin
```

Run it:

```bash
npm run dev      # http://localhost:3000
```

---

## Specs

| Doc | Purpose |
|-----|---------|
| [`docs/specs/README.md`](docs/specs/README.md) | Spec registry |
| [`docs/specs/rental-authentication-authorization.md`](docs/specs/rental-authentication-authorization.md) | Phase 1 auth |
| [`docs/RENTAL_ARCHITECTURE.md`](docs/RENTAL_ARCHITECTURE.md) | Boundaries |

---

## Roles

- **Rental admin** — catalog, customers, quotes, pickups/returns, deposits, dashboard.
- **Portal customer** — register/verify email, browse, rent, orders, profile.

---

## Production build

```bash
cd BACKEND && npm start
cd master-admin && npm run build && npm start
```
