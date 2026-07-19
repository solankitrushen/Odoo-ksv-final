"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RentalAdminBoundary } from "@/components/auth/rental-admin-boundary";
import { RequireAuth } from "@/components/auth/require-auth";
import { PageTitleProvider } from "@/contexts/page-title-context";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireAuth><RentalAdminBoundary><PageTitleProvider><DashboardLayout>{children}</DashboardLayout></PageTitleProvider></RentalAdminBoundary></RequireAuth>;
}
