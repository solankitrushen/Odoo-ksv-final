"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TimeValue = {
  hours: number;
  minutes: number;
};

export function TimePicker({
  value,
  onChange,
  placeholder = "Pick time",
}: {
  value?: TimeValue;
  onChange: (value: TimeValue) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal border border-input bg-background dark:bg-[#1c1c1c]",
            !value && "text-[#1c1c1c] dark:text-[#737373]"
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {value
            ? `${String(value.hours).padStart(2, "0")}:${String(
                value.minutes
              ).padStart(2, "0")}`
            : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Hours */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Hours
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() =>
                    onChange({ hours: h, minutes: value?.minutes ?? 0 })
                  }
                  className={cn(
                    "w-full rounded-md px-2 py-1 text-sm text-left hover:bg-muted",
                    value?.hours === h && "bg-muted font-medium"
                  )}
                >
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Minutes
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    onChange({ hours: value?.hours ?? 0, minutes: m })
                  }
                  className={cn(
                    "w-full rounded-md px-2 py-1 text-sm text-left hover:bg-muted",
                    value?.minutes === m && "bg-muted font-medium"
                  )}
                >
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
