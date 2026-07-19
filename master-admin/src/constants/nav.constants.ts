import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  LayoutDashboard,
  Package,
  PackageCheck,
  Percent,
  Truck,
  Undo2,
  Users,
} from "lucide-react";

export const HEADER_ROUTES: { href: string; icon: LucideIcon; label: string }[] = [];
export type RentalRole = "admin" | "officer" | "manager";
export type SidebarNavLink = { href: string; icon: LucideIcon; label: string; roles?: RentalRole[] };

const ADMIN: RentalRole[] = ["admin"];

/** Ops MVP nav — plain labels for non-tech operators. */
export const SIDEBAR_NAV: SidebarNavLink[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ADMIN },
  { href: "/customers", icon: Users, label: "Customers", roles: ADMIN },
  { href: "/products", icon: Package, label: "Products", roles: ADMIN },
  { href: "/rentals", icon: ClipboardList, label: "Rentals", roles: ADMIN },
  { href: "/today/pickups", icon: PackageCheck, label: "Today's pickups", roles: ADMIN },
  { href: "/today/returns", icon: Undo2, label: "Today's returns", roles: ADMIN },
  { href: "/today/deliveries", icon: Truck, label: "Today's deliveries", roles: ADMIN },
  { href: "/payments", icon: Banknote, label: "Payments", roles: ADMIN },
  { href: "/settings/tax", icon: Percent, label: "Tax", roles: ADMIN },
  { href: "/settings/penalties", icon: AlertTriangle, label: "Penalties", roles: ADMIN },
];

export function navForRoles(roles: RentalRole[]): SidebarNavLink[] {
  return SIDEBAR_NAV.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}

export function hrefMatches(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const RENTAL_QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [];
