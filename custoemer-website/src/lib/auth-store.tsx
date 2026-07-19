"use client";

// Real customer auth against /rental/public/:slug/auth (email + password / OTP).
// Profile + addresses sync to /rental/customer/me (account-scoped, reused at checkout).

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  authLogin,
  authOtpVerify,
  authRegister,
  authVerifyEmail,
  authResendVerification,
  normalizeEmail,
  normalizePhone,
  type RegisterResult,
} from "./rental-public-api";
import { fetchMe, updateMe, replaceMyAddresses, type CustomerAddress } from "./rental-api";
import {
  type Session,
  readSession,
  writeSession,
  clearSession as clearStoredSession,
  subscribeSession,
  readAddresses,
  writeAddresses,
} from "./session";
import type { Address, CustomerProfile } from "./domain/types";

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  return { firstName: parts[0] || "Customer", lastName: parts.slice(1).join(" ") };
}

function toLocalAddress(a: CustomerAddress): Address {
  return {
    id: a.id,
    label: a.label || "Address",
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || undefined,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}

function sessionToProfile(session: Session, email: string, addresses: Address[]): CustomerProfile {
  const { firstName, lastName } = splitName(session.displayName);
  return {
    id: session.customerId,
    firstName,
    lastName,
    email,
    phone: session.phone,
    addresses,
  };
}

interface AuthContextValue {
  user: CustomerProfile | null;
  session: Session | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithOtp: (email: string, otp: string) => Promise<void>;
  register: (data: {
    displayName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ devCode?: string }>;
  logout: () => void;
  clearSession: () => void;
  updateProfile: (patch: { displayName?: string; phone?: string }) => Promise<void>;
  addresses: Address[];
  saveAddresses: (next: Address[]) => Promise<Address[]>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMAIL_KEY = "rental-session-email-v1";

function readEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const applyCustomer = useCallback((customer: {
    displayName?: string;
    phone?: string | null;
    email?: string | null;
    addresses?: CustomerAddress[];
  }, base?: Session | null) => {
    const prev = base ?? readSession();
    if (!prev) return;
    const next: Session = {
      ...prev,
      displayName: customer.displayName || prev.displayName,
      phone: customer.phone ?? prev.phone,
    };
    writeSession(next);
    if (customer.email) {
      writeEmail(customer.email);
      setEmail(customer.email);
    }
    if (customer.addresses) {
      const mapped = customer.addresses.map(toLocalAddress);
      setAddresses(mapped);
      writeAddresses(mapped);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const s = readSession();
    if (!s?.accessToken) return;
    try {
      const { customer } = await fetchMe(s.accessToken);
      applyCustomer(customer, s);
    } catch {
      // keep local cache
    }
  }, [applyCustomer]);

  useEffect(() => {
    setSession(readSession());
    setEmail(readEmail());
    setAddresses(readAddresses());
    setHydrated(true);
    const unsub = subscribeSession(setSession);
    // Pull server profile + addresses when a session exists.
    void (async () => {
      const s = readSession();
      if (!s?.accessToken) return;
      try {
        const { customer } = await fetchMe(s.accessToken);
        applyCustomer(customer, s);
        // One-time migrate local-only addresses up to the account.
        const local = readAddresses();
        if ((!customer.addresses || customer.addresses.length === 0) && local.length > 0) {
          const out = await replaceMyAddresses(
            local.map((a) => ({
              id: a.id.startsWith("a") ? undefined : a.id,
              label: a.label,
              fullName: a.fullName,
              phone: a.phone,
              line1: a.line1,
              line2: a.line2,
              city: a.city,
              state: a.state,
              pincode: a.pincode,
              isDefault: a.isDefault,
            })),
          );
          const mapped = out.addresses.map(toLocalAddress);
          setAddresses(mapped);
          writeAddresses(mapped);
        }
      } catch {
        // offline / expired — keep local
      }
    })();
    return unsub;
  }, [applyCustomer]);

  const persistTokens = useCallback(
    async (tokens: { accessToken: string; refreshToken: string }, customerId: string, nextEmail: string, displayName: string, phone = "") => {
      const base: Session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        customerId,
        displayName,
        phone,
      };
      writeSession(base);
      writeEmail(nextEmail);
      setEmail(nextEmail);
      try {
        const { customer } = await fetchMe(tokens.accessToken);
        applyCustomer(customer, base);
      } catch {
        // profile enrichment is best-effort
      }
    },
    [applyCustomer],
  );

  const login = useCallback(
    async (rawEmail: string, password: string) => {
      const normalized = normalizeEmail(rawEmail);
      const out = await authLogin({ email: normalized, password });
      await persistTokens(out.tokens, out.customerId, normalized, normalized.split("@")[0] ?? "Customer");
    },
    [persistTokens],
  );

  const loginWithOtp = useCallback(
    async (rawEmail: string, otp: string) => {
      const normalized = normalizeEmail(rawEmail);
      const out = await authOtpVerify({ email: normalized, otp });
      await persistTokens(out.tokens, out.customerId, normalized, normalized.split("@")[0] ?? "Customer");
    },
    [persistTokens],
  );

  // Register no longer logs in — the backend requires email verification first.
  const register = useCallback(
    async (data: { displayName: string; email: string; password: string; phone?: string }) => {
      const normalized = normalizeEmail(data.email);
      const phone = data.phone?.trim() ? normalizePhone(data.phone) : undefined;
      return authRegister({
        email: normalized,
        password: data.password,
        displayName: data.displayName.trim(),
        phone,
      });
    },
    [],
  );

  const verifyEmail = useCallback(
    async (rawEmail: string, code: string) => {
      const normalized = normalizeEmail(rawEmail);
      const out = await authVerifyEmail({ email: normalized, code });
      await persistTokens(
        out.tokens,
        out.customerId,
        normalized,
        normalized.split("@")[0] ?? "Customer",
      );
    },
    [persistTokens],
  );

  const resendVerification = useCallback(async (rawEmail: string) => {
    const out = await authResendVerification(normalizeEmail(rawEmail));
    return { devCode: out.devCode };
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    try {
      localStorage.removeItem(EMAIL_KEY);
    } catch {
      // ignore
    }
    setEmail("");
    // Keep addresses in local cache keyed globally — they re-sync on next login via account.
  }, []);

  const saveAddresses = useCallback(async (next: Address[]) => {
    setAddresses(next);
    writeAddresses(next);
    const out = await replaceMyAddresses(
      next.map((a) => ({
        id: /^[a-f\d]{24}$/i.test(a.id) ? a.id : undefined,
        label: a.label,
        fullName: a.fullName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        isDefault: a.isDefault,
      })),
    );
    const mapped = out.addresses.map(toLocalAddress);
    setAddresses(mapped);
    writeAddresses(mapped);
    return mapped;
  }, []);

  const updateProfile = useCallback(async (patch: { displayName?: string; phone?: string }) => {
    const body: { displayName?: string; phone?: string } = {};
    if (patch.displayName != null) body.displayName = patch.displayName.trim();
    if (patch.phone != null) body.phone = patch.phone.trim() ? normalizePhone(patch.phone) : "";
    const { customer } = await updateMe(body);
    applyCustomer(customer);
  }, [applyCustomer]);

  const user = session ? sessionToProfile(session, email, addresses) : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken: session?.accessToken ?? null,
        isAuthenticated: !!session?.accessToken,
        hydrated,
        login,
        loginWithOtp,
        register,
        verifyEmail,
        resendVerification,
        logout,
        clearSession: logout,
        updateProfile,
        addresses,
        saveAddresses,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
