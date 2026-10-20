// The moderation log, removing messages, and reports.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type {
  ChannelSnapshot,
  Group,
  GroupSnapshot,
  MessageReport,
  MessageSnapshot,
  ModerationEntry,
  ModerationRecord,
  Subgroup,
} from "../chat/types";
import { mayActOn } from "../chat/types/permissions.ts";
import { accessOf, allowedIn, canAccess, findGroup, groupRoom, roleIn, standingIn, toChannel } from "./access.ts";
import { db } from "./db.ts";
import { discoverChanged, hasEvent } from "./discover.ts";
import { canReact } from "./limits.ts";
import { refreshThread, toMessage, withoutAnswers } from "./messages.ts";
import { io } from "./sockets.ts";
import { groups, latest, members, type ChatSocket, type MessageRow } from "./state.ts";
import { usersByIds } from "./users.ts";

// ---------------------------------------------------------------------------
// Moderation log: each moderation action, with who did it, to whom, and a
// snapshot of what it changed (see ModerationRecord). Written after the action
// succeeds; a failed write is logged here but doesn't undo the action.
// ---------------------------------------------------------------------------

/** Mirrors MODERATION_LOG_PAGE in lib/chat/types/moderation.ts. */
export const MODERATION_LOG_PAGE = 50;

export async function logModeration(groupId: string, actorId: string, targetId: string | null, record: ModerationRecord) {
  if (findGroup(groupId)?.kind === "dm") return; // nobody moderates direct messages
  const { action, ...snapshot } = record;
  const { error } = await db.from("moderation_log")
    .insert({ group_id: groupId, actor_id: actorId, target_id: targetId, action, snapshot });
  if (error) console.error("moderation log write failed:", error.message);
}

/** A message as it is now (before a moderator changes or removes it). */
export function snapshotOf(row: MessageRow): MessageSnapshot {
  return {
    id: row.id,
    subgroupId: row.channel_id,
    authorId: row.author_id ?? "",
    text: row.body,
    createdAt: Date.parse(row.created_at),
    ...(row.attachments?.length > 0 && { attachments: withoutAnswers(row.attachments) }),
    ...(row.system && { system: row.system }),
    ...(row.thread_id && { threadId: row.thread_id }),
  };
}

export function channelSnapshot(
  channel: Pick<Subgroup, "id" | "name" | "type" | "topic" | "category" | "slowMode">,
): ChannelSnapshot {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    ...(channel.topic && { topic: channel.topic }),
    ...(channel.category && { category: channel.category }),
    ...(channel.slowMode && { slowMode: channel.slowMode }),
  };
}

export function groupSnapshot(
  group: Pick<Group, "name" | "color" | "visibility" | "description">,
  words: string[] = [],
): GroupSnapshot {
  return {
    name: group.name,
    color: group.color,
    visibility: group.visibility ?? "public",
    ...(group.description && { description: group.description }),
    ...(words.length > 0 && { blockedWords: words }),
  };
}

/** Whether two snapshots differ (they're built field by field in the same order). */
export function changed(before: object, after: object) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export type ModerationRow = {
  id: number;
  group_id: string;
  actor_id: string | null;
  target_id: string | null;
  action: ModerationRecord["action"];
  snapshot: Record<string, unknown>;
  created_at: string;
};

export function toModerationEntry(row: ModerationRow): ModerationEntry {
  return {
    ...(row.snapshot as Omit<ModerationRecord, "action">),
    action: row.action,
    id: String(row.id),
    groupId: row.group_id,
    ...(row.actor_id && { actorId: row.actor_id }),
    ...(row.target_id && { targetId: row.target_id }),
    at: Date.parse(row.created_at),
  } as ModerationEntry;
}

/**
 * Moderators remove messages (and manage events) of members ranked below them,
 * and custom roles that grant it those of plain members (see mayActOn). The
 * author's standing needs their access loaded (they may be offline); authors
 * whose account was deleted count as plain members.
 */
export async function mayManageMessagesOf(groupId: string, userId: string, authorId: string | null) {
  if (authorId) await accessOf(authorId);
  const author = (authorId && standingIn(groupId, authorId)) || { role: "member" as const };
  return mayActOn(standingIn(groupId, userId), author, "MESSAGE:MANAGE");
}

export async function mayRemoveMessage(row: MessageRow, channel: Subgroup, userId: string) {
  return mayManageMessagesOf(channel.groupId, userId, row.author_id);
}

/**
 * Soft-delete a message (permission already checked): the row stays so
 * replies to it (and its thread) still resolve, but its content, reactions,
 * votes, pin and reminders are removed. Moderator removals are logged with
 * the message as it was. Resolves to an error message.
 */
export async function removeMessage(row: MessageRow, channel: Subgroup, userId: string, own: boolean) {
  const { data, error } = await db.from("messages")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      body: "",
      attachments: [],
      pinned_at: null,
      pinned_by: null,
    })
    .eq("id", row.id).is("deleted_at", null)
    .select("*").single();
  if (error || !data) {
    console.error("message delete failed:", error?.message);
    return "Couldn't delete the message. Try again.";
  }
  await Promise.all([
    db.from("message_reactions").delete().eq("message_id", row.id),
    db.from("poll_votes").delete().eq("message_id", row.id),
    db.from("event_reminders").delete().eq("message_id", row.id),
  ]);
  if (hasEvent(row.attachments)) discoverChanged();
  const message = toMessage(data as MessageRow);
  if (latest.get(message.subgroupId)?.id === row.id) latest.set(message.subgroupId, message);
  toChannel(message.subgroupId).emit("message:update", message);
  // `row` is still the message as it was, content and all.
  if (!own) await logModeration(channel.groupId, userId, row.author_id, { action: "message_remove", message: snapshotOf(row) });
  // Reports about it are settled: it's gone.
  if (!own) await settleReports(row.id, channel.groupId, userId, "removed");
  if (row.thread_id) await refreshThread(row.thread_id, row.channel_id);
  return undefined;
}

// ---------------------------------------------------------------------------
// Reports: members flag messages; whoever can remove others' messages in the
// group reviews them, and sees a live count of the open ones.
// ---------------------------------------------------------------------------

/** Mirrors MAX_REPORT_REASON_LENGTH in lib/chat/types/moderation.ts. */
export const MAX_REPORT_REASON_LENGTH = 500;

export async function openReportCount(groupId: string) {
  const { count } = await db.from("message_reports").select("id", { count: "exact", head: true })
    .eq("group_id", groupId).is("resolved_at", null);
  return count ?? 0;
}

/** Open reports per group, for the groups whose reports this member reviews. */
export async function reportCounts(userId: string) {
  const reviewed = groups.filter((g) => g.kind !== "dm" && allowedIn(g.id, userId, "MESSAGE:MANAGE"));
  const counts = await Promise.all(reviewed.map(async (g) => [g.id, await openReportCount(g.id)] as const));
  return Object.fromEntries(counts.filter(([, n]) => n > 0));
}

/** Tell the group's connected reviewers how many reports are open now. */
export async function publishReportCount(groupId: string) {
  const open = await openReportCount(groupId);
  for (const socket of io.sockets.sockets.values()) {
    const userId = socket.data.userId;
    if (userId && socket.rooms.has(groupRoom(groupId)) && allowedIn(groupId, userId, "MESSAGE:MANAGE")) {
      socket.emit("report:count", { groupId, open });
    }
  }
}

/** Close every open report about a message. */
export async function settleReports(messageId: string, groupId: string, userId: string, resolution: "dismissed" | "removed") {
  const { data, error } = await db.from("message_reports")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId, resolution })
    .eq("message_id", messageId).is("resolved_at", null).select("id");
  if (error) return console.error("settling reports failed:", error.message);
  if (data?.length) await publishReportCount(groupId);
}

export type ReportRow = {
  id: number;
  group_id: string;
  message_id: string;
  reporter_id: string | null;
  author_id: string | null;
  reason: string | null;
  snapshot: MessageSnapshot;
  created_at: string;
};

export function toReport(row: ReportRow): MessageReport {
  return {
    id: String(row.id),
    groupId: row.group_id,
    messageId: row.message_id,
    ...(row.reporter_id && { reporterId: row.reporter_id }),
    ...(row.author_id && { authorId: row.author_id }),
    ...(row.reason && { reason: row.reason }),
    message: row.snapshot,
    at: Date.parse(row.created_at),
  };
}

/** Validated (group, actor, target) for a moderation action on `payload.userId`, or an error. */
export async function moderation(socket: ChatSocket, payload: { groupId?: unknown; userId?: unknown } | undefined) {
  const userId = socket.data.userId;
  if (!userId) return "You're not signed in.";
  if (!canReact(userId)) return "Slow down a little and try again.";
  const group = findGroup(payload?.groupId);
  if (!group || !canAccess(group, userId)) return "That group no longer exists.";
  const targetId = typeof payload?.userId === "string" ? payload.userId : "";
  if (!targetId || targetId === userId) return "Pick someone else.";
  if (!members.has(targetId)) await usersByIds([targetId]);
  if (!members.has(targetId)) return "That person doesn't exist.";
  const targetAccess = await accessOf(targetId);
  return {
    userId,
    group,
    role: roleIn(group.id, userId) ?? "member",
    standing: standingIn(group.id, userId),
    targetId,
    targetAccess,
    targetRole: roleIn(group.id, targetId) ?? "member",
    targetStanding: standingIn(group.id, targetId) ?? { role: "member" as const },
    targetMembership: targetAccess.groups.get(group.id),
  };
}
