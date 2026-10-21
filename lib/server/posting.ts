// Posting a message: slow mode, the word filter, announcing it, and what follows.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { findBlockedWord } from "../chat/safety.ts";
import type { Attachment, Message, Subgroup } from "../chat/types";
import { accessOf, addMember, allowedIn, eitherBlocked, findGroup, mutedIn, roleIn, toChannel } from "./access.ts";
import { discoverChanged, hasEvent } from "./discover.ts";
import { mayAnnounce, refreshThread } from "./messages.ts";
import { notifyAbout } from "./notifications.ts";
import { attachPreview } from "./previews.ts";
import { saveReminders } from "./reminders.ts";
import { blockedWords, latest, members, type MessageRow } from "./state.ts";

// ---------------------------------------------------------------------------
// Slow mode and the word filter. Moderators (whoever can remove others'
// messages) and bots are exempt from both.
// ---------------------------------------------------------------------------

/** When each member last posted in each slow-mode channel ("channel:member" → ms). */
export const lastPostAt = new Map<string, number>();

// Forget posts older than the longest slow mode (they can't hold anyone back).
setInterval(() => {
  const cutoff = Date.now() - 3600 * 1000;
  for (const [key, at] of lastPostAt) if (at < cutoff) lastPostAt.delete(key);
}, 10 * 60 * 1000).unref();

export function exemptFromLimits(groupId: string, userId: string) {
  return members.get(userId)?.kind === "bot" || allowedIn(groupId, userId, "MESSAGE:MANAGE");
}

/** Why slow mode holds this message back, if it does. */
export function slowModeError(channel: Subgroup, userId: string) {
  if (!channel.slowMode || exemptFromLimits(channel.groupId, userId)) return undefined;
  const wait = (lastPostAt.get(`${channel.id}:${userId}`) ?? 0) + channel.slowMode * 1000 - Date.now();
  return wait > 0 ? `Slow mode is on here. You can post again in ${Math.ceil(wait / 1000)}s.` : undefined;
}

/**
 * Why `userId` can't post in the channel right now (undefined if they can):
 * muted, a one-on-one where either side blocked the other, top-level posts in
 * an announcement channel (`thread` replies are fine), untitled top-level
 * posts in a forum (`thread` is also true for a titled post, which starts
 * one), or slow mode (unless
 * `slow` is false: scheduling, and sending what was scheduled). Shared by
 * sending, forwarding and scheduled sends, so they follow the same rules.
 */
export async function postingError(channel: Subgroup, userId: string, thread = false, slow = true) {
  await accessOf(userId);
  const mutedUntil = mutedIn(channel.groupId, userId);
  if (mutedUntil) return `You're muted in this group until ${new Date(mutedUntil).toUTCString()}.`;
  const group = findGroup(channel.groupId);
  if (group?.kind === "dm" && (group.members?.length ?? 0) <= 2) {
    const other = group.members?.find((id) => id !== userId);
    if (other) {
      await accessOf(other);
      if (eitherBlocked(userId, other)) return "Your message couldn't be delivered.";
    }
  }
  if (!thread && channel.type === "announcement" && !mayAnnounce(channel.groupId, userId)) {
    return "Only the group's owner and admins can post here. Reply in a thread instead.";
  }
  if (!thread && channel.type === "forum") return "Posts in a forum need a title. Start a new post instead.";
  return slow ? slowModeError(channel, userId) : undefined;
}

/** A new message is saved: show it to everyone who can read the channel. */
export function announce(message: Message, channel: Subgroup) {
  if (!message.threadId) latest.set(channel.id, message);
  if (channel.slowMode) lastPostAt.set(`${channel.id}:${message.authorId}`, Date.now());
  toChannel(channel.id).emit("message:new", message);
}

/**
 * After announcing a new message: notifications, its link preview, event
 * reminders, its thread's summary, and joining a public group by posting in it.
 */
export async function afterPost(
  message: Message,
  channel: Subgroup,
  context: {
    replyTo: string | null;
    root: MessageRow | null;
    /** false: the sender removed its link's card while writing it. */
    preview?: boolean;
  },
) {
  notifyAbout(message, channel, context);
  if (context.preview !== false) {
    void attachPreview(message).catch((error) =>
      console.error("link preview failed:", error instanceof Error ? error.message : error),
    );
  }
  if (hasEvent(message.attachments)) discoverChanged();
  await saveReminders(message);
  // Posting in a public group joins it, so it can be moderated like any member (bots don't join).
  if (members.get(message.authorId)?.kind !== "bot" && !roleIn(channel.groupId, message.authorId)) {
    const joinError = await addMember(channel.groupId, message.authorId);
    if (joinError) console.error("auto-join failed:", joinError.message);
  }
  if (message.threadId) await refreshThread(message.threadId, channel.id);
}

/** Why a sticker in these attachments can't be sent in the group: it isn't in the group's pack (anymore). */
export function stickerError(groupId: string, attachments: readonly Attachment[]) {
  const pack = findGroup(groupId)?.stickers ?? [];
  const missing = attachments.some(
    (a) => a.type === "sticker" && !pack.some((sticker) => sticker.name === a.name && sticker.url === a.url),
  );
  return missing ? "That sticker isn't in this group's pack." : undefined;
}

/** Why the word filter rejects this text, if it does. */
export function filterError(groupId: string, userId: string, text: string) {
  const words = blockedWords.get(groupId);
  if (!words || exemptFromLimits(groupId, userId)) return undefined;
  const hit = findBlockedWord(text, words);
  return hit ? `Your message contains “${hit}”, which isn't allowed in this group.` : undefined;
}
