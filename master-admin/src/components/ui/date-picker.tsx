"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DatePicker({
  date,
  onChange,
  placeholder = "Pick a date",
}: {
  date?: Date;
  onChange: (date?: Date) => void;
  placeholder?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal border border-input bg-background dark:bg-[#1c1c1c]",
            !date && "text-[#1c1c1c] dark:text-white"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 bg-background dark:bg-[#1a1a1d] border border-border dark:border-[#2a2a2a]"
        align="start"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className="dark:bg-[#1a1a1d]"
          classNames={{
            day: "text-[#1c1c1c] dark:text-white",
            day_selected: "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "rounded-md bg-accent text-accent-foreground",
            day_outside: "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
            day_disabled: "text-muted-foreground opacity-50",
            day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
            day_range_start: "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_range_end: "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
