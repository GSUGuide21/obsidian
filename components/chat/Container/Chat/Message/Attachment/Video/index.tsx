import type { VideoAttachment } from "@/lib/chat/types";
import { safeUrl } from "@/lib/chat/url";
import { cn } from "@/lib/utils";

export default function Video({ attachment }: { attachment: VideoAttachment }) {
  const { alt, caption, width, height, thumbnail } = attachment;
  const src = safeUrl(attachment.src);
  if (!src) return null;

  return (
    <figure className={thumbnail ? "w-48" : "w-full max-w-md"}>
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={alt ?? caption ?? "Video"}
        width={width}
        height={height}
        className={cn("w-full rounded-xl border border-border bg-black", !thumbnail && "max-h-80")}
        style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
      />
      {caption && <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}
