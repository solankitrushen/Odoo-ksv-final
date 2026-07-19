// SPEC-RMS-001 §16 / SPEC-RMS-DN-003 §8 rental configuration + provider enablement.
// Reads env at call time so deployment/tests can toggle safely.
import { ROLLOUT_MODE, PROVIDERS } from "./constants.js";

const isProd = () => process.env.NODE_ENV === "production";

export function isModuleEnabled() {
  // Default on outside production so the module and its tests run; production
  // must opt in explicitly.
  if (isProd()) return process.env.RENTAL_MODULE_ENABLED === "true";
  return process.env.RENTAL_MODULE_ENABLED !== "false";
}

export function getRolloutMode() {
  const raw = process.env.RENTAL_PROVIDER_ROLLOUT_MODE;
  if (!raw) return isProd() ? ROLLOUT_MODE.DISABLED : ROLLOUT_MODE.ALL;
  if (!Object.values(ROLLOUT_MODE).includes(raw)) {
    // Invalid mode is treated as disabled at runtime; assertRentalConfig fails boot.
    return ROLLOUT_MODE.DISABLED;
  }
  return raw;
}

export function getEnabledTenantIds() {
  return String(process.env.RENTAL_ENABLED_TENANT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function rolloutAllowsTenant(tenantId) {
  const mode = getRolloutMode();
  if (mode === ROLLOUT_MODE.ALL) return true;
  if (mode === ROLLOUT_MODE.CANARY) {
    const list = getEnabledTenantIds();
    if (list.length === 0) return false; // canary requires a non-empty list
    return list.includes(String(tenantId));
  }
  return false; // disabled
}

const PROVIDER_GLOBAL_FLAG = {
  [PROVIDERS.RAZORPAY]: "RAZORPAY_ENABLED",
  [PROVIDERS.BORZO]: "BORZO_ENABLED",
  [PROVIDERS.MSG91]: "MSG91_ENABLED",
};

export function providerGlobalEnabled(provider) {
  const flag = PROVIDER_GLOBAL_FLAG[provider];
  return flag ? process.env[flag] === "true" : false;
}

/** Operation-specific credential presence. Returns true only when valid. */
export function credentialsValidForOperation(provider, operation) {
  const env = process.env;
  if (provider === PROVIDERS.RAZORPAY) {
    if (operation === "webhook") return Boolean(env.RAZORPAY_WEBHOOK_SECRET);
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }
  if (provider === PROVIDERS.BORZO) {
    if (operation === "callback") return Boolean(env.BORZO_CALLBACK_SECRET);
    return Boolean(env.BORZO_BASE_URL && env.BORZO_AUTH_TOKEN);
  }
  if (provider === PROVIDERS.MSG91) {
    if (!env.MSG91_AUTH_KEY) return false;
    switch (operation) {
      case "sms":
        return Boolean(env.MSG91_SMS_FLOW_TEMPLATE_ID);
      case "whatsapp":
        return Boolean(env.MSG91_WHATSAPP_TEMPLATE_NAME);
      case "otp_send":
        return Boolean(env.MSG91_OTP_TEMPLATE_ID);
      case "otp_verify":
      case "otp_resend":
        return true;
      case "callback":
        return Boolean(env.MSG91_CALLBACK_TOKEN);
      default:
        return false;
    }
  }
  return false;
}

/**
 * Full effective-enablement conjunction. tenantProviderEnabled defaults true
 * (tenant settings cannot force a false global term on, only off).
 * @returns {{ effectiveEnabled:boolean, rolloutMode:string, rolloutAllowsTenant:boolean,
 *   moduleEnabled:boolean, providerGlobalEnabled:boolean, credentialsValidForOperation:boolean,
 *   tenantProviderEnabled:boolean, state:string, safeReasonCode:string }}
 */
export function evaluateProviderOperation({ provider, operation, tenantId, tenantProviderEnabled = true }) {
  const moduleEnabled = isModuleEnabled();
  const allows = rolloutAllowsTenant(tenantId);
  const globalEnabled = providerGlobalEnabled(provider);
  const credsValid = credentialsValidForOperation(provider, operation);
  const tenantEnabled = tenantProviderEnabled !== false;
  const effectiveEnabled =
    moduleEnabled && allows && globalEnabled && credsValid && tenantEnabled;

  let safeReasonCode = "ok";
  let state = "enabled";
  if (!effectiveEnabled) {
    state = "disabled";
    if (!moduleEnabled) safeReasonCode = "module_disabled";
    else if (!allows) safeReasonCode = "rollout_excluded";
    else if (!globalEnabled) safeReasonCode = "provider_disabled";
    else if (!credsValid) {
      safeReasonCode = "unconfigured";
      state = "unconfigured";
    } else if (!tenantEnabled) safeReasonCode = "tenant_disabled";
  }

  return {
    effectiveEnabled,
    rolloutMode: getRolloutMode(),
    rolloutAllowsTenant: allows,
    moduleEnabled,
    providerGlobalEnabled: globalEnabled,
    credentialsValidForOperation: credsValid,
    tenantProviderEnabled: tenantEnabled,
    state,
    safeReasonCode,
  };
}

export function rentalTimeouts() {
  return {
    connectMs: Number(process.env.PROVIDER_CONNECT_TIMEOUT_MS) || 3000,
    totalMs: Number(process.env.PROVIDER_TOTAL_TIMEOUT_MS) || 10000,
  };
}

export function reservationTtlMinutes() {
  const v = Number(process.env.RENTAL_RESERVATION_TTL_MINUTES);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export function idempotencyTtlSeconds() {
  const v = Number(process.env.RENTAL_IDEMPOTENCY_TTL_SECONDS);
  const min = 7 * 24 * 3600;
  return Number.isFinite(v) && v >= min ? v : min;
}

export function deliveryQuoteTtlMs() {
  return 5 * 60 * 1000;
}

/** Fails fast at boot on an invalid rollout mode. */
export function assertRentalConfig() {
  const raw = process.env.RENTAL_PROVIDER_ROLLOUT_MODE;
  if (raw && !Object.values(ROLLOUT_MODE).includes(raw)) {
    throw new Error(`[env] RENTAL_PROVIDER_ROLLOUT_MODE invalid: ${raw}`);
  }
  if (getRolloutMode() === ROLLOUT_MODE.CANARY && getEnabledTenantIds().length === 0) {
    throw new Error("[env] RENTAL_PROVIDER_ROLLOUT_MODE=canary requires RENTAL_ENABLED_TENANT_IDS");
  }
}
