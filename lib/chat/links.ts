import type { ExternalAttachment, ExternalMediaSites } from "./types";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

export function findUrls(text: string) {
  return [...text.matchAll(URL_PATTERN)].map((match) => match[0]);
}

export function detectSite(url: URL): ExternalMediaSites | undefined {
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  if (host === "vimeo.com") return "vimeo";
  if (host === "twitch.tv") return "twitch";
  if (host === "instagram.com") return "instagram";
  if (host === "facebook.com" || host === "fb.watch") return "facebook";
  if (host === "twitter.com" || host === "x.com") return "twitter";
}

/** External media cards for any recognised video/social links in the text. */
export function externalAttachments(text: string): ExternalAttachment[] {
  const seen = new Set<string>();
  const result: ExternalAttachment[] = [];
  for (const href of findUrls(text)) {
    if (seen.has(href)) continue;
    seen.add(href);
    try {
      const site = detectSite(new URL(href));
      if (site) result.push({ type: "external", url: href, site });
    } catch {
      // Not a parseable URL; leave it as plain text.
    }
  }
  return result.slice(0, 3);
}
