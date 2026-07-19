"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRentals, type RentalStatus } from "@/lib/rental-api";
import { useAuth } from "@/lib/auth-store";
import { OPEN_RENTAL_STATUSES } from "@/lib/format";
import { OrderCard } from "@/components/account/order-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "past";

const FILTERS: { key: Filter; label: string; match: (s: RentalStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "active", label: "Active", match: (s) => OPEN_RENTAL_STATUSES.includes(s) },
  { key: "past", label: "Past", match: (s) => !OPEN_RENTAL_STATUSES.includes(s) },
];

export default function OrdersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rentals"],
    queryFn: () => fetchRentals(),
    enabled: isAuthenticated,
  });

  const active = FILTERS.find((f) => f.key === filter)!;
  const list = data?.items.filter((o) => active.match(o.status)) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">My rentals</h1>
      <p className="mt-1 text-ink-soft">Every reservation, deposit, and return in one place.</p>

      <div className="mt-6 inline-flex gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm transition-colors",
              filter === f.key ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : isError ? (
          <div className="rounded-xl border border-dashed border-line py-16 text-center">
            <p className="text-sm font-medium text-ink">Couldn&apos;t load your rentals</p>
            <p className="mt-1 text-sm text-ink-soft">Check your connection and try again.</p>
          </div>
        ) : list.length > 0 ? (
          list.map((o) => <OrderCard key={o._id} order={o} />)
        ) : (
          <div className="rounded-xl border border-dashed border-line py-16 text-center">
            <p className="text-sm font-medium text-ink">Nothing here yet</p>
            <p className="mt-1 text-sm text-ink-soft">Rentals in this state will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
