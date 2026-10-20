import type { Attachment, Message, SystemEvent, User } from "./types";

/** Display name for a message author, even if we no longer know who they were. */
export function authorName(user: User | undefined, userId: string) {
  return user?.name ?? (userId.startsWith("guest-") ? "Former guest" : "Unknown user");
}

const DAY = 24 * 60 * 60 * 1000;

const attachmentNames: Partial<Record<Attachment["type"], string>> = {
  image: "Photo",
  video: "Video",
  audio: "Audio",
  voice: "Voice message",
  file: "File",
  poll: "Poll",
  quiz: "Quiz",
  event: "Event",
  link: "Link",
  external: "Link",
};

/** One-line summary of a message for previews and reply quotes. */
/**
 * What a system message says, after its author's name: "pinned a message".
 * `nameOf` names the member it's about (kicks and bans); without it they're "a member".
 */
export function systemText(event: SystemEvent, nameOf?: (memberId: string) => string) {
  switch (event.type) {
    case "member_kick":
      return `removed ${nameOf?.(event.memberId) ?? "a member"} from the group`;
    case "member_ban":
      return `banned ${nameOf?.(event.memberId) ?? "a member"} from the group`;
    case "member_role": {
      const who = nameOf?.(event.memberId) ?? "a member";
      switch (event.role) {
        case "owner":
          return `transferred ownership to ${who}`;
        case "admin":
          return `made ${who} an admin`;
        case "moderator":
          return `made ${who} a moderator`;
        case "member":
          return `made ${who} a regular member`;
      }
    }
    case "member_join":
      return "joined the group";
    case "member_leave":
      return "left the group";
    case "message_pin":
      return "pinned a message";
    case "channel_create":
      return "created this channel";
    case "channel_rename":
      return `renamed the channel from #${event.from} to #${event.to}`;
    case "channel_topic":
      return event.topic ? `changed the topic to “${event.topic}”` : "cleared the topic";
  }
}

export function summarize(message: Pick<Message, "text" | "attachments" | "system" | "deleted">) {
  if (message.system) return systemText(message.system);
  if (message.deleted) return "Message deleted";
  if (message.text) return message.text;
  for (const attachment of message.attachments ?? []) {
    if (attachment.type === "poll" || attachment.type === "quiz") {
      return `${attachmentNames[attachment.type]}: ${attachment.question}`;
    }
    if (attachment.type === "event") return `Event: ${attachment.title}`;
    const name = attachmentNames[attachment.type];
    if (name) return name;
  }
  return "";
}

/** `hour12` for the chosen clock ("auto": the locale's own). */
let hour12: boolean | undefined;
let timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
let dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Show times on a 12- or 24-hour clock, or as the locale does ("auto"). Set from the appearance settings. */
export function setClock(clock: "auto" | "12h" | "24h") {
  const next = clock === "auto" ? undefined : clock === "12h";
  if (next === hour12) return;
  hour12 = next;
  timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12 });
  dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", hour12 });
}

/** A full date and time, e.g. "Oct 20, 2026, 3:42 PM" (titles, mutes, bans, expiries). */
export function formatDateTime(timestamp: number) {
  return dateTimeFormat.format(timestamp);
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const shortFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const longFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function daysAgo(timestamp: number) {
  return Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / DAY);
}

export function formatTime(timestamp: number) {
  return timeFormat.format(timestamp);
}

/** Compact timestamp for list previews: "3:42 PM", "Mon", "Oct 3". */
export function formatPreviewTime(timestamp: number) {
  const days = daysAgo(timestamp);
  if (days === 0) return timeFormat.format(timestamp);
  if (days < 7) return weekdayFormat.format(timestamp);
  return shortFormat.format(timestamp);
}

/** "just now", "5m ago", "3h ago", then the preview format ("Mon", "Oct 3"). */
export function formatRelative(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (daysAgo(timestamp) === 0) return `${Math.floor(elapsed / (60 * 60_000))}h ago`;
  return formatPreviewTime(timestamp);
}

/** Day divider label: "Today", "Yesterday", or a full date. */
export function formatDay(timestamp: number) {
  const days = daysAgo(timestamp);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return longFormat.format(timestamp);
}

export function isSameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

const eventDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Thu, Oct 16 · 3:00 PM – 4:00 PM", "Thu, Oct 16 · All day", or a multi-day range. */
export function formatEventWhen(start: number, end?: number, allDay?: boolean) {
  const date = eventDateFormat.format(start);
  if (allDay) {
    return end && !isSameDay(start, end)
      ? `${date} – ${eventDateFormat.format(end)} · All day`
      : `${date} · All day`;
  }
  if (!end) return `${date} · ${formatTime(start)}`;
  if (isSameDay(start, end)) return `${date} · ${formatTime(start)} – ${formatTime(end)}`;
  return `${date}, ${formatTime(start)} – ${eventDateFormat.format(end)}, ${formatTime(end)}`;
}

/** Media position as "m:ss". */
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A file size: "820 B", "14 KB", "2.3 MB", "1.1 GB". */
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}
