import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-7xl font-semibold text-ink">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-ink">This page took a rain check</h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        The page you&apos;re after doesn&apos;t exist or has moved. Let&apos;s get you back to the gear.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Browse catalog</Link>
        </Button>
      </div>
    </div>
  );
}
