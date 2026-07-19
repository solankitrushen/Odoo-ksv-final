"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
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
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {action}
      </div>
    </div>
  );
}
