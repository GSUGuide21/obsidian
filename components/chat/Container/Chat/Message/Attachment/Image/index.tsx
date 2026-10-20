"use client";

import { useRef, useState } from "react";
import { ImageOff, X } from "lucide-react";
import type { ImageAttachment } from "@/lib/chat/types";
import { safeUrl } from "@/lib/chat/url";
import { cn } from "@/lib/utils";

export default function Image({ attachment }: { attachment: ImageAttachment }) {
  const { alt, caption, width, height, thumbnail } = attachment;
  const src = safeUrl(attachment.src);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const label = alt || caption || "Image";

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface text-xs text-muted",
          thumbnail ? "size-28" : "h-32 w-full max-w-md",
        )}
      >
        <ImageOff aria-hidden className="size-4" />
        {thumbnail ? <span className="sr-only">{label} unavailable</span> : `${label} unavailable`}
      </div>
    );
  }

  return (
    <figure className={thumbnail ? "w-28" : "w-full max-w-md"}>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Open ${label}`}
        className="block w-full overflow-hidden rounded-xl border border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs */}
        <img
          src={src}
          alt={alt ?? caption ?? ""}
          width={width}
          height={height}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "w-full object-cover transition-opacity hover:opacity-90",
            thumbnail ? "aspect-square" : "max-h-80",
          )}
          style={!thumbnail && width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
        />
      </button>
      {caption && !thumbnail && <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption>}

      <dialog
        ref={dialogRef}
        aria-label={label}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs */}
        <img
          src={src}
          alt={alt ?? caption ?? ""}
          className="max-h-[85dvh] max-w-[92vw] rounded-lg object-contain"
        />
        {caption && <p className="mt-2 text-center text-sm text-white/80">{caption}</p>}
        <form method="dialog" className="fixed top-4 right-4">
          <button
            aria-label="Close image"
            className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <X className="size-5" />
          </button>
        </form>
      </dialog>
    </figure>
  );
}
