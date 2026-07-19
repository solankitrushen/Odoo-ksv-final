import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/domain/types";
import { formatINR } from "@/lib/money";

function fromRate(product: Product) {
  // lowest day rate across variants, as an entry price; fall back to any rate
  const all = product.variants.flatMap((v) => v.rates);
  const dayRates = all.filter((r) => r.unit === "day").map((r) => r.amount);
  const pool = dayRates.length > 0 ? dayRates : all.map((r) => r.amount);
  return pool.length > 0 ? Math.min(...pool) : 0;
}

export function ProductCard({ product }: { product: Product }) {
  const rate = fromRate(product);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-card transition-colors duration-300 hover:border-line-strong"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        {product.brand && (
          <span className="text-2xs uppercase tracking-[0.14em] text-ink-soft">{product.brand}</span>
        )}
        <h3 className="mt-1.5 text-[15px] font-medium leading-snug text-ink">{product.name}</h3>
        {product.summary && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{product.summary}</p>
        )}
        <div className="mt-4 flex items-baseline gap-1 border-t border-line pt-3">
          {rate > 0 ? (
            <>
              <span className="text-2xs text-ink-soft">from</span>
              <span className="tnum text-lg font-semibold text-ink">{formatINR(rate)}</span>
              <span className="text-sm text-ink-soft">/day</span>
            </>
          ) : (
            <span className="text-sm text-ink-soft">See rental rates</span>
          )}
        </div>
      </div>
    </Link>
  );
}
