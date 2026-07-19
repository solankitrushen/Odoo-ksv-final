"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon, Check, ChevronDown, ChevronLeft, CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";

export type AnalyticsRangePreset = "30d" | "month" | "quarter" | "6m" | "custom";

const PRESETS: { id: Exclude<AnalyticsRangePreset, "custom">; label: string }[] = [
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "6m", label: "Last 6 months" },
];

export function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1, 0, 0, 0, 0);
}

/** Resolve preset / custom YMD into ISO bounds for API queries. */
export function analyticsRangeBounds(
  preset: AnalyticsRangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (preset === "custom" && customFrom && customTo) {
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to >= from) {
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
  if (preset === "quarter") {
    return { from: startOfQuarter(end).toISOString(), to: end.toISOString() };
  }
  if (preset === "month") {
    const m = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
    return { from: m.toISOString(), to: end.toISOString() };
  }
  const start = new Date(end);
  if (preset === "6m") start.setDate(start.getDate() - 183);
  else start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Prefer monthly buckets when the window is longer than ~90 days. */
export function analyticsGroupBy(fromIso: string, toIso: string): "day" | "month" {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms > 90 * 86400000 ? "month" : "day";
}

function parseYmd(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

function formatCustomLabel(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return "Custom";
  return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
}

export function AnalyticsRangeControl({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomApply,
}: {
  preset: AnalyticsRangePreset;
  onPresetChange: (preset: Exclude<AnalyticsRangePreset, "custom">) => void;
  customFrom: string;
  customTo: string;
  onCustomApply: (next: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "calendar">("menu");
  const committedFrom = parseYmd(customFrom);
  const committedTo = parseYmd(customTo);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: committedFrom,
    to: committedTo,
  }));

  useEffect(() => {
    if (!open) {
      setPanel("menu");
      return;
    }
    if (panel === "calendar") {
      setDraft({ from: parseYmd(customFrom), to: parseYmd(customTo) });
    }
  }, [open, panel, customFrom, customTo]);

  const label =
    preset === "custom"
      ? formatCustomLabel(customFrom, customTo)
      : PRESETS.find((p) => p.id === preset)?.label ?? "Last 30 days";

  const canApply =
    Boolean(draft?.from && draft?.to) &&
    draft!.from!.getTime() <= draft!.to!.getTime();

  const apply = () => {
    if (!draft?.from || !draft?.to || draft.from.getTime() > draft.to.getTime()) return;
    onCustomApply({ from: toYmd(draft.from), to: toYmd(draft.to) });
    setOpen(false);
    setPanel("menu");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPanel("menu");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Date range: ${label}`}
          aria-expanded={open}
          className="h-8 gap-0 px-0 font-normal"
        >
          <span className="flex items-center px-2.5 text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-1.5 px-2.5 text-sm text-foreground">
            {label}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        avoidCollisions={false}
        className={cn(
          "border-border p-0 shadow-lg dark:bg-[#141414]",
          panel === "menu" ? "w-52" : "w-auto",
        )}
        onOpenAutoFocus={(e) => {
          // Keep focus inside so the panel does not instantly dismiss.
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (panel === "calendar" && e.key === "Enter" && canApply) {
            e.preventDefault();
            apply();
          }
        }}
      >
        {panel === "menu" ? (
          <div className="p-1" role="menu">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                  "hover:bg-accent focus-visible:bg-accent",
                  preset === p.id && "bg-accent",
                )}
                onClick={() => {
                  onPresetChange(p.id);
                  setOpen(false);
                }}
              >
                <span>{p.label}</span>
                {preset === p.id ? (
                  <Check className="h-3.5 w-3.5 text-foreground" aria-hidden />
                ) : null}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                "hover:bg-accent focus-visible:bg-accent",
                preset === "custom" && "bg-accent",
              )}
              onClick={() => setPanel("calendar")}
            >
              <span>Custom</span>
              {preset === "custom" ? (
                <Check className="h-3.5 w-3.5 text-foreground" aria-hidden />
              ) : null}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setPanel("menu")}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Back
              </Button>
              <span className="text-xs font-medium text-muted-foreground">Custom range</span>
            </div>
            <div className="p-2">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={1}
                defaultMonth={draft?.from ?? committedFrom ?? new Date()}
                disabled={{ after: new Date() }}
                className="mx-auto bg-transparent p-0"
              />
            </div>
            <div className="border-t border-border p-3">
              <Button
                type="button"
                className="w-full gap-2"
                size="sm"
                disabled={!canApply}
                onClick={apply}
              >
                Apply
                <CornerDownLeft className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
