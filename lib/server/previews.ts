// Link previews: the first ordinary link in a message gets a card.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { fetchPreviewPage } from "../chat/previewFetch.ts";
import type { LinkPreview, Message } from "../chat/types";
import { previewTarget } from "../chat/unfurl.ts";
import { toChannel } from "./access.ts";
import { db } from "./db.ts";
import { limiter } from "./limits.ts";
import { hydrate, loadMessage, toMessage } from "./messages.ts";
import { latest, type MessageRow } from "./state.ts";
import { MAX_ATTACHMENTS } from "./validation.ts";

// ---------------------------------------------------------------------------
// Link previews: after a message is sent, the first ordinary link in it gets
// a card from the page's Open Graph tags (fetched safely: see
// lib/chat/previewFetch.ts). Results are cached for an hour.
// ---------------------------------------------------------------------------

export const PREVIEW_CACHE_SIZE = 500;

/** Per connection: the composer asks while someone types a link. */
export const canPreview = limiter(10, 0.5);

export const previewCache = new Map<string, { preview: LinkPreview | null; at: number }>();

export async function fetchPreview(href: string) {
  const cached = previewCache.get(href);
  if (cached && Date.now() - cached.at < 3600 * 1000) return cached.preview;
  const preview = await fetchPreviewPage(href).catch(() => null);
  previewCache.delete(href);
  previewCache.set(href, { preview, at: Date.now() });
  if (previewCache.size > PREVIEW_CACHE_SIZE) previewCache.delete(previewCache.keys().next().value!);
  return preview;
}

/**
 * The card a message with this link would get (for the composer, while it's
 * typed); null when it wouldn't get one. Cached, so the message's own card
 * comes from the same fetch.
 */
export async function previewFor(url: unknown) {
  if (typeof url !== "string" || url.length > 2048) return null;
  const href = previewTarget(url);
  return href ? fetchPreview(href) : null;
}

/** Add a preview card to a just-sent message, if it has a link worth one, and tell everyone. */
export async function attachPreview(message: Message) {
  const href = previewTarget(message.text, message.attachments);
  if (!href || (message.attachments?.length ?? 0) >= MAX_ATTACHMENTS) return;
  const preview = await fetchPreview(href);
  if (!preview) return;
  // The message may have changed meanwhile: only add it if it's still there, still has the link and no card.
  const row = await loadMessage(message.id);
  if (!row || row.deleted_at || previewTarget(row.body, row.attachments) !== href) return;
  const { data, error } = await db.from("messages")
    .update({ attachments: [...row.attachments, preview] })
    .eq("id", row.id).is("deleted_at", null).select("*").single();
  if (error || !data) return;
  const [updated] = await hydrate([toMessage(data as MessageRow)]);
  if (latest.get(updated.subgroupId)?.id === updated.id) latest.set(updated.subgroupId, updated);
  toChannel(updated.subgroupId).emit("message:update", updated);
}
