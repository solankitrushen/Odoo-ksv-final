"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Category, Product } from "@/lib/domain/types";
import { ProductCard } from "@/components/product/product-card";
import { ApiStatusBanner } from "@/components/catalog/api-status-banner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SortKey = "name" | "price-asc" | "price-desc";

function minDayRate(p: Product) {
  const dayRates = p.variants
    .flatMap((v) => v.rates)
    .filter((r) => r.unit === "day")
    .map((r) => r.amount);
  return dayRates.length ? Math.min(...dayRates) : Number.POSITIVE_INFINITY;
}

export function CatalogClient({
  products,
  categories,
  live,
}: {
  products: Product[];
  categories: Category[];
  live: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlCategory = params.get("category") ?? "all";
  const urlQ = params.get("q") ?? "";

  const [category, setCategory] = useState(urlCategory);
  const [query, setQuery] = useState(urlQ);
  const [sort, setSort] = useState<SortKey>("name");

  useEffect(() => {
    setCategory(urlCategory);
    setQuery(urlQ);
  }, [urlCategory, urlQ]);

  // Debounce server search via URL → RSC re-fetch (GET /catalog?q=&categoryId=).
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams();
      if (category !== "all") next.set("category", category);
      if (query.trim()) next.set("q", query.trim());
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      const current = params.toString();
      if (qs === current) return;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, 320);
    return () => clearTimeout(handle);
  }, [category, query, pathname, router, params]);

  const sorted = useMemo(() => {
    const list = [...products];
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => minDayRate(a) - minDayRate(b));
        break;
      case "price-desc":
        list.sort((a, b) => minDayRate(b) - minDayRate(a));
        break;
      default:
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [products, sort]);

  function resetFilters() {
    setQuery("");
    setCategory("all");
  }

  return (
    <div>
      <ApiStatusBanner live={live} />

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <SlidersHorizontal className="h-4 w-4" />
            Categories
          </div>
          <ul className="mt-4 flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            <li>
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  category === "all"
                    ? "bg-ink text-primary-foreground"
                    : "text-ink-soft hover:bg-muted",
                )}
              >
                All gear
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => setCategory(c.slug)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                    category === c.slug
                      ? "bg-ink text-primary-foreground"
                      : "text-ink-soft hover:bg-muted",
                  )}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gear or brand"
                className="pl-9"
                aria-label="Search catalog"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="tnum shrink-0 text-sm text-ink-soft">
                {isPending ? "Updating…" : `${sorted.length} items`}
              </span>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-[168px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name: A to Z</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!live ? null : sorted.length === 0 ? (
            <div className="mt-16 flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-20 text-center">
              <p className="text-base font-medium text-ink">No gear matches that.</p>
              <p className="mt-1 text-sm text-ink-soft">
                Try a different category or clear your search.
              </p>
              <Button variant="outline" className="mt-5" onClick={resetFilters}>
                Reset filters
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3",
                isPending && "opacity-60 transition-opacity",
              )}
            >
              {sorted.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
