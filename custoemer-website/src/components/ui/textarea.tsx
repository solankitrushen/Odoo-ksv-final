import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-md border border-line bg-card px-3.5 py-2.5 text-sm text-ink shadow-sm transition-colors placeholder:text-ink-soft/70 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
