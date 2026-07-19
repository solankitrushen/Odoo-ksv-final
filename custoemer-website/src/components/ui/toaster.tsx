"use client";

// Minimal toast system, no extra dependency. Exposes a `toast()` function via a
// module-level emitter so any component can fire one.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

let counter = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(title: string, opts?: { description?: string; tone?: ToastTone }) {
  const item: ToastItem = {
    id: ++counter,
    title,
    description: opts?.description,
    tone: opts?.tone ?? "default",
  };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), 3600);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-card p-4 shadow-lg animate-fade-up"
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              t.tone === "success" && "bg-success/12 text-success",
              t.tone === "error" && "bg-danger/12 text-danger",
              t.tone === "default" && "bg-muted text-ink-soft",
            )}
          >
            {t.tone === "success" ? (
              <Check className="h-3 w-3" />
            ) : t.tone === "error" ? (
              <X className="h-3 w-3" />
            ) : (
              <Info className="h-3 w-3" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs text-ink-soft">{t.description}</p>}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
