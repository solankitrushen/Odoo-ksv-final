"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Package, User, MapPin, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { fetchMe } from "@/lib/rental-api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/orders", label: "My rentals", icon: Package },
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "R";
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated, hydrated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Validates the token; a 401 clears the session and the effect below redirects.
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login?next=/account");
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !session) {
    return (
      <div className="container py-12">
        <Skeleton className="h-8 w-48" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  const displayName = me?.customer.displayName ?? session.displayName;

  return (
    <div className="container py-10 md:py-12">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-4">
            <Avatar className="h-11 w-11 border border-line">
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{displayName}</p>
              <p className="truncate text-xs text-ink-soft">{session.phone}</p>
            </div>
          </div>

          <nav className="mt-4 flex gap-1 lg:flex-col">
            {NAV.map((item) => {
              const active =
                item.href === "/account"
                  ? pathname === "/account"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors",
                    active ? "bg-ink text-primary-foreground" : "text-ink-soft hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline lg:inline">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-muted hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline lg:inline">Log out</span>
            </button>
          </nav>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
