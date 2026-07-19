import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted dark:bg-[#2a2a2a]", className)}
      {...props}
    />
  );
}

export { Skeleton };
