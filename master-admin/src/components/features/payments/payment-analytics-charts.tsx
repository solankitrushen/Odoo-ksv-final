"use client";

import { ErrorState } from "@/components/features/dashboard/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRentalMoney } from "@/lib/rental-money";
import type { PaymentAnalytics } from "@/lib/rental-types";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const METHOD_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatPeriodLabel(period: string, groupBy: string): string {
  if (groupBy === "month") {
    const [y, m] = period.split("-");
    if (!y || !m) return period;
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }
  const d = new Date(`${period}T00:00:00`);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li className="flex items-center justify-between gap-4" key={String(p.dataKey || p.name)}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular-nums font-medium text-foreground">
              {typeof p.value === "number" ? formatRentalMoney(Math.round(p.value * 100)) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaymentAnalyticsCharts({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: PaymentAnalytics;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const series = useMemo(() => {
    if (!data?.series?.length) return [];
    return data.series.map((r) => ({
      label: formatPeriodLabel(r.period, data.groupBy),
      collected: (r.chargePaise || 0) / 100,
      refunds: (r.refundPaise || 0) / 100,
      count: r.count || 0,
    }));
  }, [data]);

  const methods = useMemo(
    () =>
      (data?.byMethod || []).map((m) => ({
        name: (m.method || "other").replace(/_/g, " "),
        value: (m.amountPaise || 0) / 100,
        paise: m.amountPaise || 0,
        count: m.count || 0,
      })),
    [data?.byMethod],
  );

  const customers = useMemo(
    () =>
      (data?.byCustomer || []).slice(0, 6).map((c) => ({
        name: (c.customerName || "Customer").slice(0, 16),
        fullName: c.customerName || "Customer",
        amount: (c.amountPaise || 0) / 100,
        paise: c.amountPaise || 0,
        count: c.count || 0,
      })),
    [data?.byCustomer],
  );

  const hasSeries = series.some((s) => s.collected > 0 || s.refunds > 0);

  if (error) {
    return (
      <ErrorState
        title="Could not load payment analytics"
        message={error.message}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Collected vs refunds</h3>
          <p className="text-xs text-muted-foreground">
            {data?.groupBy === "month" ? "₹ per month" : "₹ per day"}
          </p>
        </div>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasSeries ? (
          <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No captured payments in this window.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="payCollectFill" x1="0" y1="0" x2="0" y2="1">
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
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
              />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
              <Area
                type="monotone"
                dataKey="collected"
                name="Collected"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                fill="url(#payCollectFill)"
              />
              <Area
                type="monotone"
                dataKey="refunds"
                name="Refunds"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">By payment method</h3>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : methods.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              No method split yet.
            </p>
          ) : (
            <div className="flex h-[220px] flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methods}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {methods.map((m, i) => (
                      <Cell key={m.name} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as { name: string; paise: number; count: number };
                      return (
                        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-medium capitalize text-foreground">{row.name}</p>
                          <p className="mt-1 tabular-nums text-muted-foreground">
                            {formatRentalMoney(row.paise)} · {row.count} txns
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="shrink-0 space-y-2 sm:w-40">
                {methods.map((m, i) => (
                  <li className="flex items-center justify-between gap-2 text-xs" key={m.name}>
                    <span className={cn("flex items-center gap-1.5 capitalize text-muted-foreground")}>
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: METHOD_COLORS[i % METHOD_COLORS.length] }}
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

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Top customers (collected)</h3>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : customers.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              No customer totals in this window.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={customers} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
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
                    const row = payload[0].payload as { fullName: string; paise: number; count: number };
                    return (
                      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                        <p className="font-medium text-foreground">{row.fullName}</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatRentalMoney(row.paise)} · {row.count} payments
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="amount" name="Collected" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
