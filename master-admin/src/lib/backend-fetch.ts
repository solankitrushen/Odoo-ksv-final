import { API_URL } from "@/lib/backend-url";
import {
  persistAuthFlagFromResponse,
  type AuthFlagResponse,
} from "@/lib/auth-flag-client";

export class ApiError extends Error {
  data: unknown;
  status: number;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.data = data;
    this.status = status;
  }
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// This app's role — scopes auth cookies per app on the shared API host.
const AUTH_SCOPE = "admin";

let csrfSeeded = false;
async function ensureCsrf(): Promise<void> {
  if (readCsrfCookie() || csrfSeeded) return;
  csrfSeeded = true;
  try {
    await fetch(`${API_URL}/auth/csrf`, { credentials: "include", cache: "no-store" });
  } catch {
    /* best-effort */
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        credentials: "include",
        method: "POST",
      });
      if (!res.ok) return false;
      try {
        const body = (await res.clone().json()) as {
          data?: AuthFlagResponse;
        } & AuthFlagResponse;
        persistAuthFlagFromResponse(body?.data ?? body);
      } catch {
        /* refresh succeeded but body wasn't json; flag stays as-is */
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData = init.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (!isFormData && init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  headers["X-Auth-Scope"] = AUTH_SCOPE;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await ensureCsrf();
    const csrf = readCsrfCookie();
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  const doFetch = () =>
    fetch(url, { ...init, credentials: "include", headers });

  let res = await doFetch();

  if (res.status === 401 && !path.includes("/auth/")) {
    const ok = await refreshTokens();
    if (ok) res = await doFetch();
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (isJson && (body as { error?: string; message?: string }).error) ||
      (isJson && (body as { error?: string; message?: string }).message) ||
      res.statusText;
    throw new ApiError(res.status, message, body);
  }

  return isJson && (body as { data?: T }).data !== undefined
    ? (body as { data: T }).data
    : (body as T);
}
