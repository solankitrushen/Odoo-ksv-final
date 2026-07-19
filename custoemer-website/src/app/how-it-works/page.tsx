import type { Metadata } from "next";
import Link from "next/link";
import { Search, CalendarCheck, ShieldCheck, PackageCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "How it works",
  description: "Renting from Renton in four steps, plus how deposits, returns, and late fees work.",
};

const STEPS = [
  { icon: Search, title: "Find your gear", body: "Browse the catalog and pick a configuration that fits the job." },
  { icon: CalendarCheck, title: "Choose your window", body: "Rent by the hour, day, week, or month. Rates are fixed and shown up front." },
  { icon: ShieldCheck, title: "Pay & hold a deposit", body: "Pay the rental plus a refundable deposit. Both are itemised at checkout." },
  { icon: PackageCheck, title: "Return & get refunded", body: "Bring it back on time and the full deposit returns to you, usually within 24 hours." },
];

const FAQ = [
  {
    q: "How is the deposit calculated?",
    a: "Each item has either a fixed deposit or a percentage of the rental subtotal, whichever the listing shows. It's held at checkout and fully refundable.",
  },
  {
    q: "When do I get my deposit back?",
    a: "Once the item is returned and checked, the deposit is released — typically within 24 hours. Any late fee is deducted first, and the remainder is refunded.",
  },
  {
    q: "What happens if I return late?",
    a: "Late returns may incur a fee under your rental terms. Any fee is settled from the deposit first; the remainder is refunded. Exact amounts appear on your order once the return is processed.",
  },
  {
    q: "Can I extend a rental?",
    a: "Yes — as long as the item isn't reserved by someone else. Extend from your rentals dashboard before the due time to avoid late fees.",
  },
  {
    q: "Delivery or pickup?",
    a: "Both. Choose delivery to your address for your rental window, or collect from our depot for free, usually ready within two hours.",
  },
];

export default function HowItWorksPage() {
  return (
    <div>
      <section className="border-b border-line">
        <div className="container py-16 md:py-20">
          <p className="eyebrow">How it works</p>
          <h1 className="mt-3 max-w-2xl text-hero font-semibold text-ink">
            Renting should feel as simple as borrowing from a friend.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-ink-soft">
            No opaque holds, no surprise fees. Here&apos;s exactly how a rental works from browse to
            refund.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="relative">
                <span className="tnum text-sm text-ink-soft">0{i + 1}</span>
                <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card">
                  <Icon className="h-5 w-5 text-ink" />
                </div>
                <h3 className="mt-4 text-base font-medium text-ink">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="deposits" className="border-t border-line bg-surface-raised section">
        <div className="container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Deposits &amp; returns</p>
            <h2 className="mt-2 text-display font-semibold text-ink">The fine print, up front</h2>
            <p className="mt-4 text-ink-soft">
              We&apos;d rather over-explain than surprise you. Here are the questions we get most.
            </p>
          </div>
          <div id="returns">
            <Accordion type="single" collapsible defaultValue="0" className="border-t border-line">
              {FAQ.map((item, i) => (
                <AccordionItem key={i} value={String(i)}>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                  <AccordionContent>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container flex flex-col items-center rounded-2xl border border-line bg-card px-6 py-14 text-center">
          <h2 className="text-display font-semibold text-ink">Ready to rent?</h2>
          <p className="mt-2 max-w-md text-ink-soft">
            Browse the catalog and reserve in minutes. Deposit held safely, returned on time.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/products">
              Browse the catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
