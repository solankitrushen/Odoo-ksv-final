import { Suspense } from "react";
import type { Metadata } from "next";
import { queryCatalog } from "@/lib/catalog-service";
import { CatalogClient } from "./catalog-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Catalog",
  description: "Browse cameras, audio, event gear, tools, and more available to rent.",
};

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const { products, categories, live } = await queryCatalog({
    q: sp.q,
    categorySlug: sp.category,
  });

  return (
    <div className="container py-10 md:py-14">
      <header className="max-w-2xl">
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-2 text-display font-semibold text-ink">Gear, ready when you are.</h1>
        <p className="mt-3 max-w-prose text-ink-soft">
          Reserve by the hour, day, week, or month. Every rate is shown up front, and every deposit
          comes back when you return on time.
        </p>
      </header>

      <div className="mt-10">
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          }
        >
          <CatalogClient products={products} categories={categories} live={live} />
        </Suspense>
      </div>
    </div>
  );
}
