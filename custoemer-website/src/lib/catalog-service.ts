// Live storefront catalog — sourced entirely from the public Rental API
// (/rental/public/:slug/categories, /catalog, /catalog/:id/variants). No mock
// fixtures: products render only the fields the backend actually returns.

import type { Category, Product, ProductVariant, RateEntry, RentalPeriodUnit } from "./domain/types";
import {
  fetchPublicCatalog,
  fetchPublicCategories,
  fetchPublicVariants,
  type PublicCatalogItem,
  type PublicVariant,
} from "./rental-public-api";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1519638831568-d9897f54ed69?auto=format&fit=crop&w=900&q=80";

const PERIOD_UNITS: RentalPeriodUnit[] = ["hour", "day", "week", "month"];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function productSlug(item: PublicCatalogItem): string {
  return slugify(item.productSku || item.name);
}

function toRates(variant: PublicVariant): RateEntry[] {
  return (variant.rates ?? [])
    .filter((r): r is { periodCode: RentalPeriodUnit; ratePaise: number } =>
      (PERIOD_UNITS as string[]).includes(r.periodCode),
    )
    .map((r) => ({ unit: r.periodCode, amount: r.ratePaise }))
    .sort((a, b) => PERIOD_UNITS.indexOf(a.unit) - PERIOD_UNITS.indexOf(b.unit));
}

function toProduct(
  item: PublicCatalogItem,
  variants: PublicVariant[],
  categorySlugById: Map<string, string>,
): Product {
  const image = item.images?.[0] ?? PLACEHOLDER_IMAGE;
  const gallery = item.images && item.images.length > 0 ? item.images : [image];
  const description = item.description ?? "";

  const mappedVariants: ProductVariant[] = variants
    .map((v) => ({
      id: v._id,
      label: v.name,
      attributes: v.attributes ?? {},
      rates: toRates(v),
    }))
    .filter((v) => v.rates.length > 0);

  return {
    id: item._id,
    slug: productSlug(item),
    name: item.name,
    categorySlug: categorySlugById.get(item.categoryId) ?? "",
    brand: item.brand ?? "",
    summary: description.length > 160 ? `${description.slice(0, 157)}…` : description,
    description,
    image,
    gallery,
    variants: mappedVariants,
  };
}

export interface CatalogData {
  categories: Category[];
  products: Product[];
  live: boolean;
}

export interface CatalogQuery {
  q?: string;
  /** Category `code` (storefront slug). */
  categorySlug?: string;
  limit?: number;
}

let fullCache: CatalogData | null = null;
let fullCacheAt = 0;
const CACHE_MS = 15_000;

async function mapItems(
  items: PublicCatalogItem[],
  publicCategories: Awaited<ReturnType<typeof fetchPublicCategories>>,
): Promise<{ categories: Category[]; products: Product[] }> {
  const categorySlugById = new Map(publicCategories.map((c) => [c._id, c.code]));
  const categories: Category[] = publicCategories.map((c) => ({
    id: c._id,
    slug: c.code,
    name: c.name,
    blurb: "",
  }));

  const variantLists = await Promise.all(
    items.map((item) => fetchPublicVariants(item._id).catch(() => [] as PublicVariant[])),
  );
  const products = items
    .map((item, i) => toProduct(item, variantLists[i], categorySlugById))
    .filter((p) => p.variants.length > 0);

  return { categories, products };
}

/** Full active catalog (cached). Used by home + PDP resolution. */
export async function getCatalog(): Promise<CatalogData> {
  const now = Date.now();
  if (fullCache && now - fullCacheAt < CACHE_MS) return fullCache;

  try {
    const [publicCategories, items] = await Promise.all([
      fetchPublicCategories(),
      fetchPublicCatalog({ limit: 100 }),
    ]);
    const mapped = await mapItems(items, publicCategories);
    fullCache = { ...mapped, live: true };
  } catch {
    fullCache = { categories: [], products: [], live: false };
  }
  fullCacheAt = now;
  return fullCache;
}

/**
 * Server-filtered catalog via GET /catalog?q=&categoryId=.
 * Always hits the API for the product list (categories reuse short cache when live).
 */
export async function queryCatalog(query: CatalogQuery = {}): Promise<CatalogData> {
  const q = query.q?.trim() || undefined;
  const categorySlug = query.categorySlug?.trim() || undefined;
  const filtered = Boolean(q || (categorySlug && categorySlug !== "all"));

  if (!filtered) return getCatalog();

  try {
    const publicCategories = await fetchPublicCategories();
    const categoryId =
      categorySlug && categorySlug !== "all"
        ? publicCategories.find((c) => c.code === categorySlug)?._id
        : undefined;

    if (categorySlug && categorySlug !== "all" && !categoryId) {
      return {
        categories: publicCategories.map((c) => ({
          id: c._id,
          slug: c.code,
          name: c.name,
          blurb: "",
        })),
        products: [],
        live: true,
      };
    }

    const items = await fetchPublicCatalog({
      limit: query.limit ?? 100,
      q,
      categoryId,
    });
    const mapped = await mapItems(items, publicCategories);
    return { ...mapped, live: true };
  } catch {
    return { categories: [], products: [], live: false };
  }
}

export async function getCatalogProducts(): Promise<Product[]> {
  return (await getCatalog()).products;
}

export async function getCategories(): Promise<Category[]> {
  return (await getCatalog()).categories;
}

export async function getProductBySlug(
  slug: string,
): Promise<CatalogData & { product?: Product }> {
  const catalog = await getCatalog();
  const product = catalog.products.find((p) => p.slug === slug);
  return { ...catalog, product };
}

export function getCategoryBySlug(categories: Category[], slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function productsInCategory(products: Product[], categorySlug: string): Product[] {
  return products.filter((p) => p.categorySlug === categorySlug);
}
