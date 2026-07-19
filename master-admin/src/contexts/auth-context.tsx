"use client";

import { apiFetch, ApiError } from "@/lib/backend-fetch";
import { clearAuthFlagCookie } from "@/lib/auth-flag-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

export type User = {
  _id: string; email: string; firstName?: string; id?: string; isActive?: boolean;
  isVerified?: boolean; lastName?: string; name?: string; role?: "admin" | "store" | "user";
};
export type VbRole = "admin" | "officer" | "manager" | "vendor";
export type TenantChoice = { tenantId: string; name?: string; slug?: string; roles: VbRole[] };
type MeResponse = { user?: User; roles?: VbRole[]; activeTenantId?: string; tenantId?: string; tenants?: TenantChoice[] };
type AuthValue = {
  activeTenantId: string | null; isAuthenticated: boolean; isLoading: boolean; isRentalAdmin: boolean;
  logout: () => Promise<void>; refresh: () => void; rentalScope: string | null; user: User | null;
  roles: VbRole[]; tenants: TenantChoice[]; isVendor: boolean; isStaff: boolean;
};
const AuthContext = createContext<AuthValue | null>(null);
const LOGOUT_PATH = process.env.NEXT_PUBLIC_LOGOUT_PATH ?? "/vb/auth/logout";
const ME_PATH = process.env.NEXT_PUBLIC_ME_PATH ?? "/vb/auth/me";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const priorScope = useRef<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryFn: async () => {
      try {
        return await apiFetch<MeResponse | User>(ME_PATH);
      } catch (error) {
        // Drop the Edge auth flag whenever the session can't be validated —
        // otherwise middleware keeps bouncing /login ↔ /dashboard forever.
        clearAuthFlagCookie();
        if (error instanceof ApiError && error.status === 401) return null;
        return null;
      }
    },
    queryKey: ["me"],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });

  const normalized = useMemo(() => {
    if (!data) return { user: null, roles: [] as VbRole[], activeTenantId: null, tenants: [] as TenantChoice[] };
    const response = data as MeResponse;
    const user = response.user ?? (data as User);
    return {
      user: user?.email ? user : null,
      roles: Array.isArray(response.roles) ? response.roles : [],
      activeTenantId: response.activeTenantId ?? response.tenantId ?? null,
      tenants: Array.isArray(response.tenants) ? response.tenants : [],
    };
  }, [data]);

  const isRentalAdmin = Boolean(normalized.user?.isActive !== false && normalized.activeTenantId && normalized.roles.includes("admin"));
  const rentalScope = isRentalAdmin && normalized.user
    ? `${normalized.activeTenantId}:${normalized.user._id ?? normalized.user.id ?? normalized.user.email}`
    : null;

  useEffect(() => {
    if (priorScope.current && priorScope.current !== rentalScope) qc.removeQueries({ queryKey: ["rental"] });
    priorScope.current = rentalScope;
  }, [qc, rentalScope]);

  const logout = useCallback(async () => {
    try { await apiFetch(LOGOUT_PATH, { method: "POST" }); } catch {}
    clearAuthFlagCookie();
    qc.removeQueries({ queryKey: ["rental"] });
    qc.setQueryData(["me"], null);
    router.replace("/auth/login");
  }, [qc, router]);

  const roles = normalized.roles;
  const isVendor = roles.includes("vendor") && !roles.some((role) => role !== "vendor");
  const value: AuthValue = {
    activeTenantId: normalized.activeTenantId,
    isAuthenticated: Boolean(normalized.user),
    isLoading,
    isRentalAdmin,
    logout,
    refresh: () => { void refetch(); },
    rentalScope,
    user: normalized.user,
    roles,
    tenants: normalized.tenants,
    isVendor,
    isStaff: roles.some((role) => role === "admin" || role === "officer" || role === "manager"),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
