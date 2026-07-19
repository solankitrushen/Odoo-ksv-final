"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon, CornerDownLeft } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseYmd(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/** Calendar-only range popover (no Start/End text fields). */
export function DateRangePicker({
  from,
  to,
  onApply,
  open,
  onOpenChange,
  trigger,
  anchor,
  className,
  align = "end",
}: {
  from: string;
  to: string;
  onApply: (next: { from: string; to: string }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional visible trigger. Prefer `anchor` when the trigger lives elsewhere. */
  trigger?: React.ReactNode;
  /** Positions the popover without acting as the open control. */
  anchor?: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const committedFrom = parseYmd(from);
  const committedTo = parseYmd(to);

  const [draft, setDraft] = React.useState<DateRange | undefined>(() => ({
    from: committedFrom,
    to: committedTo,
  }));

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft({ from: parseYmd(from), to: parseYmd(to) });
  }, [isOpen, from, to]);

  const canApply =
    Boolean(draft?.from && draft?.to) &&
    draft!.from!.getTime() <= draft!.to!.getTime();

  const apply = () => {
    if (!draft?.from || !draft?.to || draft.from.getTime() > draft.to.getTime()) return;
    onApply({ from: toYmd(draft.from), to: toYmd(draft.to) });
    setOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : null}
      {trigger ? (
        <PopoverTrigger asChild>
          {trigger}
        </PopoverTrigger>
      ) : !anchor ? (
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn("gap-1.5", className)}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Custom
          </Button>
        </PopoverTrigger>
      ) : null}
      <PopoverContent
        align={align}
        className="w-auto border-border p-0 shadow-lg dark:bg-[#141414]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && canApply) {
            e.preventDefault();
            apply();
          }
        }}
      >
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
      </PopoverContent>
    </Popover>
  );
}
