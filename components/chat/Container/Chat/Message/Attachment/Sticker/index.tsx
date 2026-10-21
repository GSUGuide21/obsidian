"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { StickerAttachment } from "@/lib/chat/types";
import { safeUrl } from "@/lib/chat/url";

/** A sticker from the group's pack: the image on its own, big, with no frame. */
export default function Sticker({ attachment }: { attachment: StickerAttachment }) {
  const src = safeUrl(attachment.url);
  const [failed, setFailed] = useState(false);
  const label = `Sticker: ${attachment.name.replace(/_/g, " ")}`;

  if (!src || failed) {
    return (
      <div className="flex size-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted">
        <ImageOff aria-hidden className="size-4" />
        <span className="max-w-full truncate px-2 font-mono">{attachment.name}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded stickers
    <img
      src={src}
      alt={label}
      title={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-32 object-contain dense:size-24"
    />
  );
}
