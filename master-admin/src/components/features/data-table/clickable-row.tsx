"use client";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  label?: string;
};

/** Whole-row navigation for ops lists (mouse + keyboard). */
export function ClickableRow({ href, children, className, label }: Props) {
  const router = useRouter();

  function go() {
    router.push(href);
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement | null;
    if (target?.closest("a,button,input,select,textarea,[data-row-stop]")) return;
    go();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  }

  return (
    <TableRow
      aria-label={label}
      className={cn(
        "cursor-pointer outline-none hover:bg-accent/60 focus-visible:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </TableRow>
  );
}
