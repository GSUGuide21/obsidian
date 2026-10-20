// Notifications: in-app and web push, by each member's settings.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import "./env.ts";
import webpush from "web-push";
import type { Group, Message, NotificationLevel, NotifyReason, Subgroup } from "../chat/types";
import { accessByMember, canAccess, findGroup, loadAccess, noAccess, socketsOf } from "./access.ts";
import { db } from "./db.ts";
import { connections, members, type MessageRow } from "./state.ts";

// ---------------------------------------------------------------------------
// Notifications. After a message is posted, the people who'd want to hear
// about it get a "notify" event, filtered by their settings: those it
// mentions, the author of the message it replies to, a thread's root author
// and recent repliers, everyone else in a direct message, and members who set
// the channel to "all". Connected people get a "notify" event (the client
// shows it, quietly in Do not disturb); people with no tab open get a web push
// on the devices where they turned it on. Nobody hears about people they blocked.
// ---------------------------------------------------------------------------

// Web push needs VAPID keys and a contact subject (see .env.local); without them it's off.
export const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

export const vapidSubject = process.env.VAPID_SUBJECT;

export const pushEnabled = Boolean(vapidPublic && vapidPrivate && vapidSubject);
if (pushEnabled) webpush.setVapidDetails(vapidSubject!, vapidPublic!, vapidPrivate!);
else console.log("> Web push is off: set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to turn it on.");

/** "mentioned you in #general" etc., like the client's desktop notifications. */
export function pushTitle(reason: NotifyReason, author: string, where: string, oneOnOne: boolean) {
  switch (reason) {
    case "mention":
      return `${author} mentioned you in ${where}`;
    case "reply":
      return `${author} replied to you in ${where}`;
    case "thread":
      return `${author} replied in a thread in ${where}`;
    case "dm":
      return oneOnOne ? author : `${author} in ${where}`;
    default:
      return `${author} in ${where}`;
  }
}

/** A one-line summary of the message (pushes have no room for attachments). */
export function pushBody(message: Message) {
  if (message.text) return message.text.length > 200 ? `${message.text.slice(0, 199)}…` : message.text;
  for (const a of message.attachments ?? []) {
    switch (a.type) {
      case "image":
        return "Sent a photo";
      case "video":
        return "Sent a video";
      case "voice":
        return "Sent a voice message";
      case "audio":
      case "file":
        return "Sent a file";
      case "poll":
        return `Poll: ${a.question}`;
      case "quiz":
        return `Quiz: ${a.question}`;
      case "event":
        return `Event: ${a.title}`;
      case "link":
      case "external":
        return a.url;
    }
  }
  return "New message";
}

/** Push to everyone in `reasons` with no tab open (plus offline members who set the channel to "all"). */
export async function pushOffline(message: Message, channel: Subgroup, group: Group, reasons: Map<string, NotifyReason>) {
  if (!pushEnabled) return;
  const offline = new Map([...reasons].filter(([id]) => !connections.has(id)));
  const { data: allRows } = await db.from("notification_settings").select("member_id")
    .eq("level", "all").in("target_id", [channel.id, group.id]);
  for (const { member_id: id } of allRows ?? []) {
    if (id !== message.authorId && !connections.has(id) && !offline.has(id)) offline.set(id, "message");
  }

  const recipients = new Map<string, NotifyReason>();
  for (const [userId, reason] of offline) {
    // Not kept in the cache: they're not connected, and most of them won't be soon.
    const access = accessByMember.get(userId) ?? (await loadAccess(userId, false).catch(() => null));
    if (!access || !canAccess(group, userId, access) || access.blocked.has(message.authorId)) continue;
    // "all" only counts in groups they're in.
    if (reason === "message" && !access.groups.has(group.id)) continue;
    if (members.get(userId)?.presence === "dnd") continue;
    const level = levelFor(userId, channel, access);
    if (level === "none" || (level === "mentions" && (reason === "message" || reason === "dm"))) continue;
    recipients.set(userId, reason);
  }
  if (recipients.size === 0) return;

  const { data: subscriptions, error } = await db.from("push_subscriptions")
    .select("endpoint, member_id, p256dh, auth").in("member_id", [...recipients.keys()]);
  if (error) return console.error("push subscriptions query failed:", error.message);

  const author = members.get(message.authorId);
  const authorName = author?.name ?? "Someone";
  const icon = author?.avatar_url?.startsWith("https://") ? author.avatar_url : undefined;
  await Promise.all((subscriptions ?? []).map(async (sub) => {
    const reason = recipients.get(sub.member_id)!;
    const others = (group.members ?? []).filter((id) => id !== sub.member_id);
    const where = group.kind === "dm"
      ? others.map((id) => members.get(id)?.name ?? "someone").join(", ")
      : `#${channel.name} (${group.name})`;
    const payload = {
      title: pushTitle(reason, authorName, where, group.kind === "dm" && others.length <= 1),
      body: pushBody(message),
      tag: `message-${message.id}`,
      ...(icon && { icon }),
      open: { subgroupId: message.subgroupId, messageId: message.id, ...(message.threadId && { threadId: message.threadId }) },
    };
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
    } catch (pushError) {
      const status = (pushError as { statusCode?: number }).statusCode;
      // Gone for good (unsubscribed, or the browser data was cleared): forget it.
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      else console.error("push failed:", status ?? (pushError instanceof Error ? pushError.message : pushError));
    }
  }));
}

/** Their level for a channel: its own setting, else its group's, else the default. Mirrors notificationLevel in lib/chat/types/groups.ts. */
export function levelFor(userId: string, channel: Subgroup, access = accessByMember.get(userId) ?? noAccess): NotificationLevel {
  const settings = access.notifications;
  const fallback = findGroup(channel.groupId)?.kind === "dm" ? "all" : "mentions";
  return settings.get(channel.id) ?? settings.get(channel.groupId) ?? fallback;
}

export function notifyAbout(message: Message, channel: Subgroup, context: { replyTo: string | null; root: MessageRow | null }) {
  const group = findGroup(channel.groupId);
  if (!group || message.system) return;
  // The most specific reason wins.
  const reasons = new Map<string, NotifyReason>();
  const add = (userId: string | null | undefined, reason: NotifyReason) => {
    if (userId && !reasons.has(userId)) reasons.set(userId, reason);
  };
  for (const attachment of message.attachments ?? []) if (attachment.type === "mention") add(attachment.userId, "mention");
  add(context.replyTo, "reply");
  if (context.root) {
    add(context.root.author_id, "thread");
    for (const id of context.root.thread_participants ?? []) add(id, "thread");
  }
  if (group.kind === "dm") for (const id of group.members ?? []) add(id, "dm");
  for (const id of connections.keys()) {
    if (accessByMember.get(id)?.groups.has(group.id) && levelFor(id, channel) === "all") add(id, "message");
  }
  reasons.delete(message.authorId);

  for (const [userId, reason] of reasons) {
    if (!connections.has(userId) || !canAccess(group, userId)) continue;
    if (accessByMember.get(userId)?.blocked.has(message.authorId)) continue;
    const level = levelFor(userId, channel);
    // "mentions" keeps what's addressed to you (mentions, replies, your threads).
    if (level === "none" || (level === "mentions" && (reason === "message" || reason === "dm"))) continue;
    for (const socket of socketsOf(userId)) socket.emit("notify", { message, reason, groupId: group.id });
  }
  void pushOffline(message, channel, group, reasons).catch((error) =>
    console.error("push failed:", error instanceof Error ? error.message : error),
  );
}
