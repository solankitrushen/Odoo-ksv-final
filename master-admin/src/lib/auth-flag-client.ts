// Browser-side helpers for the signed `authPresent` cookie.
// The middleware (Edge) is the only thing that verifies the signature —
// here we just persist/clear the opaque value the backend returns.

import { AUTH_FLAG_COOKIE } from "@/lib/auth-flag";

const DEFAULT_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function isSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

export function writeAuthFlagCookie(value: string, maxAgeSec = DEFAULT_MAX_AGE_SEC) {
  if (typeof document === "undefined" || !value) return;
  const parts = [
    `${AUTH_FLAG_COOKIE}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${maxAgeSec}`,
    "samesite=lax",
  ];
  if (isSecureContext()) parts.push("secure");
  document.cookie = parts.join("; ");
}

export function clearAuthFlagCookie() {
  if (typeof document === "undefined") return;
  const parts = [
    `${AUTH_FLAG_COOKIE}=`,
    "path=/",
    "max-age=0",
    "samesite=lax",
  ];
  if (isSecureContext()) parts.push("secure");
  document.cookie = parts.join("; ");
}

export type AuthFlagResponse = {
  authFlag?: string;
  authFlagMaxAgeSec?: number;
};

export function persistAuthFlagFromResponse(data: AuthFlagResponse | null | undefined) {
  if (!data?.authFlag) return false;
  writeAuthFlagCookie(data.authFlag, data.authFlagMaxAgeSec ?? DEFAULT_MAX_AGE_SEC);
  return true;
}
