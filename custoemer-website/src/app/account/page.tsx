"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { fetchRentals } from "@/lib/rental-api";
import { useAuth } from "@/lib/auth-store";
import { formatINR } from "@/lib/money";
import { OPEN_RENTAL_STATUSES } from "@/lib/format";
import { OrderCard } from "@/components/account/order-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function AccountOverviewPage() {
  const { session, isAuthenticated } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rentals"],
    queryFn: () => fetchRentals(),
    enabled: isAuthenticated,
  });

  const orders = data?.items;
  const open = orders?.filter((o) => OPEN_RENTAL_STATUSES.includes(o.status)) ?? [];
  const depositHeld =
    orders?.reduce(
      (s, o) =>
        s +
        (OPEN_RENTAL_STATUSES.includes(o.status) ? (o.depositSnapshot?.depositPaise ?? 0) : 0),
      0,
    ) ?? 0;
  const overdue = orders?.filter((o) => o.status === "overdue").length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">
        Welcome back, {session?.displayName ?? "there"}.
      </h1>
      <p className="mt-1 text-ink-soft">Here&apos;s where your rentals and deposits stand.</p>

      {/* Stat tiles */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={Package}
          label="Open rentals"
          value={isLoading ? null : String(open.length)}
        />
        <StatTile
          icon={ShieldCheck}
          label="Deposits held"
          value={isLoading ? null : formatINR(depositHeld)}
          tone="neutral"
        />
        <StatTile
          icon={AlertTriangle}
          label="Overdue"
          value={isLoading ? null : String(overdue)}
          tone={overdue > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-base font-medium text-ink">Active &amp; upcoming</h2>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
        >
          All rentals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : isError ? (
          <div className="rounded-xl border border-dashed border-line py-14 text-center">
            <p className="text-sm font-medium text-ink">Couldn&apos;t load your rentals</p>
            <p className="mt-1 text-sm text-ink-soft">Check your connection and try again.</p>
          </div>
        ) : open.length > 0 ? (
          open.map((o) => <OrderCard key={o._id} order={o} />)
        ) : (
          <div className="rounded-xl border border-dashed border-line py-14 text-center">
            <p className="text-sm font-medium text-ink">No active rentals</p>
            <p className="mt-1 text-sm text-ink-soft">When you reserve gear, it shows up here.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/products">Browse the catalog</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <Icon
        className={tone === "danger" ? "h-5 w-5 text-danger" : "h-5 w-5 text-ink-soft"}
      />
      <p className="mt-3 text-2xs uppercase tracking-wide text-ink-soft">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1 h-7 w-16" />
      ) : (
        <p
          className={
            tone === "danger"
              ? "tnum mt-1 text-2xl font-semibold text-danger"
              : "tnum mt-1 text-2xl font-semibold text-ink"
          }
        >
          {value}
        </p>
      )}
    </div>
  );
}
