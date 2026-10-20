// Link previews: which link in a message gets a card, and what that card says.
// Every link gets one: a page's own description of itself (parsePreview), a
// file's name, type and size (filePreview), or, when nothing more is known,
// just its address (plainPreview). Parsing only; lib/chat/previewFetch.ts does
// the fetching, with its network checks. Imported by path under Node's type
// stripping (and by the browser, for the composer's preview).

import { isPrivateAddress } from "./safety.ts";
import type { Attachment, LinkPreview } from "./types";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/i;

/** Sites shown as embeds (see links.ts) rather than preview cards. */
const EMBED_HOSTS = /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)$/;

/**
 * The link to preview: the first one in the text that isn't an embedded site
 * and doesn't already have a card. Undefined when there's none.
 */
export function previewTarget(text: string, attachments: readonly Attachment[] = []) {
  const match = URL_PATTERN.exec(text);
  if (!match) return undefined;
  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    return undefined;
  }
  if (EMBED_HOSTS.test(url.hostname)) return undefined;
  const shown = new Set(attachments.flatMap((a) => (a.type === "link" || a.type === "external" ? [a.url] : [])));
  return shown.has(url.href) || shown.has(match[0]) ? undefined : url.href;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

function safeChar(code: number) {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** Trim, collapse whitespace and cap the length. */
function clean(text: string | undefined, max: number) {
  if (!text) return undefined;
  const value = decode(text).replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Attributes of one tag, lowercased names: `<meta property="og:title" content="x">`. */
function attributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const [, name, , double, single, bare] of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[name.toLowerCase()] = double ?? single ?? bare ?? "";
  }
  return attrs;
}

/**
 * An image a page points to (its thumbnail or icon), resolved against the page:
 * http(s) only, and never a literal private address, which would have every
 * viewer's browser probe their own network. Undefined when it isn't one.
 */
function imageUrl(value: string | undefined, base: string) {
  if (!value?.trim()) return undefined;
  try {
    const resolved = new URL(decode(value.trim()), base);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return undefined;
    // Names are fine (their address isn't known here); literal IPs must be public.
    const host = resolved.hostname.replace(/^\[|\]$/g, "");
    if ((/^[\d.]+$/.test(host) || host.includes(":")) && isPrivateAddress(host)) return undefined;
    return resolved.href.length <= 2048 ? resolved.href : undefined;
  } catch {
    return undefined; // a broken URL: none
  }
}

/** "#abc" or "#aabbcc" as "#aabbcc"; undefined for anything else (names, rgb(), …). */
function hexColor(value: string | undefined) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${hex.toLowerCase()}`;
}

/** The card for a link nothing more is known about: its address (shown as the site and path). */
export function plainPreview(url: string, icon?: string): LinkPreview {
  return { type: "link", url, ...(icon && { icon }) };
}

/** Where a site keeps its icon by convention, when its page doesn't say. */
export function defaultIcon(pageUrl: string) {
  return imageUrl("/favicon.ico", pageUrl);
}

/**
 * What the page says about itself (Open Graph, then Twitter cards, then its
 * <title> and description), as a preview card for `pageUrl`; relative image
 * and icon URLs resolve against `base`, where the page actually was (after
 * redirects). Without a title or description it's a plain card with the
 * site's icon and name. Only http(s) images are kept.
 */
export function parsePreview(html: string, pageUrl: string, base = pageUrl): LinkPreview {
  // Everything that matters is in <head>; don't scan megabytes of body.
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  // Icons: an ordinary one first (it's what tabs show), else the touch icon.
  const icons: { rel: string; href: string }[] = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (attrs.href && rel.some((r) => r === "icon" || r === "apple-touch-icon")) {
      icons.push({ rel: rel.includes("icon") ? "icon" : "apple-touch-icon", href: attrs.href });
    }
  }
  const declaredIcon = (icons.find((i) => i.rel === "icon") ?? icons[0])?.href;
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];

  const title = clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 200);
  const description = clean(meta["og:description"] ?? meta["twitter:description"] ?? meta.description, 500);
  const siteName = clean(meta["og:site_name"] ?? meta["application-name"], 100);
  const thumbnail = imageUrl(meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"], base);
  const icon = imageUrl(declaredIcon, base) ?? defaultIcon(base);
  const color = hexColor(meta["theme-color"]);
  // Sites ask for a big image with this; it's only worth it when there is one.
  const large = thumbnail !== undefined && meta["twitter:card"]?.trim().toLowerCase() === "summary_large_image";
  return {
    type: "link",
    url: pageUrl,
    ...(title && { title }),
    ...(description && { description }),
    ...(thumbnail && { thumbnail }),
    ...(siteName && { siteName }),
    ...(icon && { icon }),
    ...(color && { color }),
    ...(large && { large: true }),
  };
}

/** What a file link is, from its Content-Type: shown inline if browsers can show it, else as a file. */
function mediaKind(type: string): NonNullable<LinkPreview["media"]> {
  if (/^image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp)$/.test(type)) return "image";
  if (/^video\/(?:mp4|webm|ogg|quicktime)$/.test(type)) return "video";
  if (/^audio\/(?:mpeg|mp4|aac|ogg|wav|x-wav|webm|flac)$/.test(type)) return "audio";
  return "file";
}

/** The file's name: what Content-Disposition says, else the URL's last path segment. */
function linkedFileName(url: string, disposition?: string) {
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition ?? "")?.[1];
  const quoted = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(disposition ?? "");
  let name = "";
  try {
    name = encoded ? decodeURIComponent(encoded.trim()) : (quoted?.[1] ?? quoted?.[2] ?? "").trim();
    if (!name) name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    // Badly encoded: fall back to what's left.
  }
  // Path parts and control characters out, as for uploads.
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f"]/g, "").trim() ?? "";
  return base ? clean(base, 120) : undefined;
}

/**
 * The card for a link straight to a file (anything but a web page), from the
 * response's headers: images, video and audio browsers play are shown inline;
 * anything else is a file with its name, type and size.
 */
export function filePreview(url: string, headers: { type?: string; length?: string; disposition?: string }): LinkPreview {
  const contentType = (headers.type ?? "").split(";")[0].trim().toLowerCase();
  const size = Number(headers.length);
  const fileName = linkedFileName(url, headers.disposition);
  return {
    type: "link",
    url,
    media: mediaKind(contentType),
    ...(fileName && { fileName }),
    ...(/^[\w.+-]+\/[\w.+-]+$/.test(contentType) && { contentType }),
    ...(Number.isSafeInteger(size) && size > 0 && { size }),
  };
}
