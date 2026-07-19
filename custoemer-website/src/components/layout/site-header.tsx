"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Wordmark } from "@/components/layout/wordmark";

const NAV = [
  { href: "/products", label: "Catalog" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { count, hydrated } = useCart();
  const { session, isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = session
    ? session.displayName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "";

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Renton home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "text-ink" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-px bg-ink" aria-hidden />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <Link href="/cart" aria-label="Cart" className="relative">
            <Button variant="ghost" size="icon">
              <ShoppingBag className="h-5 w-5" />
            </Button>
            {hydrated && count > 0 && (
              <span className="tnum absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-medium text-primary-foreground">
                {count}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <Link href="/account" aria-label="Account" className="ml-1 hidden sm:block">
              <Avatar className="h-9 w-9 border border-line">
                <AvatarFallback>
                  {initials || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col">
              <SheetHeader>
                <SheetTitle>
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-4">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className="border-b border-line py-4 text-base text-ink"
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                {isAuthenticated ? (
                  <SheetClose asChild>
                    <Button asChild variant="outline">
                      <Link href="/account">My account</Link>
                    </Button>
                  </SheetClose>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button asChild variant="outline">
                        <Link href="/login">Log in</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild>
                        <Link href="/register">Sign up</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
