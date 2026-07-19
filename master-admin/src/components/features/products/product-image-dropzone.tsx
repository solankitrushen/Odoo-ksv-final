"use client";

/* Hallmark · component: dropzone · genre: modern-minimal · theme: project tokens
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import { cn } from "@/lib/utils";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp";
const ACCEPT_SET = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

type ProductImageDropzoneProps = {
  urls: string[];
  max?: number;
  disabled?: boolean;
  uploading?: boolean;
  /** Force a visual state for demos / previews */
  forceState?: "default" | "hover" | "focus" | "active" | "disabled" | "loading" | "error" | "success";
  onAddFiles: (files: File[]) => void | Promise<void>;
  onRemove?: (url: string) => void | Promise<void>;
  className?: string;
};

function filterImageFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => ACCEPT_SET.has(f.type));
}

/**
 * Product image drop zone: one click → picker; drag/drop; remove never opens picker.
 * Compression only in rentalUploadProductImages — not here.
 */
export function ProductImageDropzone({
  urls,
  max = 10,
  disabled = false,
  uploading = false,
  forceState,
  onAddFiles,
  onRemove,
  className,
}: ProductImageDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const remaining = Math.max(0, max - urls.length);
  const isDisabled = disabled || forceState === "disabled" || remaining <= 0;
  const isLoading = uploading || forceState === "loading";
  const isError = Boolean(error) || forceState === "error";
  const isSuccess = (justAdded && !isLoading && !isError) || forceState === "success";
  const locked = isDisabled || isLoading;

  const openPicker = useCallback(() => {
    if (locked) return;
    setError(null);
    inputRef.current?.click();
  }, [locked]);

  const takeFiles = useCallback(
    async (raw: FileList | File[] | null) => {
      const images = filterImageFiles(raw).slice(0, remaining);
      if (!images.length) {
        setError("Use JPEG, PNG, or WebP.");
        return;
      }
      setError(null);
      await onAddFiles(images);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1600);
    },
    [onAddFiles, remaining]
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <input
        accept={ACCEPT}
        className="sr-only"
        disabled={locked}
        id={inputId}
        multiple={remaining > 1}
        onChange={(e) => {
          void takeFiles(e.target.files);
          e.target.value = "";
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />

      <div
        aria-busy={isLoading || undefined}
        aria-disabled={locked || undefined}
        aria-invalid={isError || undefined}
        className={cn(
          "relative rounded-md border border-dashed px-4 py-6 text-center outline-none transition-colors duration-150",
          "border-border bg-panel",
          /* hover + forced */
          "hover:border-foreground/35 hover:bg-muted/25",
          "active:translate-y-px active:bg-muted/35",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          forceState === "hover" && "border-foreground/35 bg-muted/25",
          forceState === "focus" && "ring-2 ring-ring ring-offset-2",
          forceState === "active" && "translate-y-px bg-muted/35",
          dragging && !locked && "border-foreground/50 bg-muted/40",
          locked && "cursor-not-allowed opacity-60 hover:border-border hover:bg-panel",
          !locked && "cursor-pointer",
          isError && "border-destructive/60 bg-destructive/5",
          isSuccess && !isError && "border-foreground/40"
        )}
        data-state={
          isLoading
            ? "loading"
            : isError
              ? "error"
              : isSuccess
                ? "success"
                : isDisabled
                  ? "disabled"
                  : dragging
                    ? "active"
                    : "default"
        }
        onClick={() => openPicker()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current += 1;
          if (!locked) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          if (locked) return;
          void takeFiles(e.dataTransfer.files);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={locked ? -1 : 0}
      >
        <div className="pointer-events-none mx-auto flex max-w-xs flex-col items-center gap-1.5">
          {isLoading ? (
            <Loader2 aria-hidden className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isSuccess ? (
            <Check aria-hidden className="h-5 w-5 text-foreground" />
          ) : (
            <ImagePlus aria-hidden className="h-5 w-5 text-muted-foreground" />
          )}
          <p className="text-sm font-medium text-foreground">
            {isLoading
              ? "Uploading…"
              : isError
                ? "Could not add that file"
                : isSuccess
                  ? "Added"
                  : dragging
                    ? "Drop to upload"
                    : "Drop images here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP · up to {max}
            {remaining < max ? ` · ${remaining} left` : null}
          </p>
        </div>
      </div>

      {isError && error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : forceState === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          Use JPEG, PNG, or WebP.
        </p>
      ) : null}

      {urls.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {urls.map((url) => (
            <li
              className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-panel"
              key={url}
            >
              <Image alt="" className="object-cover" fill sizes="80px" src={url} unoptimized />
              {onRemove ? (
                <button
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80 text-background transition-colors hover:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50"
                  disabled={disabled || isLoading}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onRemove(url);
                  }}
                  type="button"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
