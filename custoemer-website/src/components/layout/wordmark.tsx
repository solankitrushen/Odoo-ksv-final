import { cn } from "@/lib/utils";

// The mark: a filled ring (the deposit "held and returned") next to the name.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="relative flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ink"
      >
        <span className="h-2 w-2 rounded-full bg-ink" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">Renton</span>
    </span>
  );
}
