"use client";

import { useState } from "react";
import { Download, FileText, Globe } from "lucide-react";
import { formatBytes } from "@/lib/chat/format";
import type { LinkPreview } from "@/lib/chat/types";
import { fileName, hostname, safeUrl } from "@/lib/chat/url";
import { cn } from "@/lib/utils";
import Audio from "../Audio";
// Named so the a11y lint doesn't take it for an <img> (it sets its own alt).
import ImageAttachment from "../Image";
import Video from "../Video";
import { card } from "../styles";

/**
 * A link's preview card (made by the server, see lib/chat/unfurl.ts): a page
 * as it describes itself, a file linked to directly (images, video and audio
 * play inline), or, when nothing more is known, the link's site and path.
 */
export default function Link({
  attachment,
  compact = false,
}: {
  attachment: LinkPreview;
  /** One short row (the composer's preview): no large image, and media aren't played. */
  compact?: boolean;
}) {
  const url = safeUrl(attachment.url);
  if (!url) return null;
  if (compact && attachment.media) return <LinkedFile attachment={attachment} url={url} />;
  if (compact) return <PageCard attachment={{ ...attachment, large: false }} url={url} compact />;
  switch (attachment.media) {
    case "image":
    case "video":
    case "audio":
      return <LinkedMedia attachment={attachment} url={url} kind={attachment.media} />;
    case "file":
      return <LinkedFile attachment={attachment} url={url} />;
    default:
      return <PageCard attachment={attachment} url={url} />;
  }
}

/** The site's icon, or a globe when it has none (or it doesn't load). */
function SiteIcon({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  const icon = safeUrl(src);
  if (!icon || failed) return <Globe aria-hidden className="size-3.5 shrink-0 text-muted" />;
  // On a light tile: most icons are drawn for light browser tabs, and dark ones vanish on navy.
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-foreground p-px">
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary sites' icons */}
      <img src={icon} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" />
    </span>
  );
}

/** "example.com/blog/post" for a link without a title (the query and fragment left out). */
function shortAddress(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : decodeURI(parsed.pathname).replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

function PageCard({ attachment, url, compact = false }: { attachment: LinkPreview; url: string; compact?: boolean }) {
  const { title, description, siteName, icon, large } = attachment;
  const thumbnail = safeUrl(attachment.thumbnail);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const color = attachment.color && /^#[0-9a-f]{6}$/i.test(attachment.color) ? attachment.color : undefined;
  const plain = !title && !description;
  const showThumbnail = thumbnail && !thumbnailFailed;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(card, "block border-l-4 border-l-accent transition-colors hover:bg-surface-2")}
      // The site's own color, when it declares one.
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <SiteIcon src={icon} />
            <span className="truncate">{siteName || hostname(url)}</span>
          </p>
          {plain ? (
            <p className="mt-0.5 truncate text-sm font-medium text-accent-bright">{shortAddress(url)}</p>
          ) : (
            <>
              {title && (
                <p className={cn("mt-0.5 font-medium text-accent-bright", compact ? "truncate" : "line-clamp-2")}>{title}</p>
              )}
              {description && (
                <p className={cn("mt-0.5 text-sm text-muted", compact ? "truncate" : "line-clamp-3")}>{description}</p>
              )}
            </>
          )}
        </div>
        {showThumbnail && !large && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="size-16 shrink-0 rounded-lg object-cover"
          />
        )}
      </div>
      {showThumbnail && large && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          onError={() => setThumbnailFailed(true)}
          className="mt-2 max-h-72 w-full rounded-lg object-cover"
        />
      )}
    </a>
  );
}

/** "PDF · 2.3 MB · example.com" */
function fileDetails(attachment: LinkPreview, name: string, url: string) {
  const extension = name.includes(".") ? name.split(".").pop()!.toUpperCase() : undefined;
  const type = extension ?? attachment.contentType?.split("/").pop()?.toUpperCase();
  return [type, attachment.size !== undefined ? formatBytes(attachment.size) : undefined, hostname(url)]
    .filter(Boolean)
    .join(" · ");
}

function LinkedFile({ attachment, url }: { attachment: LinkPreview; url: string }) {
  const name = attachment.fileName || fileName(url);
  return (
    <div className={cn(card, "flex items-center gap-3")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
        <FileText aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">
          {name}
        </a>
        <p className="truncate text-xs text-muted">{fileDetails(attachment, name, url)}</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${name}`}
        className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Download className="size-4" />
      </a>
    </div>
  );
}

/** An image, video or audio file linked to directly: shown like an upload, with where it's from. */
function LinkedMedia({ attachment, url, kind }: { attachment: LinkPreview; url: string; kind: "image" | "video" | "audio" }) {
  const name = attachment.fileName || fileName(url);
  return (
    <div className="w-full max-w-md space-y-1">
      {kind === "image" && <ImageAttachment attachment={{ type: "image", src: url, alt: name }} />}
      {kind === "video" && <Video attachment={{ type: "video", src: url, alt: name }} />}
      {kind === "audio" && <Audio attachment={{ type: "audio", src: url, caption: name }} />}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-muted hover:text-foreground hover:underline"
      >
        <span className="truncate">{fileDetails(attachment, name, url)}</span>
      </a>
    </div>
  );
}
