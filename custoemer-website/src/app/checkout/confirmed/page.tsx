import Link from "next/link";
import { Suspense } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmedDetails } from "./confirmed-details";

export default function ConfirmedPage() {
  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/12">
        <Check className="h-8 w-8 text-success" />
      </div>
      <h1 className="mt-6 text-display font-semibold text-ink">Order placed</h1>
      <p className="mt-3 max-w-md text-ink-soft">
        Your rental request is in. We&apos;ll confirm availability and final pricing shortly — track
        everything from your rentals dashboard.
      </p>

      <Suspense fallback={null}>
        <ConfirmedDetails />
      </Suspense>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/account/orders">
            View my rentals <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/products">Keep browsing</Link>
        </Button>
      </div>
    </div>
  );
}
