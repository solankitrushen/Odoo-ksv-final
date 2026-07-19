import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Clock3, RefreshCw, Sparkles } from "lucide-react";
import { getCatalog } from "@/lib/catalog-service";
import { ProductCard } from "@/components/product/product-card";
import { ApiStatusBanner } from "@/components/catalog/api-status-banner";
import { Button } from "@/components/ui/button";

export const revalidate = 60;

export default async function HomePage() {
  const { products, categories, live } = await getCatalog();
  const featured = products.slice(0, 3);

  return (
    <>
      {/* Hero — editorial, asymmetric */}
      <section className="border-b border-line">
        <div className="container grid gap-10 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
          <div className="animate-fade-up">
            {!live && (
              <div className="mb-6">
                <ApiStatusBanner live={live} />
              </div>
            )}
            <p className="eyebrow inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Rentals, done honestly
            </p>
            <h1 className="mt-4 text-hero font-semibold text-ink">
              Rent the gear.
              <br />
              Keep the deposit.
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink-soft">
              Cameras, sound, staging, and tools — reserved by the hour, day, week, or month. Every
              rate is shown up front, and every deposit comes back when you return on time.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  Browse the catalog
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
              <Stat value={products.length > 0 ? String(products.length) : "—"} label="Items to rent" />
              <Stat value={categories.length > 0 ? String(categories.length) : "—"} label="Categories" />
              <Stat value="Hour→Month" label="Rental periods" />
            </dl>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-line">
              <Image
                src="https://images.unsplash.com/photo-1519638831568-d9897f54ed69?auto=format&fit=crop&w=900&q=80"
                alt="Camera gear laid out on a table"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 45vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-line bg-card p-4 shadow-lg sm:block">
              <p className="text-2xs uppercase tracking-wide text-ink-soft">Deposit</p>
              <p className="tnum text-lg font-semibold text-ink">Held &amp; returned</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Fully refundable
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust row */}
      <section className="border-b border-line bg-surface-raised">
        <div className="container grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3">
          <Promise
            icon={ShieldCheck}
            title="Deposits you get back"
            body="A clear, refundable hold — returned in full when you bring gear back on time."
          />
          <Promise
            icon={Clock3}
            title="Rent by the hour"
            body="Fixed hour, day, week, and month rates. No hidden multipliers, no surprises."
          />
          <Promise
            icon={RefreshCw}
            title="Simple returns"
            body="A generous grace window and late fees that are spelled out before you book."
          />
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Catalog</p>
                <h2 className="mt-2 text-display font-semibold text-ink">Ready to reserve</h2>
              </div>
              <Link
                href="/products"
                className="hidden shrink-0 items-center gap-1 text-sm font-medium text-ink hover:gap-2 sm:inline-flex"
                style={{ transition: "gap 0.2s" }}
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Categories — editorial index */}
      {categories.length > 0 && (
        <section className="border-t border-line bg-surface-raised section">
          <div className="container">
            <p className="eyebrow">Browse</p>
            <h2 className="mt-2 text-display font-semibold text-ink">Every category</h2>
            <div className="mt-8 grid grid-cols-1 divide-y divide-line border-y border-line">
              {categories.map((c, i) => (
                <Link
                  key={c.slug}
                  href={`/products?category=${c.slug}`}
                  className="group flex items-center justify-between gap-6 py-6 transition-colors hover:bg-card md:px-4"
                >
                  <div className="flex items-baseline gap-5">
                    <span className="tnum text-sm text-ink-soft">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-xl font-medium text-ink">{c.name}</h3>
                      {c.blurb && <p className="mt-1 text-sm text-ink-soft">{c.blurb}</p>}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-ink-soft transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-ink px-8 py-16 text-center md:py-20">
            <h2 className="mx-auto max-w-2xl text-display font-semibold text-primary-foreground">
              Ready to reserve your first rental?
            </h2>
            <p className="mx-auto mt-4 max-w-prose text-primary-foreground/70">
              Create an account, pick your dates, and pick up or get it delivered. Your deposit is
              safe with us.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href="/register">Create account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link href="/products">Browse gear</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="tnum text-2xl font-semibold text-ink">{value}</dt>
      <dd className="mt-0.5 text-xs text-ink-soft">{label}</dd>
    </div>
  );
}

function Promise({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-surface-raised p-8">
      <Icon className="h-6 w-6 text-ink" />
      <h3 className="mt-4 text-base font-medium text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
