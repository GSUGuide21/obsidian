// Checking what clients send: attachments, names, short texts, times.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { randomUUID } from "node:crypto";
import type { Attachment, ExternalMediaSites, ForumTag, PollAttachment, QuizAttachment } from "../chat/types";
import { isEmojiName } from "../chat/types/groups.ts";
import { ID_PATTERN, MAX_FORUM_TAGS, MAX_NAME_LENGTH, MAX_POST_TAGS, MAX_TAG_NAME_LENGTH } from "./constants.ts";
import { members } from "./state.ts";

// ---------------------------------------------------------------------------
// Attachment validation. Clients can send anything, so each attachment is
// rebuilt field by field; unknown fields are dropped and bad ones rejected.
// ---------------------------------------------------------------------------

export const MAX_ATTACHMENTS = 20;

export const SITES = new Set(["youtube", "facebook", "instagram", "twitter", "vimeo", "twitch"]);

export function text(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

export function url(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function dimension(value: unknown) {
  const n = num(value);
  return n && n > 0 && n <= 20000 ? Math.round(n) : undefined;
}

export function options(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) return undefined;
  const list = value.map((option) => text(option, 100));
  if (list.some((option) => !option)) return undefined;
  return new Set(list).size === list.length ? (list as string[]) : undefined;
}

/** When a poll or quiz closes: undefined when it doesn't, null when it isn't a future time. */
function closesAt(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return futureTime(value) ?? null;
}

/** Drop undefined keys so stored messages stay small. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function sanitizeAttachment(value: unknown): Attachment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const a = value as Record<string, unknown>;
  switch (a.type) {
    case "image":
    case "video": {
      const src = url(a.src);
      if (!src) return undefined;
      return compact({
        type: a.type,
        src,
        alt: text(a.alt, 300),
        caption: text(a.caption, 300),
        width: dimension(a.width),
        height: dimension(a.height),
        thumbnail: a.thumbnail === true ? true : undefined,
      });
    }
    case "audio":
    case "voice": {
      const src = url(a.src);
      if (!src) return undefined;
      return compact({ type: a.type, src, alt: text(a.alt, 300), caption: text(a.caption, 300) });
    }
    case "file": {
      const src = url(a.src);
      return src ? { type: "file", src } : undefined;
    }
    case "poll": {
      const question = text(a.question, 300);
      const list = options(a.options);
      const closes = closesAt(a.closesAt);
      if (!question || !list || closes === null) return undefined;
      const multiple = a.multiple === true;
      // A limit only means something between "two" and "all but one".
      const wanted = Number.isInteger(a.maxChoices) ? (a.maxChoices as number) : 0;
      const max = multiple && wanted >= 2 && wanted < list.length ? wanted : undefined;
      return compact<PollAttachment>({
        type: "poll",
        question,
        options: list,
        ...(multiple && { multiple: true as const }),
        maxChoices: max,
        closesAt: closes,
      });
    }
    case "quiz": {
      const question = text(a.question, 300);
      const list = options(a.options);
      const correctAnswer = text(a.correctAnswer, 100);
      const closes = closesAt(a.closesAt);
      if (!question || !list || !correctAnswer || !list.includes(correctAnswer) || closes === null) return undefined;
      return compact<QuizAttachment>({ type: "quiz", question, options: list, correctAnswer, closesAt: closes });
    }
    case "mention": {
      const userId = typeof a.userId === "string" ? a.userId : "";
      return members.has(userId) ? { type: "mention", userId } : undefined;
    }
    case "reply": {
      const messageId = typeof a.messageId === "string" ? a.messageId : "";
      return ID_PATTERN.test(messageId) ? { type: "reply", messageId } : undefined;
    }
    // Only its shape: stickerError (posting.ts) checks it's in the pack of the chat it's sent in.
    case "sticker": {
      const name = typeof a.name === "string" ? a.name : "";
      const src = url(a.url);
      return isEmojiName(name) && src ? { type: "sticker", name, url: src } : undefined;
    }
    // No "link": link cards are made by the server (see previews.ts), never accepted.
    case "external": {
      const link = url(a.url);
      if (!link) return undefined;
      return compact({
        type: "external" as const,
        url: link,
        title: text(a.title, 200),
        description: text(a.description, 500),
        thumbnail: url(a.thumbnail),
        site: typeof a.site === "string" && SITES.has(a.site) ? (a.site as ExternalMediaSites) : undefined,
      });
    }
    case "event": {
      const title = text(a.title, 200);
      const startTime = num(a.startTime);
      const endTime = num(a.endTime);
      if (!title || startTime === undefined) return undefined;
      if (endTime !== undefined && endTime < startTime) return undefined;
      const attendees = Array.isArray(a.attendees)
        ? a.attendees.filter((id): id is string => typeof id === "string" && members.has(id)).slice(0, 100)
        : undefined;
      const reminders = Array.isArray(a.reminders)
        ? a.reminders.map(num).filter((n): n is number => n !== undefined).slice(0, 10)
        : undefined;
      return compact({
        type: "event" as const,
        title,
        description: text(a.description, 1000),
        startTime,
        endTime,
        location: text(a.location, 200),
        allDay: a.allDay === true ? true : undefined,
        attendees: attendees?.length ? attendees : undefined,
        reminders: reminders?.length ? reminders : undefined,
        locationUrl: url(a.locationUrl),
        visibility: a.visibility === "public" ? ("public" as const) : undefined,
        cancelled: a.cancelled === true ? (true as const) : undefined,
        remindGoingOnly: a.remindGoingOnly === true ? (true as const) : undefined,
      });
    }
  }
  return undefined;
}

/** Returns the cleaned list, or an error message when anything is invalid. */
export function sanitizeAttachments(value: unknown): Attachment[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return "Attachments are malformed.";
  if (value.length > MAX_ATTACHMENTS) return `Messages can have at most ${MAX_ATTACHMENTS} attachments.`;
  const cleaned: Attachment[] = [];
  for (const item of value) {
    // Link cards are the server's to make (see previews.ts): one from a client
    // could claim any title or image for any link, so it's left out.
    if ((item as { type?: unknown } | null)?.type === "link") continue;
    const attachment = sanitizeAttachment(item);
    if (!attachment) return "One of the attachments is invalid.";
    cleaned.push(attachment);
  }
  if (cleaned.filter((a) => a.type === "reply").length > 1) return "A message can only reply to one message.";
  // A sticker is the whole message (a reply aside): it's shown big, on its own.
  if (cleaned.some((a) => a.type === "sticker") && cleaned.some((a) => a.type !== "sticker" && a.type !== "reply")) {
    return "Stickers are sent on their own.";
  }
  if (cleaned.filter((a) => a.type === "sticker").length > 1) return "Send one sticker at a time.";
  return cleaned;
}

export function cleanName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  return name.length <= MAX_NAME_LENGTH ? name : "";
}

/** A forum post's title, on one line; "" if absent or blank (callers check the length). Mirrors cleanTitle in lib/chat/types/messages.ts. */
export function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * A forum's tags from a channel draft, in order: names cleaned, kept ids kept
 * (only ones it already had), new ones given an id. A string says what's wrong.
 */
export function cleanForumTags(value: unknown, previous: ForumTag[] = []): ForumTag[] | string {
  if (!Array.isArray(value)) return "Tags must be a list.";
  if (value.length > MAX_FORUM_TAGS) return `A forum can have up to ${MAX_FORUM_TAGS} tags.`;
  const known = new Set(previous.map((tag) => tag.id));
  const tags: ForumTag[] = [];
  const names = new Set<string>();
  for (const raw of value) {
    const draft = (raw ?? {}) as { id?: unknown; name?: unknown };
    const name = typeof draft.name === "string" ? draft.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return "Tags need a name.";
    if (name.length > MAX_TAG_NAME_LENGTH) return `Tag names are limited to ${MAX_TAG_NAME_LENGTH} characters.`;
    if (names.has(name.toLowerCase())) return `There's already a tag called “${name}”.`;
    names.add(name.toLowerCase());
    const id = typeof draft.id === "string" && known.has(draft.id) ? draft.id : randomUUID().replace(/-/g, "").slice(0, 10);
    tags.push({ id, name });
  }
  return tags;
}

/** A post's tags: the forum's own tag ids among `value`, once each, at most MAX_POST_TAGS; null when none. */
export function postTags(value: unknown, forum: ForumTag[] = []): string[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set(forum.map((tag) => tag.id));
  const tags = [...new Set(value.filter((id): id is string => typeof id === "string" && known.has(id)))];
  return tags.length ? tags.slice(0, MAX_POST_TAGS) : null;
}

/** A future time (ms) no more than ~10 years out, or undefined. */
export function futureTime(value: unknown) {
  const n = num(value);
  return n !== undefined && n > Date.now() && n < Date.now() + 10 * 365 * 24 * 3600 * 1000 ? n : undefined;
}

/** Mirrors cleanChannelName in lib/chat/types/groups.ts. */
export function cleanChannelName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/-{2,}/g, "-").replace(/ {2,}/g, " ").trim().slice(0, 64).trim();
}

/** Optional short text: undefined if absent or blank, null if too long. */
export function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : null;
}

/** A readable, unique-enough id: "design-k3x9q2" (ids must match the tables' checks). */
export function newId(name: string, max: number, fallback: string) {
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, max - 7).replace(/-+$/, "") || fallback;
  return `${slug}-${randomUUID().replace(/-/g, "").slice(0, 6)}`;
}
