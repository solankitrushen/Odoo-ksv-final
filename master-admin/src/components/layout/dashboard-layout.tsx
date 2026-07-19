"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, ArrowLeft, Search, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { SettingsModal } from "@/components/settings/settings-modal";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { CommandPalette } from "@/components/command-palette";
import { PageTransition } from "@/components/page-transition";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/components/theme-provider";
import { usePageTitle } from "@/contexts/page-title-context";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { pageTitle } = usePageTitle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace("/auth/login");
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--bg-hex)]">
      <div className="flex shrink-0 flex-col h-full min-w-0">
        <LeftSidebar
          settingsInitialPanel={null}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="shrink-0 flex min-h-12 items-center justify-between gap-3 px-6 py-2 border-b border-border bg-[var(--header-hex)] backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {pageTitle?.backHref && (
              <Link href={pageTitle.backHref}>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {pageTitle && (
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold tracking-tight text-foreground leading-tight">
                  {pageTitle.title}
                </h1>
                {pageTitle.description?.trim() && (
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {pageTitle.description}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("rental:open-command-palette"))}
              aria-label="Search (Command or Control + K)"
              className="hidden h-8 w-56 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 md:flex"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => window.dispatchEvent(new Event("rental:open-command-palette"))}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground truncate max-w-[160px]">
              {(user as { email?: string })?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPwOpen(true)}
              aria-label="Change password"
              title="Change password"
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pt-5 px-6 pb-6 scroll-smooth">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <CommandPalette />
    </div>
  );
}
