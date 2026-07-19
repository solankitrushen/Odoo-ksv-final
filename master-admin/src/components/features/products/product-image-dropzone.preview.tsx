"use client";

/**
 * Hallmark 8-state demo — open once, then delete.
 * Not wired into production routes.
 */

import { ProductImageDropzone } from "./product-image-dropzone";

const STATES = [
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
  "loading",
  "error",
  "success",
] as const;

export default function ProductImageDropzonePreview() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-8">
      <h1 className="text-lg font-semibold">ProductImageDropzone — 8 states</h1>
      {STATES.map((state) => (
        <div className="flex flex-col gap-2" key={state}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{state}</p>
          <ProductImageDropzone
            forceState={state}
            onAddFiles={async () => {}}
            urls={state === "success" ? ["https://placehold.co/80x80/png"] : []}
          />
        </div>
      ))}
    </div>
  );
}
