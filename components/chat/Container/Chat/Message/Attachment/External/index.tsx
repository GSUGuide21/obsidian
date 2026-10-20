"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { ExternalAttachment, ExternalMediaSites } from "@/lib/chat/types";
import { detectSite } from "@/lib/chat/links";
import { hostname, safeUrl } from "@/lib/chat/url";
import { card } from "../styles";

const siteNames: Record<ExternalMediaSites, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X (Twitter)",
  vimeo: "Vimeo",
  twitch: "Twitch",
};

/** Inline player for sites that allow embedding without extra setup. */
function embedFor(url: URL, site?: ExternalMediaSites) {
  if (site === "youtube") {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1]);
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }
  if (site === "vimeo") {
    const id = url.pathname.match(/^\/(\d+)/)?.[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}?autoplay=1`, thumbnail: undefined };
  }
}

export default function External({ attachment }: { attachment: ExternalAttachment }) {
  const [playing, setPlaying] = useState(false);
  const href = safeUrl(attachment.url);
  if (!href) return null;

  const url = new URL(href);
  const site = attachment.site ?? detectSite(url);
  const embed = embedFor(url, site);
  const thumbnail = safeUrl(attachment.thumbnail) ?? embed?.thumbnail;
  const title = attachment.title || href;

  return (
    <div className={card}>
      <p className="text-xs text-muted">{site ? siteNames[site] : hostname(href)}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1 font-medium text-accent-bright hover:underline"
      >
        <span className="truncate">{title}</span>
        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      </a>
      {attachment.description && (
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{attachment.description}</p>
      )}

      {embed && playing ? (
        <iframe
          src={embed.src}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="mt-2 aspect-video w-full rounded-lg border-0"
        />
      ) : embed || thumbnail ? (
        <button
          type="button"
          disabled={!embed}
          onClick={() => setPlaying(true)}
          aria-label={embed ? `Play ${title}` : undefined}
          className="group/play relative mt-2 block aspect-video w-full overflow-hidden rounded-lg bg-surface-2 disabled:cursor-default"
        >
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs
            <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover" />
          )}
          {embed && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white transition-transform group-hover/play:scale-110">
                <Play aria-hidden className="size-6 translate-x-0.5" />
              </span>
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}
