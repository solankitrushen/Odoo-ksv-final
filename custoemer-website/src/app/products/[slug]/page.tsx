import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getProductBySlug } from "@/lib/catalog-service";
import { BuyBox } from "@/components/product/buy-box";
import { ProductCard } from "@/components/product/product-card";
import { Gallery } from "@/components/product/gallery";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };
  return { title: product.name, description: product.summary };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { product, products, categories } = await getProductBySlug(slug);
  if (!product) notFound();

  const category = categories.find((c) => c.slug === product.categorySlug);
  const related = products
    .filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id)
    .slice(0, 3);

  const attributeKeys = Array.from(
    new Set(product.variants.flatMap((v) => Object.keys(v.attributes))),
  );

  return (
    <div className="container py-8 md:py-12">
      <nav className="flex items-center gap-1.5 text-sm text-ink-soft" aria-label="Breadcrumb">
        <Link href="/products" className="hover:text-ink">
          Catalog
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {category && (
          <>
            <Link href={`/products?category=${category.slug}`} className="hover:text-ink">
              {category.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div>
          <Gallery images={product.gallery} alt={product.name} />

          <div className="mt-8">
            {product.brand && (
              <span className="text-2xs uppercase tracking-[0.14em] text-ink-soft">
                {product.brand}
              </span>
            )}
            <h1 className="mt-2 text-display font-semibold leading-tight text-ink">
              {product.name}
            </h1>
            {product.description && (
              <p className="mt-4 max-w-prose leading-relaxed text-ink-soft">{product.description}</p>
            )}
          </div>

          <div className="mt-10">
            <Accordion type="single" collapsible defaultValue="terms" className="border-t border-line">
              {attributeKeys.length > 0 && (
                <AccordionItem value="options">
                  <AccordionTrigger>Configurations</AccordionTrigger>
                  <AccordionContent>
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                      {product.variants.map((v) => (
                        <div
                          key={v.id}
                          className="flex justify-between gap-4 border-b border-line py-2"
                        >
                          <dt className="text-ink-soft">{v.label}</dt>
                          <dd className="text-right text-ink">
                            {attributeKeys
                              .map((k) => v.attributes[k])
                              .filter(Boolean)
                              .join(" · ") || "Standard"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </AccordionContent>
                </AccordionItem>
              )}
              <AccordionItem value="terms">
                <AccordionTrigger>Deposit &amp; return terms</AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed">
                    A refundable security deposit is held at checkout and returned in full when the
                    item comes back on time and in working order. Your exact deposit and GST are shown
                    at checkout before you pay. Late returns and damage are settled from the deposit
                    per your rental terms.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {product.variants.length > 0 ? (
            <BuyBox product={product} />
          ) : (
            <div className="rounded-xl border border-line bg-card p-6 text-center">
              <p className="text-sm font-medium text-ink">Rates not yet published</p>
              <p className="mt-1 text-sm text-ink-soft">
                This item is listed but pricing is still being set up. Check back shortly.
              </p>
            </div>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-soft">
            <ShieldCheck className="h-3.5 w-3.5" /> Deposits are fully refundable on time.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <Separator className="mb-10" />
          <h2 className="text-xl font-semibold text-ink">More in {category?.name}</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
