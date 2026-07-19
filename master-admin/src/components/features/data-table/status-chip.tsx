"use client";

import { Badge } from "@/components/ui/badge";
import { labelCatalogStatus, labelCustomerStatus, labelRentalStatus } from "@/lib/rental-labels";
import { cn } from "@/lib/utils";

type ChipKind = "rental" | "catalog" | "customer" | "raw";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

function variantFor(status: string, kind: ChipKind): BadgeVariant {
  const s = status.toLowerCase();
  if (s === "active" && kind !== "rental") return "success";
  if (s === "cancelled" || s === "cancelled_exception" || s === "blocked") {
    return "destructive";
  }
  /* Inactive/archived: quiet chip; destructive red reserved for Deactivate action. */
  if (s === "archived") return "secondary";
  if (s === "overdue" || s === "exception" || s === "return_pending") return "warning";
  if (s === "closed" || s === "returned" || s === "expired" || s === "merged" || s === "pseudonymized") {
    return "secondary";
  }
  if (s === "draft" || s === "reserved" || s === "confirmed" || s === "inactive") return "outline";
  if (kind === "rental" && (s === "active" || s === "dispatched" || s === "dispatch_pending")) return "default";
  return "secondary";
}

function labelFor(status: string, kind: ChipKind): string {
  if (kind === "rental") return labelRentalStatus(status);
  if (kind === "catalog") return labelCatalogStatus(status);
  if (kind === "customer") return labelCustomerStatus(status);
  return status.replace(/_/g, " ");
}

type Props = {
  status?: string | null;
  kind?: ChipKind;
  className?: string;
  label?: string;
};

/** Colored status pill for ops tables and detail headers. */
export function StatusChip({ status, kind = "raw", className, label }: Props) {
  if (!status && !label) return <span className="text-muted-foreground">—</span>;
  const value = status || "";
  const text = label || labelFor(value, kind);
  return (
    <Badge className={cn("font-normal capitalize", className)} variant={variantFor(value, kind)}>
      {text}
    </Badge>
  );
}
