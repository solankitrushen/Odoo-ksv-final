import Link from "next/link";
import { WifiOff } from "lucide-react";

/** Honest empty-state when the public catalog API is unreachable. */
export function ApiStatusBanner({ live }: { live: boolean }) {
  if (live) return null;
  return (
    <div
      role="status"
      className="mb-8 flex items-start gap-3 rounded-xl border border-line bg-muted px-4 py-3.5 text-sm text-ink"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
      <div>
        <p className="font-medium">Catalog temporarily unavailable</p>
        <p className="mt-0.5 text-ink-soft">
          We couldn&apos;t reach the rental service. Check that the API is running, then{" "}
          <Link href="/products" className="underline underline-offset-2 hover:text-ink">
            refresh the catalog
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
