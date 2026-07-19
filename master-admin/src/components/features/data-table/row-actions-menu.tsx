"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

export type RowAction = {
  label: string;
  onSelect: () => void;
  /** @deprecated Ignored — all items share the same neutral style. */
  destructive?: boolean;
  disabled?: boolean;
  /** @deprecated Separators render between every item automatically. */
  separatorBefore?: boolean;
};

type Props = {
  actions: RowAction[];
  label?: string;
  trigger?: ReactNode;
};

/** ⋮ menu for list rows. Uses data-row-stop so ClickableRow ignores clicks. */
export function RowActionsMenu({ actions, label = "Row actions", trigger }: Props) {
  if (!actions.length) return null;

  return (
    <div data-row-stop onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button aria-label={label} className="h-8 w-8 cursor-pointer" size="icon" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[9.5rem] p-1">
          {actions.map((a, i) => (
            <Fragment key={a.label}>
              {i > 0 ? <DropdownMenuSeparator className="my-1 bg-border" /> : null}
              <DropdownMenuItem
                className="cursor-pointer rounded-sm px-2 py-1.5 text-sm text-foreground focus:bg-muted focus:text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                disabled={a.disabled}
                onSelect={() => a.onSelect()}
              >
                {a.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
