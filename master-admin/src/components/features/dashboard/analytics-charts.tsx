"use client";

/* Hallmark · component: dashboard-analytics · genre: modern-minimal · theme: renton-admin
 * states: default · hover · focus · loading · empty · error
 * contrast: pass — chart ink uses muted-foreground / card tokens
 */

import {
  AnalyticsRangeControl,
  analyticsRangeBounds,
  toYmd,
  type AnalyticsRangePreset,
} from "@/components/features/dashboard/analytics-range-control";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { rentalGet } from "@/lib/rental-api";
import { formatRentalMoney } from "@/lib/rental-money";
import type { RevenueBreakdown, SalesTrends } from "@/lib/rental-types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MIX_COLORS = [
  "hsl(var(--chart-2))",
  "hsl(var(--destructive))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-3))",
];

/** Fill missing calendar days so the line stays readable. */
function fillDailySeries(
  items: { day?: string; revenuePaise?: number; lateFeePaise?: number; bookings?: number }[],
  fromIso: string,
  toIso: string,
) {
  const byDay = new Map(
    items.filter((i) => i.day).map((i) => [i.day!, i]),
  );
  const out: { day: string; label: string; revenue: number; lateFees: number; bookings: number }[] = [];
  const cursor = new Date(fromIso);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toIso);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = toYmd(cursor);
    const row = byDay.get(key);
    out.push({
      day: key,
      label: cursor.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      revenue: (row?.revenuePaise ?? 0) / 100,
      lateFees: (row?.lateFeePaise ?? 0) / 100,
      bookings: row?.bookings ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function ChartTooltip({
  active,
  payload,
  label,
  moneyKeys,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  moneyKeys?: Set<string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <ul className="space-y-1">
        {payload.map((p) => {
          const key = String(p.dataKey || p.name || "");
          const money = moneyKeys?.has(key);
          const val =
            typeof p.value === "number"
              ? money
                ? formatRentalMoney(Math.round(p.value * 100))
                : String(p.value)
              : "—";
          return (
            <li className="flex items-center justify-between gap-4" key={key}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="tabular-nums font-medium text-foreground">{val}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DashboardAnalyticsCharts() {
  const scope = useRentalScope();
  const [preset, setPreset] = useState<AnalyticsRangePreset>("30d");
  const [customFrom, setCustomFrom] = useState(() => toYmd(new Date(Date.now() - 30 * 86400000)));
  const [customTo, setCustomTo] = useState(() => toYmd(new Date()));

  const bounds = useMemo(
    () => analyticsRangeBounds(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const dayQ = useQuery({
    queryKey: rentalKeys.analyticsSales(scope, { groupBy: "day", from: bounds.from, to: bounds.to }),
    queryFn: () =>
      rentalGet<SalesTrends>("/admin/analytics/sales", {
        groupBy: "day",
        from: bounds.from,
        to: bounds.to,
      }),
  });

  const productQ = useQuery({
    queryKey: rentalKeys.analyticsSales(scope, { groupBy: "product", from: bounds.from, to: bounds.to }),
    queryFn: () =>
      rentalGet<SalesTrends>("/admin/analytics/sales", {
        groupBy: "product",
        from: bounds.from,
        to: bounds.to,
      }),
  });

  const mixQ = useQuery({
    queryKey: rentalKeys.analyticsRevenue(scope, { from: bounds.from, to: bounds.to }),
    queryFn: () =>
      rentalGet<RevenueBreakdown>("/admin/analytics/revenue", {
        from: bounds.from,
        to: bounds.to,
      }),
  });

  const daily = useMemo(
    () => fillDailySeries(dayQ.data?.items ?? [], bounds.from, bounds.to),
    [dayQ.data?.items, bounds.from, bounds.to],
  );

  const products = useMemo(() => {
    const rows = [...(productQ.data?.items ?? [])]
      .sort((a, b) => (b.linePreTaxPaise ?? 0) - (a.linePreTaxPaise ?? 0))
      .slice(0, 6);
    return rows.map((r) => ({
      name: (r.name || "Item").slice(0, 18),
      fullName: r.name || "Item",
      revenue: (r.linePreTaxPaise ?? 0) / 100,
      units: r.units ?? 0,
    }));
  }, [productQ.data?.items]);

  const mix = useMemo(() => {
    const g = mixQ.data?.gross;
    if (!g) return [];
    return [
      { name: "Rental", value: g.rentalPaise / 100, paise: g.rentalPaise },
      { name: "Late fees", value: g.penaltyPaise / 100, paise: g.penaltyPaise },
      { name: "Damage", value: g.damagePaise / 100, paise: g.damagePaise },
    ].filter((x) => x.value > 0);
  }, [mixQ.data?.gross]);

  const moneyKeys = useMemo(() => new Set(["revenue", "lateFees", "value"]), []);
  const loading = dayQ.isLoading || productQ.isLoading || mixQ.isLoading;
  const errored = dayQ.isError || productQ.isError || mixQ.isError;
  const hasTrend = daily.some((d) => d.revenue > 0 || d.lateFees > 0 || d.bookings > 0);

  return (
    <section className="space-y-4" aria-labelledby="analytics-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground" id="analytics-heading">
            Sales &amp; comparisons
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Collected revenue, late fees, and top products for the selected window.
          </p>
        </div>
        <AnalyticsRangeControl
          preset={preset}
          onPresetChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomApply={({ from, to }) => {
            setCustomFrom(from);
            setCustomTo(to);
            setPreset("custom");
          }}
        />
      </div>

      {errored ? (
        <ErrorState
          title="Could not load analytics"
          message={
            (dayQ.error || productQ.error || mixQ.error) instanceof Error
              ? ((dayQ.error || productQ.error || mixQ.error) as Error).message
              : undefined
          }
          onRetry={() => {
            void dayQ.refetch();
            void productQ.refetch();
            void mixQ.refetch();
          }}
        />
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Revenue vs late fees</h3>
          <p className="text-xs text-muted-foreground">₹ per day · bookings as dashed line</p>
        </div>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : !hasTrend ? (
          <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No bookings in this window yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dashRevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                yAxisId="money"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip moneyKeys={moneyKeys} />}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
              />
              <Area
                yAxisId="money"
                type="monotone"
                dataKey="revenue"
                name="Collected"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                fill="url(#dashRevFill)"
                isAnimationActive
              />
              <Line
                yAxisId="money"
                type="monotone"
                dataKey="lateFees"
                name="Late fees"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
                isAnimationActive
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="bookings"
                name="Bookings"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Top products (pre-tax)</h3>
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : products.length === 0 ? (
            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No product sales in this window.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={products} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const row = payload[0].payload as { fullName: string; revenue: number; units: number };
                    return (
                      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                        <p className="font-medium text-foreground">{row.fullName}</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatRentalMoney(Math.round(row.revenue * 100))} · {row.units} units
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Revenue mix</h3>
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : mix.length === 0 ? (
            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No charged amounts in this window.
            </p>
          ) : (
            <div className="flex h-[240px] flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {mix.map((_, i) => (
                      <Cell key={mix[i].name} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as { name: string; paise: number };
                      return (
                        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-medium text-foreground">{row.name}</p>
                          <p className="mt-1 tabular-nums text-muted-foreground">
                            {formatRentalMoney(row.paise)}
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="shrink-0 space-y-2 sm:w-40">
                {mix.map((m, i) => (
                  <li className="flex items-center justify-between gap-2 text-xs" key={m.name}>
                    <span className={cn("flex items-center gap-1.5 text-muted-foreground")}>
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
                      />
                      {m.name}
                    </span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatRentalMoney(m.paise)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
