import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About",
  description: "Renton is a rental house built on transparent rates and deposits you get back.",
};

const VALUES = [
  {
    title: "Transparent by default",
    body: "Every rate, deposit, and late fee is shown before you commit. No math you can't see.",
  },
  {
    title: "Deposits are sacred",
    body: "A deposit is your money. We hold it plainly and return it fast when gear comes back.",
  },
  {
    title: "Gear that works",
    body: "Everything is tested between rentals. If it leaves our depot, it's ready for the job.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <section className="border-b border-line">
        <div className="container py-16 md:py-24">
          <p className="eyebrow">About</p>
          <h1 className="mt-3 max-w-3xl text-hero font-semibold text-ink">
            We started Renton because renting gear was needlessly stressful.
          </h1>
          <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink-soft">
            Confusing holds, deposits that took weeks to come back, fees buried in fine print. So we
            built the rental house we wanted to use: clear rates, honest deposits, and returns that
            don&apos;t make you nervous.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line">
            <Image
              src="https://images.unsplash.com/photo-1524253482453-3fed8d2fe12b?auto=format&fit=crop&w=900&q=80"
              alt="Team preparing rental equipment"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <h2 className="text-display font-semibold text-ink">
              A rental house, run like a service business.
            </h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              We keep a tight, well-maintained inventory of cameras, audio, staging, and tools. Every
              item is inspected between rentals and priced by the hour, day, week, and month so you
              only pay for the time you need.
            </p>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Behind the scenes we&apos;re powered by a real rental management system — the same
              engine tracking availability, deposits, and returns that our depot team uses every day.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface-raised section">
        <div className="container">
          <h2 className="text-display font-semibold text-ink">What we stand on</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-xl border border-line bg-card p-6">
                <h3 className="text-base font-medium text-ink">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
