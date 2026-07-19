# MSG91 v5 provider contract evidence

Status: **Approved for implementation**  
Retrieved: **2026-07-18**  
Normative manifest: [`manifest.json`](manifest.json)

These sanitized fixtures lock the operation-level MSG91 request and response surface used by SPEC-RMS-001: SMS Flow send, WhatsApp transactional template send, and OTP send/verify/resend. `auth-fields.json` defines the exact auth/header location per operation. Every request uses synthetic identifiers and destinations; every response preserves the documented JSON shape while replacing provider IDs and PII.

## Locked contracts

| Operation | Method | Official source | Authentication | Strict success body |
|---|---|---|---|---|
| SMS Flow | `POST /api/v5/flow` | [Send SMS](https://docs.msg91.com/sms/send-sms) | `authkey` header | `{type:"success",message:<provider-id>}` |
| WhatsApp template | `POST /api/v5/whatsapp/whatsapp-outbound-message/bulk/` | [Send WhatsApp Template](https://docs.msg91.com/whatsapp/template-bulk) | `authkey` header | `{data,errors:null,status:"success",hasError:false,request_id}` |
| OTP send | `POST /api/v5/otp` | [SendOTP](https://docs.msg91.com/otp/sendotp) | `authkey` query | `{type:"success",request_id}` |
| OTP verify | `GET /api/v5/otp/verify` | [Verify OTP](https://docs.msg91.com/otp/verify-otp) | `authkey` header | `{type:"success",message:"OTP verified success"}` |
| OTP resend | `GET /api/v5/otp/retry` | [Resend OTP](https://docs.msg91.com/otp/resend-otp) | `authkey` query | `{type:"success",message:"retry send successfully"}` |

## Implementation rules

1. Verify all 16 artifact byte hashes against `manifest.json` before contract tests run.
2. Serialize only fields represented by the matching request fixture, substituting validated deployment values. Template names/IDs, integrated number, and component/Flow variables are allowlisted configuration.
3. Treat success objects as exact (`additionalProperties: false`). Missing/empty provider ID, wrong type/status/message, `hasError:true`, non-null WhatsApp `errors`, or any unknown success shape is `PROVIDER_CONTRACT_MISMATCH`.
4. Use the fixture method and auth location exactly: OTP verify/resend are `GET`; verify uses the `authkey` header, while send/resend use the query field.
5. Never log `authkey`, OTP, rendered body, or full destination. Angle-bracket values and all phone/provider IDs are non-production placeholders.
6. If the official account contract changes, disable the affected operation, replace fixtures and hashes in one reviewed change, record the new retrieval date/source URL, and rerun adapter contract tests.

The five operation-level official links above were retrieved and validated on 2026-07-18. Category landing pages are intentionally not used as the manifest’s evidence URLs.
