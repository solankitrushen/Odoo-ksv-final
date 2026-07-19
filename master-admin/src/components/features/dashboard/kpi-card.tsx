"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

interface Props {
  hint?: string;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  value: string;
}

export function KpiCard({ hint, icon: Icon, label, loading, value }: Props) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {value}
              </p>
            )}
            {hint && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {hint}
              </p>
            )}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground dark:bg-[#262626]">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
