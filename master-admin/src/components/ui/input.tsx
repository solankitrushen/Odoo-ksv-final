import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background dark:bg-[#1c1c1c] px-3 py-2 text-sm text-foreground ring-offset-background file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground placeholder:!text-[#1c1c1c] dark:placeholder:!text-[#737373] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:ring-offset-0 dark:focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
