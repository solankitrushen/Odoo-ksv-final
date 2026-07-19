// Client-side session + address persistence. Tokens live in localStorage under a
// versioned key; addresses stay local-only (no backend endpoint).

import type { Address } from "./domain/types";

const SESSION_KEY = "rental-session-v2";
const LEGACY_SESSION_KEY = "rental-session-v1";
const ADDRESSES_KEY = "rental-addresses-v1";

export interface Session {
  accessToken: string;
  refreshToken: string;
  customerId: string;
  displayName: string;
  phone: string;
}

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

export function subscribeSession(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(session: Session | null) {
  for (const fn of listeners) fn(session);
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable — session stays in memory via listeners
  }
  notify(session);
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  notify(null);
}

export function readAddresses(): Address[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADDRESSES_KEY);
    if (raw) return JSON.parse(raw) as Address[];
    // one-time migration from the v1 mock profile shape
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { addresses?: Address[] };
      localStorage.removeItem(LEGACY_SESSION_KEY);
      if (Array.isArray(parsed?.addresses) && parsed.addresses.length > 0) {
        localStorage.setItem(ADDRESSES_KEY, JSON.stringify(parsed.addresses));
        return parsed.addresses;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function writeAddresses(next: Address[]) {
  try {
    localStorage.setItem(ADDRESSES_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
