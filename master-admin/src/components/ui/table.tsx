"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    footer?: React.ReactNode;
    containerClassName?: string;
  }
>(({ className, footer, containerClassName, ...props }, ref) => (
  <div
    className={cn(
      "relative mb-5 w-full overflow-hidden rounded-lg border border-border bg-card",
      containerClassName,
    )}
  >
    <div className="overflow-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm text-card-foreground", className)}
        {...props}
      />
    </div>
    {footer ? (
      <div className="border-t border-border bg-card px-4 py-4 pb-5 dark:border-[#404040]">
        {footer}
      </div>
    ) : null}
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-muted [&_tr]:border-b [&_tr]:border-border dark:bg-[#222] dark:[&_tr]:border-[#404040]",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-primary/5 dark:border-[#404040] dark:hover:bg-white/5",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-foreground/75 dark:text-neutral-300 [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
