import { Music } from "lucide-react";
import type { AudioAttachment } from "@/lib/chat/types";
import { fileName, safeUrl } from "@/lib/chat/url";
import { card } from "../styles";

export default function Audio({ attachment }: { attachment: AudioAttachment }) {
  const src = safeUrl(attachment.src);
  if (!src) return null;
  const title = attachment.caption || attachment.alt || fileName(src);

  return (
    <figure className={card}>
      <figcaption className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Music aria-hidden className="size-4 shrink-0 text-accent-bright" />
        <span className="truncate">{title}</span>
      </figcaption>
      <audio src={src} controls preload="metadata" aria-label={title} className="h-10 w-full" />
    </figure>
  );
}
