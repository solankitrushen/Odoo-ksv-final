"use client";

// Hybrid cart: a guest cart lives in localStorage; on login its lines are
// replayed into the server cart (/cart) and from then on the server is the
// source of truth for pricing (/cart/preview) and availability. Server lines
// carry no presentation data, so they're enriched from the public catalog.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartLine, RentalPeriodUnit } from "./domain/types";
import { useAuth } from "./auth-store";
import { getCatalog } from "./catalog-service";
import {
  addServerCartItem,
  clearServerCart,
  fetchServerCart,
  previewServerCart,
  removeServerCartItem,
  updateServerCartItem,
  type CartPreview,
  type ServerCartLine,
} from "./rental-api";

const STORAGE_KEY = "rental-cart-v3";
const PLACEHOLDER =
  "https://images.unsplash.com/photo-1519638831568-d9897f54ed69?auto=format&fit=crop&w=900&q=80";

export interface AddCartInput {
  productId: string;
  productSlug: string;
  productName: string;
  image: string;
  variantId: string;
  variantLabel: string;
  periodCode: RentalPeriodUnit;
  quantity: number;
  ratePaise: number;
  startAt: string;
  endAt: string;
}

interface VariantInfo {
  productId: string;
  productSlug: string;
  productName: string;
  image: string;
  variantLabel: string;
  rates: Partial<Record<RentalPeriodUnit, number>>;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  mode: "guest" | "server";
  preview: CartPreview | null;
  hydrated: boolean;
  busy: boolean;
  add: (input: AddCartInput) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  refreshPreview: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

function readLocal(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(lines: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // storage unavailable — cart stays in memory
  }
}

function enrich(line: ServerCartLine, vmap: Map<string, VariantInfo>): CartLine {
  const info = vmap.get(String(line.variantId));
  return {
    id: line.lineId,
    productId: info?.productId ?? "",
    productSlug: info?.productSlug ?? "",
    productName: info?.productName ?? "Rental item",
    image: info?.image ?? PLACEHOLDER,
    variantId: String(line.variantId),
    variantLabel: info?.variantLabel ?? "",
    periodCode: line.periodCode,
    quantity: line.quantity,
    ratePaise: info?.rates?.[line.periodCode] ?? 0,
    startAt: typeof line.startAt === "string" ? line.startAt : new Date(line.startAt).toISOString(),
    endAt: typeof line.endAt === "string" ? line.endAt : new Date(line.endAt).toISOString(),
    availability: line.availability
      ? { availableCount: line.availability.availableCount, sufficient: line.availability.sufficient }
      : undefined,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, hydrated: authHydrated } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [mode, setMode] = useState<"guest" | "server">("guest");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  // variantId → presentation info, seeded from adds and the public catalog.
  const vmapRef = useRef<Map<string, VariantInfo>>(new Map());
  const syncedRef = useRef(false);

  const ensureVmap = useCallback(async () => {
    try {
      const { products } = await getCatalog();
      const map = vmapRef.current;
      for (const p of products) {
        for (const v of p.variants) {
          const rates: Partial<Record<RentalPeriodUnit, number>> = {};
          for (const r of v.rates) rates[r.unit] = r.amount;
          map.set(v.id, {
            productId: p.id,
            productSlug: p.slug,
            productName: p.name,
            image: p.image,
            variantLabel: v.label,
            rates,
          });
        }
      }
    } catch {
      // keep whatever was seeded by adds
    }
    return vmapRef.current;
  }, []);

  const loadServer = useCallback(async () => {
    const [{ cart }, vmap] = await Promise.all([fetchServerCart(), ensureVmap()]);
    setLines(cart.lines.map((l) => enrich(l, vmap)));
    try {
      const { preview: pv } = await previewServerCart();
      setPreview(pv);
    } catch {
      setPreview(null); // empty cart or transient
    }
  }, [ensureVmap]);

  // Hydrate guest cart once on mount.
  useEffect(() => {
    setLines(readLocal());
    setHydrated(true);
  }, []);

  // React to auth transitions: sync-up on login, reset on logout.
  useEffect(() => {
    if (!authHydrated || !hydrated) return;
    let cancelled = false;

    if (isAuthenticated && !syncedRef.current) {
      syncedRef.current = true;
      void (async () => {
        setBusy(true);
        try {
          const local = readLocal();
          for (const l of local) {
            vmapRef.current.set(l.variantId, {
              productId: l.productId,
              productSlug: l.productSlug,
              productName: l.productName,
              image: l.image,
              variantLabel: l.variantLabel,
              rates: { [l.periodCode]: l.ratePaise },
            });
            try {
              await addServerCartItem({
                variantId: l.variantId,
                quantity: l.quantity,
                periodCode: l.periodCode,
                startAt: l.startAt,
                endAt: l.endAt,
              });
            } catch {
              // line no longer available — skip it, don't block the merge
            }
          }
          writeLocal([]);
          if (cancelled) return;
          setMode("server");
          await loadServer();
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }

    if (!isAuthenticated && syncedRef.current) {
      syncedRef.current = false;
      setMode("guest");
      setPreview(null);
      setLines(readLocal());
    }
    return () => {
      cancelled = true;
    };
  }, [authHydrated, hydrated, isAuthenticated, loadServer]);

  const add = useCallback(
    async (input: AddCartInput) => {
      vmapRef.current.set(input.variantId, {
        productId: input.productId,
        productSlug: input.productSlug,
        productName: input.productName,
        image: input.image,
        variantLabel: input.variantLabel,
        rates: { [input.periodCode]: input.ratePaise },
      });

      if (mode === "server") {
        setBusy(true);
        try {
          await addServerCartItem({
            variantId: input.variantId,
            quantity: input.quantity,
            periodCode: input.periodCode,
            startAt: input.startAt,
            endAt: input.endAt,
          });
          await loadServer();
        } finally {
          setBusy(false);
        }
        return;
      }

      setLines((prev) => {
        const next: CartLine[] = [
          ...prev,
          {
            id: `${input.variantId}-${Date.now()}`,
            productId: input.productId,
            productSlug: input.productSlug,
            productName: input.productName,
            image: input.image,
            variantId: input.variantId,
            variantLabel: input.variantLabel,
            periodCode: input.periodCode,
            quantity: input.quantity,
            ratePaise: input.ratePaise,
            startAt: input.startAt,
            endAt: input.endAt,
          },
        ];
        writeLocal(next);
        return next;
      });
    },
    [mode, loadServer],
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      if (quantity < 1) return;
      if (mode === "server") {
        setBusy(true);
        try {
          await updateServerCartItem(id, { quantity });
          await loadServer();
        } finally {
          setBusy(false);
        }
        return;
      }
      setLines((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, quantity } : l));
        writeLocal(next);
        return next;
      });
    },
    [mode, loadServer],
  );

  const remove = useCallback(
    async (id: string) => {
      if (mode === "server") {
        setBusy(true);
        try {
          await removeServerCartItem(id);
          await loadServer();
        } finally {
          setBusy(false);
        }
        return;
      }
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== id);
        writeLocal(next);
        return next;
      });
    },
    [mode, loadServer],
  );

  const clear = useCallback(async () => {
    if (mode === "server") {
      setBusy(true);
      try {
        await clearServerCart();
        setLines([]);
        setPreview(null);
      } finally {
        setBusy(false);
      }
      return;
    }
    setLines([]);
    writeLocal([]);
  }, [mode]);

  const refreshPreview = useCallback(async () => {
    if (mode !== "server") return;
    try {
      const { preview: pv } = await previewServerCart();
      setPreview(pv);
    } catch {
      setPreview(null);
    }
  }, [mode]);

  const count = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        lines,
        count,
        mode,
        preview,
        hydrated: hydrated && authHydrated,
        busy,
        add,
        updateQuantity,
        remove,
        clear,
        refreshPreview,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
