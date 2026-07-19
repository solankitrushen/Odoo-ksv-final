"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const list = images.length > 0 ? images : [""];

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-muted">
        <Image
          key={active}
          src={list[active]}
          alt={alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover animate-fade-up"
        />
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex gap-3">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              className={cn(
                "relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg border transition-colors",
                i === active ? "border-ink" : "border-line hover:border-line-strong",
              )}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
