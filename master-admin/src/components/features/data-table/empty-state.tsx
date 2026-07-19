"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export function EmptyState({
  message,
  actionHref,
  actionLabel,
  onAction,
}: {
  message: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const action =
    actionLabel && onAction ? (
      <Button onClick={onAction} type="button">
        {actionLabel}
      </Button>
    ) : actionHref && actionLabel ? (
      <Button asChild>
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    ) : null;

  return (
    <div className="mb-5 flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
