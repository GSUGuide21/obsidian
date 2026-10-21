import type { Message } from "./messages";

export type ImageAttachment = {
  type: "image";
  src?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  thumbnail?: boolean;
};

export type VideoAttachment = {
  type: "video";
  src?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  thumbnail?: boolean;
};

export type AudioAttachment = {
  type: "audio";
  src?: string;
  alt?: string;
  caption?: string;
};

export type VoiceAttachment = {
  type: "voice";
  src?: string;
  alt?: string;
  caption?: string;
};

export type FileAttachment = {
  type: "file";
  src?: string;
};

export type PollAttachment = {
  type: "poll";
  question: string;
  options: string[];
  /** Members can pick more than one of the options. */
  multiple?: true;
  /** Multiple-choice polls: at most this many choices each (2 up to one fewer than the options); absent for any number. */
  maxChoices?: number;
  /** When voting ends (ms); absent: never. */
  closesAt?: number;
};

/** Whether a poll or quiz has stopped taking votes or answers. */
export function isClosed(attachment: { closesAt?: number }, now = Date.now()) {
  return attachment.closesAt !== undefined && attachment.closesAt <= now;
}

export type QuizAttachment = {
  type: "quiz";
  question: string;
  options: string[];
  /**
   * The right option's text. Only sent by whoever posts the quiz: the server
   * keeps it to itself and tells each member once they've answered (see
   * Message.quizAnswers), so nobody can read it off the message.
   */
  correctAnswer?: string;
  /** When answering ends (ms), and the right answer is shown to everyone; absent: never. */
  closesAt?: number;
};

export type Mention = {
  type: "mention";
  userId: string;
};

export type Reply = {
  type: "reply";
  messageId: string;
};

/**
 * A link's preview card, made by the server (never accepted from clients). A
 * page's card has what it says about itself; a link straight to a file has
 * `media`; without either it's a plain card with the link's site and path.
 */
export type LinkPreview = {
  type: "link";
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  /** The site's name (og:site_name), shown instead of its domain. */
  siteName?: string;
  /** The site's icon. */
  icon?: string;
  /** The site's theme color ("#rrggbb"), for the card's edge. */
  color?: string;
  /** The page asks for its image to be shown big (twitter:card summary_large_image). */
  large?: boolean;
  /** A link straight to a file: shown inline (image, video, audio) or as a file. */
  media?: "image" | "video" | "audio" | "file";
  /** Files: their name, Content-Type and size (bytes), as the server that has it said. */
  fileName?: string;
  contentType?: string;
  size?: number;
};

export type EventAttachment = {
  type: "event";
  title: string;
  description?: string;
  startTime: number;
  endTime?: number;
  location?: string;
  allDay?: boolean;
  /** Member ids. */
  attendees?: string[];
  /** When to send reminders (ms). */
  reminders?: number[];
  /** Reminders go only to people who said they're going; absent: to everyone in the channel. */
  remindGoingOnly?: true;
  /** A link for the location, e.g. a map or a video call. */
  locationUrl?: string;
  /**
   * "public" lists it on the discover page (only if its group is public too).
   * Absent: only the group sees it.
   */
  visibility?: "public";
  /** Called off: it stays in the chat but sends no reminders and isn't listed. */
  cancelled?: true;
};

/** Whether the discover page lists the event (its group must be public as well). */
export function isListedEvent(event: Pick<EventAttachment, "visibility" | "cancelled">) {
  return event.visibility === "public" && !event.cancelled;
}

/**
 * When an event is over (ms): its end, else the end of its day (all-day) or
 * its start (mirrored by event_times in supabase/migrations).
 */
export function eventEnd(event: Pick<EventAttachment, "startTime" | "endTime" | "allDay">) {
  return event.endTime ?? (event.allDay ? event.startTime + 24 * 60 * 60 * 1000 : event.startTime);
}

export type ExternalMediaSites =
  | "youtube"
  | "facebook"
  | "instagram"
  | "twitter"
  | "vimeo"
  | "twitch";

export type ExternalAttachment = {
  type: "external";
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  site?: ExternalMediaSites;
};

/**
 * Marks a forwarded message: who wrote the original, and where. Only the
 * server adds it (clients can't send one).
 */
export type ForwardAttachment = {
  type: "forward";
  authorId: string;
  messageId: string;
  subgroupId: string;
  /** When the original was posted (ms). */
  at: number;
};

/**
 * A sticker from the group's pack (see Group.stickers), sent on its own and
 * shown big. The server only accepts ones in the pack of the chat it's sent in.
 */
export type StickerAttachment = { type: "sticker"; name: string; url: string };

/** A GIF from search (see "gif:search"), sent as an image attachment. */
export type GifResult = { id: string; url: string; preview: string; width: number; height: number; title: string };

export type Attachment =
  | ForwardAttachment
  | ImageAttachment
  | VideoAttachment
  | AudioAttachment
  | FileAttachment
  | VoiceAttachment
  | PollAttachment
  | QuizAttachment
  | Mention
  | Reply
  | LinkPreview
  | EventAttachment
  | ExternalAttachment
  | StickerAttachment;

/** A due reminder for an event attachment. */
export type EventReminder = {
  subgroupId: string;
  messageId: string;
  title: string;
  startTime: number;
  allDay?: boolean;
};

/** What a group's browse panel lists: messages with events, polls, quizzes, images and videos, files, or voice messages. */
export type CollectionKind = "events" | "polls" | "quizzes" | "media" | "files" | "voice";

/** The attachment types each collection is made of (mirrored in server.mts). */
export const COLLECTION_TYPES: Record<CollectionKind, Attachment["type"][]> = {
  events: ["event"],
  polls: ["poll"],
  quizzes: ["quiz"],
  media: ["image", "video"],
  // Voice messages are conversation rather than files, so they get their own list.
  files: ["file", "audio"],
  voice: ["voice"],
};

/** The browse lists a message belongs to, by its attachments. */
export function collectionsOf(message: Pick<Message, "attachments">): CollectionKind[] {
  const types = new Set(message.attachments?.map((a) => a.type));
  return (Object.keys(COLLECTION_TYPES) as CollectionKind[]).filter((kind) =>
    COLLECTION_TYPES[kind].some((type) => types.has(type)),
  );
}

export const MAX_ATTACHMENTS = 20;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Upload types the browser may render inline. Everything else (e.g. HTML)
 * is served as a download. SVG can contain script, so uploads are also
 * served with a sandboxing Content-Security-Policy (see the uploads route).
 */
export const INLINE_UPLOAD_TYPES: Record<string, "image" | "video" | "audio"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/avif": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/ogg": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/aac": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/webm": "audio",
  "audio/flac": "audio",
};

/** Response from POST /api/uploads. */
export type UploadResult = { url: string; name: string; size: number; type: string };
