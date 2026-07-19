"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRADIENT_ID = "evilAreaGradient";

type ChartWrapperProps = {
  type: "area" | "bar";
  data: { name: string; value: number }[];
  dataKey?: string;
  xAxisKey?: string;
  height?: number;
  color?: string;
  evilStyle?: boolean;
};

export function ChartWrapper({
  type,
  data,
  dataKey = "value",
  xAxisKey = "name",
  height = 300,
  color = "hsl(var(--primary))",
  evilStyle = true,
}: ChartWrapperProps) {
  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey={xAxisKey}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={evilStyle ? `url(#${GRADIENT_ID})` : color}
            fillOpacity={evilStyle ? 1 : 0.2}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          stroke="hsl(var(--muted-foreground))"
          tickLine={false}
          axisLine={false}
        />
        <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive />
      </BarChart>
    </ResponsiveContainer>
  );
}
