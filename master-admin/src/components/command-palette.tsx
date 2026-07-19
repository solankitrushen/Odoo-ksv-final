"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { CornerDownLeft, FileClock, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { RENTAL_QUICK_ACTIONS, SIDEBAR_NAV, navForRoles } from "@/constants/nav.constants";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type PaletteItem = {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
};

function buildItems(roles: ("admin" | "officer" | "manager")[]): PaletteItem[] {
  const navItems: PaletteItem[] = navForRoles(roles).map((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    hint: "Navigation",
    href: item.href,
    icon: item.icon,
    keywords: item.label,
  }));

  const quickActions: PaletteItem[] = RENTAL_QUICK_ACTIONS.map((a) => ({
    id: `action:${a.href}:${a.label}`,
    label: a.label,
    hint: "Quick action",
    href: a.href,
    icon: a.icon,
    keywords: a.label,
  }));

  return [...navItems, ...quickActions];
}

export function CommandPalette() {
  const router = useRouter();
  const { roles } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const allItems = React.useMemo(
    () => buildItems(roles as ("admin" | "officer" | "manager")[]),
    [roles],
  );

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) =>
      `${item.label} ${item.hint} ${item.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [allItems, query]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("rental:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("rental:open-command-palette", onOpenEvent);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  React.useEffect(() => {
    setActiveIndex((prev) => {
      if (results.length === 0) return 0;
      return Math.min(prev, results.length - 1);
    });
  }, [results.length]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const go = React.useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search rental admin pages and quick actions.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={
              results[activeIndex] ? `cp-item-${results[activeIndex].id}` : undefined
            }
            className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for “{query}”.
            </div>
          ) : (
            results.map((item, index) => {
              const Icon = item.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  id={`cp-item-${item.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={active}
                  type="button"
                  onClick={() => go(item)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/60",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.hint}</span>
                  {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
