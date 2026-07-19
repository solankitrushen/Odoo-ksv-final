# Razorpay payments provider contract evidence

Status: **Draft pending audit**  
Retrieved: **2026-07-18**  
Normative manifest: [`manifest.json`](manifest.json)

This tree contains sanitized, deterministic fixtures for the Razorpay operations required by the rental payment specification: order creation, checkout signature verification context, payment fetch, payment/order webhooks, partial and full refunds, and refund lifecycle webhooks. All identifiers, customer data, receipts, notes, credentials, and timestamps are synthetic. No fixture was captured from a live account.

## Locked boundaries

| Boundary | Contract |
|---|---|
| API authentication | `Authorization: Basic base64(key_id:key_secret)` over HTTPS to `api.razorpay.com` |
| Order create | `POST /v1/orders`; integer paise, `INR`, unique opaque receipt |
| Payment fetch | `GET /v1/payments/:id`; validate payment/order IDs, amount, currency, `status`, and `captured` |
| Checkout verification | HMAC-SHA256 of server-stored `order_id + "|" + razorpay_payment_id`; lowercase hex digest |
| Webhooks | HMAC-SHA256 of exact raw request bytes with webhook secret; lowercase hex in `X-Razorpay-Signature`; dedupe with `x-razorpay-event-id` |
| Refunds | `POST /v1/payments/:id/refund`; partial sends integer `amount`, full omits `amount` |

## Fixture rules

1. `manifest.json` is the root of trust and hashes every non-manifest artifact, including this README. A manifest cannot contain its own digest without recursion; CI records the manifest digest separately as release evidence.
2. JSON files are UTF-8, two-space indented, and newline-terminated. Raw webhook HMAC vectors include that final newline.
3. `signature-vectors.json` uses explicit test-only secrets and contains reproducible expected lowercase hexadecimal HMACs. Those values are not deployment credentials.
4. Provider responses are untrusted. Contract tests validate required identity/money/state fields and reject an unknown success shape; optional provider fields may only be retained as bounded redacted evidence.
5. Webhook event order is not trusted. Captured/paid and processed refund states are monotonic; duplicates and stale events cannot post money twice or regress terminal state.
6. Any official contract change disables the affected operation until fixtures, hashes, source metadata, adapter tests, and the audit changelog are updated together.

Official documentation was retrieved by HTTPS from Razorpay documentation on 2026-07-18. Retrieval was documentation-only; no provider API or account endpoint was called.
