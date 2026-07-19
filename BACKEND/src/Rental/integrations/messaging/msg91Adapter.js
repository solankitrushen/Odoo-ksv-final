// SPEC-RMS-DN-003 §10 MSG91 v5 adapter. Exact endpoints/auth/strict success shapes.
import { providerRequest, result, classifyHttpStatus } from "../http.js";
import { evaluateProviderOperation } from "../../config.js";
import { PROVIDERS } from "../../constants.js";
import { rentalError } from "../../errors.js";

const HOST = "control.msg91.com";
const BASE = "https://control.msg91.com";

function ensureEnabled(operation, tenantId, tenantProviderEnabled) {
  const e = evaluateProviderOperation({
    provider: PROVIDERS.MSG91,
    operation,
    tenantId,
    tenantProviderEnabled,
  });
  if (!e.effectiveEnabled) {
    throw rentalError("PROVIDER_NOT_CONFIGURED", `MSG91 ${operation} unavailable`, {
      reason: e.safeReasonCode,
    });
  }
}

function authKey() {
  return process.env.MSG91_AUTH_KEY;
}

/** SMS Flow. Strict success: {type:"success", message:<non-empty>}. */
export async function sendSms({ mobiles, variables = {}, tenantId, tenantProviderEnabled }) {
  ensureEnabled("sms", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${BASE}/api/v5/flow`,
      allowHosts: [HOST],
      headers: { accept: "application/json", authkey: authKey(), "content-type": "application/json" },
      body: {
        template_id: process.env.MSG91_SMS_FLOW_TEMPLATE_ID,
        short_url: "0",
        recipients: [{ mobiles, ...variables }],
      },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  const body = res.json();
  if (body?.type === "success" && typeof body.message === "string" && body.message.length > 0) {
    return result.success({ providerMessageId: body.message });
  }
  if (body?.type === "error") return result.rejected("provider_rejected", "sms error");
  throw rentalError("PROVIDER_CONTRACT_MISMATCH", "MSG91 SMS success shape mismatch");
}

/** WhatsApp template. Strict: {data,errors:null,status:"success",hasError:false,request_id}. */
export async function sendWhatsApp({ integratedNumber, to, components = {}, languageCode = "en", tenantId, tenantProviderEnabled }) {
  ensureEnabled("whatsapp", tenantId, tenantProviderEnabled);
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${BASE}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`,
      allowHosts: [HOST],
      headers: { accept: "application/json", authkey: authKey(), "content-type": "application/json" },
      body: {
        integrated_number: integratedNumber,
        content_type: "template",
        payload: {
          type: "template",
          template: {
            name: process.env.MSG91_WHATSAPP_TEMPLATE_NAME,
            language: { code: languageCode, policy: "deterministic" },
            to_and_components: [{ to: [to], components }],
          },
          messaging_product: "whatsapp",
        },
      },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  const body = res.json();
  const ok =
    typeof body?.data === "string" &&
    body.data.length > 0 &&
    body.errors === null &&
    body.status === "success" &&
    body.hasError === false &&
    typeof body.request_id === "string" &&
    body.request_id.length > 0;
  if (ok) return result.success({ providerMessageId: body.request_id });
  if (res.status === 400) return result.rejected("provider_rejected", "whatsapp rejected");
  throw rentalError("PROVIDER_CONTRACT_MISMATCH", "MSG91 WhatsApp success shape mismatch");
}

/** OTP send. Strict: {type:"success", request_id:<non-empty>}. */
export async function sendOtp({ mobile, tenantId, tenantProviderEnabled }) {
  ensureEnabled("otp_send", tenantId, tenantProviderEnabled);
  const qs = new URLSearchParams({
    template_id: process.env.MSG91_OTP_TEMPLATE_ID,
    mobile,
    authkey: authKey(),
  });
  let res;
  try {
    res = await providerRequest({
      method: "POST",
      url: `${BASE}/api/v5/otp?${qs.toString()}`,
      allowHosts: [HOST],
      headers: { "content-type": "application/json" },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  const body = res.json();
  if (body?.type === "success" && typeof body.request_id === "string" && body.request_id.length > 0) {
    return result.success({ requestId: body.request_id });
  }
  if (body?.type === "error") return result.rejected("provider_rejected", "otp send error");
  throw rentalError("PROVIDER_CONTRACT_MISMATCH", "MSG91 OTP send success shape mismatch");
}

/** OTP verify. Strict success: {type:"success", message:"OTP verified success"}. */
export async function verifyOtp({ mobile, otp, tenantId, tenantProviderEnabled }) {
  ensureEnabled("otp_verify", tenantId, tenantProviderEnabled);
  const qs = new URLSearchParams({ otp, mobile });
  let res;
  try {
    res = await providerRequest({
      method: "GET",
      url: `${BASE}/api/v5/otp/verify?${qs.toString()}`,
      allowHosts: [HOST],
      headers: { authkey: authKey() },
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  const body = res.json();
  if (body?.type === "success" && body.message === "OTP verified success") {
    return result.success({ verified: true });
  }
  // Any other HTTP 200 shape (incl. documented invalid) is a generic failure.
  return result.rejected("otp_invalid", "otp invalid or expired");
}

/** OTP resend (text only). Strict: {type:"success", message:"retry send successfully"}. */
export async function resendOtp({ mobile, tenantId, tenantProviderEnabled }) {
  ensureEnabled("otp_resend", tenantId, tenantProviderEnabled);
  const qs = new URLSearchParams({ authkey: authKey(), retrytype: "text", mobile });
  let res;
  try {
    res = await providerRequest({
      method: "GET",
      url: `${BASE}/api/v5/otp/retry?${qs.toString()}`,
      allowHosts: [HOST],
      headers: {},
    });
  } catch {
    return result.retryable("provider_unavailable");
  }
  const cls = classifyHttpStatus(res.status);
  if (cls === "retryable") return result.retryable("provider_unavailable");
  const body = res.json();
  if (body?.type === "success" && body.message === "retry send successfully") {
    return result.success({ resent: true });
  }
  if (body?.type === "error") return result.rejected("provider_rejected", "otp resend error");
  throw rentalError("PROVIDER_CONTRACT_MISMATCH", "MSG91 OTP resend success shape mismatch");
}
