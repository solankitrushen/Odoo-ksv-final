# Customer Website ↔ Rental backend integration

| Field | Value |
|-------|-------|
| ID | SPEC-CW-001 |
| Status | In progress |
| Prerequisites | SPEC-RMS-001, SPEC-RMS-AUTH-001, SPEC-004 (cart) |
| Surface | `custoemer-website/` (Next.js 15, port 3001) |
| Backend | `BACKEND/src/Rental` at `/api/v1/rental` (port 4469) — **read-only for this spec; no backend changes** |
| Last updated | 2026-07-19 |

## Spec name

**Title:** Rental Portal storefront — real backend wiring
**One line:** The customer website drives every catalog, cart, checkout, auth, and account flow off the live Rental API — no mock fixtures, no fabricated product data.

## What this spec does

Reconciles storefront drift after backend changes (server-side cart, mandatory email verification). Removes dead mock modules and fabricated product fields, and wires each page to the real service contract read from `routes/public.js`, `routes/customer.js`, and their services.

Boundary: **no backend edits**. The frontend adapts to the backend as-is.

## API surface consumed (source of truth)

Public — `…/rental/public/:tenantSlug` (slug = `renton`):
- `POST /auth/register` → `{ customerId, tenantId, emailVerified:false, verification, devCode? }` (no tokens)
- `POST /auth/verify-email` `{email, code}` → `{ customerId, tokens, tenantId, emailVerified:true }`
- `POST /auth/resend-verification` `{email}`; `POST /auth/login`; `POST /auth/otp/request` (`devCode?`); `POST /auth/otp/verify`
- `GET /categories`, `GET /catalog` (`q`, `categoryId`, `limit`), `GET /catalog/:id`, `GET /catalog/:id/variants`, `GET /availability`

Customer — `…/rental/customer` (Bearer access token):
- `GET/PATCH /me`, `PUT /me/addresses`, `POST /me/photo`
- Cart: `GET /cart`, `PUT /cart/fulfillment` `{method:"delivery"|"pickup", addressId?}`, `POST /cart/items`, `PATCH/DELETE /cart/items/:lineId`, `DELETE /cart`, `GET /cart/preview`, `POST /cart/checkout` (needs `Idempotency-Key`)
- Rentals: `GET /rentals`, `GET /rentals/:id` (+ `/payments`, `/deposit-entries`, `/deposit`, `/penalty`, `/invoice`, `/invoice/download`), `POST /rentals/:id/checkout/razorpay-order`, `POST /rentals/:id/checkout/confirm`

Envelope: `{ success, data }` on 2xx; `{ success:false, error, message }` on error.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Catalog, PDP, and search render only real backend fields (name, brand, description, images, variants, rates). No fabricated ratings/reviews/specs/accessories. | Must |
| FR-2 | Register requires email verification: register → enter 6-digit code → tokens issued (`devCode` shown in dev). | Must |
| FR-3 | Cart is a guest local cart that syncs into the server `/cart` on login; once authenticated the server cart is the source of truth. | Must |
| FR-4 | Cart & checkout pricing (subtotal, GST, deposit, total) come from `/cart/preview`; guests see a clearly-labelled estimate. | Must |
| FR-5 | Checkout uses `PUT /cart/fulfillment` + `POST /cart/checkout` → draft rental; delivery then pays via razorpay-order/confirm. | Must |
| FR-6 | Delivery checkout requires a saved account address (`addressId`); pickup needs none. | Must |
| FR-7 | Add-to-cart sends a real rental window (`startAt`/`endAt`) + `variantId`, `quantity`, `periodCode` and surfaces availability. | Must |
| FR-8 | Account (overview, rentals, order detail, profile, addresses) stays wired to the customer API (already true) with mock store data removed. | Must |
| FR-9 | Login OTP dev echo reads `devCode`. | Should |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Type-safe: `next build` / `tsc` green. | Must |
| NFR-2 | Tokens in `localStorage`; 401 clears session and redirects to login. | Must |
| NFR-3 | No fabricated data shipped as if real (honesty). | Must |
| NFR-4 | UX craft (impeccable/hallmark) on changed surfaces within the existing design system. | Should |
| NFR-5 | Graceful empty/error/loading states on every wired surface. | Must |

## Dead code removed

`lib/api.ts`, `lib/rental-mapper.ts`, `lib/domain/{catalog,account,delivery,carriers,stores,pricing}.ts`, `components/account/shipment-tracker.tsx`. Money/period helpers consolidated into `lib/money.ts`.

## Accepted criteria

- [x] FR-1..FR-9 implemented.
- [x] Mock modules deleted; no imports dangling.
- [x] Contact page removed (no backend contact endpoint).
- [x] Catalog search uses `GET /catalog?q=&categoryId=`; PDP checks `GET /availability` before add-to-cart.
- [x] Catalog-down banner + honest empty states on home/products.
- [x] `next build` green.

## Security

- Done: Bearer token from session; 401 → clear+redirect; idempotency keys on cart checkout / payment confirm; server is authoritative for price/availability.
- Not done: refresh-token rotation (access token only; re-login on expiry).

## Changelog

| Date | Change |
|------|--------|
| 2026-07-19 | Spec created; storefront wired to live Rental API; mock fixtures removed. |
| 2026-07-19 | Removed contact; server catalog search; PDP availability gate; cut fabricated memberSince / unused createRental; API-down UX. |
