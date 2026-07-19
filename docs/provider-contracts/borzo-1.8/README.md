# Borzo Business API 1.8 provider contract evidence

Status: **Draft pending audit**  
Retrieved: **2026-07-18**  
Normative manifest: [`manifest.json`](manifest.json)

This tree contains sanitized, deterministic fixtures for the Borzo Business API 1.8 operations required by the rental delivery specification: `/calculate-order`, `/create-order`, `/cancel-order`, `/orders`, `/courier`, order callbacks, and delivery callbacks. It includes independent outbound and return-leg mapping, explicit `is_return_required` coverage, quote-change decisions, provider errors, and raw-body callback HMAC vectors. No fixture was captured from a live Borzo account.

## Locked boundaries

| Boundary | Contract |
|---|---|
| API authentication | `X-DV-Auth-Token` header over HTTPS |
| Test base | `https://robotapitest-in.borzodelivery.com/api/business/1.8` |
| Production base | `https://robot-in.borzodelivery.com/api/business/1.8` |
| Writes | JSON UTF-8 POST bodies; reads use query parameters |
| Success/error | HTTP 200 with `is_successful:true`; HTTP 400 with `is_successful:false`, `errors`, and `parameter_errors` |
| Callbacks | POST JSON UTF-8; HMAC-SHA256 over exact raw body; lowercase hex in `X-DV-Signature` |

## Runtime interpretation

Rental outbound and return are independent internal shipment legs and normally create separate Borzo orders with `is_return_required:false`; the return-leg fixtures reverse pickup/drop-off ownership. The `is_return_required:true` fixture is retained to lock the documented provider field and prevent accidental silent use. It does not authorize collapsing the two rental legs into one provider order.

`quote-change.example.json` demonstrates all local decisions: unchanged quote may create; amount, warning, or payload-hash change returns `DELIVERY_QUOTE_CHANGED`; an expired quote never calls Borzo. Provider status and callback timestamps never override the specification's rank-max non-regression rule.

## Fixture rules

1. `manifest.json` is the root of trust and hashes every non-manifest artifact, including this README. A manifest cannot contain its own digest without recursion; CI records the manifest digest separately as release evidence.
2. JSON files are UTF-8, two-space indented, and newline-terminated. Callback HMAC vectors include the final newline exactly.
3. `callback-signature-vectors.json` uses an explicit test-only secret and reproducible lowercase hexadecimal HMACs; it is not a deployment credential.
4. Addresses, phones, names, IDs, coordinates, timestamps, and tracking URLs are synthetic. Contract tests must never send these fixtures to provider hosts.
5. Any official contract change disables the affected operation until fixtures, hashes, sources, adapter tests, and audit changelog are updated together.

The official Borzo Business API 1.8 page was retrieved by HTTPS on 2026-07-18. Retrieval was documentation-only; no provider API or account endpoint was called.
