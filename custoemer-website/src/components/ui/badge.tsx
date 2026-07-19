import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-primary-foreground",
        outline: "border-line-strong text-ink",
        muted: "border-transparent bg-muted text-ink-soft",
        success: "border-transparent bg-success/12 text-success",
        warn: "border-transparent bg-warn/15 text-[oklch(0.48_0.12_75)]",
        danger: "border-transparent bg-danger/12 text-danger",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
