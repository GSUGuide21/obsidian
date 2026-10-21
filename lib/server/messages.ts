// Messages: from rows to what clients get, with reactions, votes and thread summaries.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Attachment, Message, QuizAnswer, Reaction, ThreadSummary, WikiPage } from "../chat/types";
import { isClosed } from "../chat/types/attachments.ts";
import { canPin } from "../chat/types/permissions.ts";
import { allowedIn, findGroup, roleIn, toChannel } from "./access.ts";
import { db } from "./db.ts";
import { channels, latest, members, type MessageRow } from "./state.ts";

export function toThreadSummary(row: MessageRow): ThreadSummary | undefined {
  if (!row.thread_count || !row.thread_last_at) return undefined;
  return {
    count: row.thread_count,
    lastAt: Date.parse(row.thread_last_at),
    participants: row.thread_participants ?? [],
  };
}

export function toMessage(row: MessageRow): Message {
  const thread = toThreadSummary(row);
  const base = {
    id: row.id,
    subgroupId: row.channel_id,
    // Empty once the author's account was deleted ("Unknown user").
    authorId: row.author_id ?? "",
    createdAt: Date.parse(row.created_at),
    ...(row.thread_id && { threadId: row.thread_id }),
    // A deleted root keeps its thread, so the replies stay reachable.
    ...(thread && { thread }),
  };
  if (row.deleted_at) {
    const byModerator = row.deleted_by && row.deleted_by !== row.author_id;
    return { ...base, text: "", deleted: true, ...(byModerator && { deletedBy: row.deleted_by! }) };
  }
  return {
    ...base,
    text: row.body,
    ...(row.title && { title: row.title }),
    ...(row.tags?.length && { tags: row.tags }),
    ...(row.system && { system: row.system }),
    ...(row.attachments?.length > 0 && { attachments: withoutAnswers(row.attachments) }),
    ...(row.edited_at && { editedAt: Date.parse(row.edited_at) }),
    ...(row.pinned_at && { pinned: { at: Date.parse(row.pinned_at), by: row.pinned_by ?? "" } }),
  };
}

/**
 * Attachments as clients get them: quizzes without their answer (the server
 * grades answers; see "quiz:answer") until they close, when everyone may see
 * it. Everything sent to clients goes through this.
 */
export function withoutAnswers(attachments: Attachment[], now = Date.now()): Attachment[] {
  if (!attachments.some((a) => a.type === "quiz")) return attachments;
  return attachments.map((a) => {
    if (a.type !== "quiz" || isClosed(a, now)) return a;
    return { type: "quiz", question: a.question, options: a.options, ...(a.closesAt && { closesAt: a.closesAt }) };
  });
}

/** Top-level messages in announcement channels, by rank or a custom role (app-wide admins count as group admins; bots post anywhere). */
export function mayAnnounce(groupId: string, userId: string) {
  return members.get(userId)?.kind === "bot" || allowedIn(groupId, userId, "MESSAGE:ANNOUNCE");
}

/** Pinning in the group (by rank or a custom role); in a direct message, anyone in it. */
export function mayPin(groupId: string, userId: string) {
  if (findGroup(groupId)?.kind === "dm") return canPin(roleIn(groupId, userId), true);
  return allowedIn(groupId, userId, "MESSAGE:PIN");
}

/**
 * Recount a thread after a reply was added or deleted, store the summary on
 * the root and broadcast it.
 */
export async function refreshThread(rootId: string, channelId: string) {
  const { data, count } = await db.from("messages")
    .select("author_id, created_at", { count: "exact" })
    .eq("thread_id", rootId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(50);
  const rows = data ?? [];
  const participants = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => Boolean(id)))].slice(0, 3);
  const lastAt = rows[0]?.created_at ?? null;
  const { data: root, error } = await db.from("messages")
    .update({ thread_count: count ?? 0, thread_last_at: lastAt, thread_participants: participants })
    .eq("id", rootId).select("*").single();
  if (error || !root) {
    console.error("thread summary update failed:", error?.message);
    return;
  }
  const thread = toThreadSummary(root as MessageRow);
  const previous = latest.get(channelId);
  if (previous?.id === rootId) {
    const updated = { ...previous };
    if (thread) updated.thread = thread;
    else delete updated.thread;
    latest.set(channelId, updated);
  }
  // In a forum the post itself goes along, so lists that hadn't loaded it can show it rising to the top.
  const post = channels.get(channelId)?.type === "forum" ? (await hydrate([toMessage(root as MessageRow)]))[0] : undefined;
  toChannel(channelId).emit("thread:summary", {
    subgroupId: channelId,
    messageId: rootId,
    ...(thread && { thread }),
    ...(post && { root: post }),
  });
}

export function toWikiPage(channelId: string, row: { body: string; version: number; updated_at: string; updated_by: string | null } | null): WikiPage {
  if (!row) return { subgroupId: channelId, body: "", version: 0 };
  return {
    subgroupId: channelId,
    body: row.body,
    version: row.version,
    updatedAt: Date.parse(row.updated_at),
    ...(row.updated_by && { updatedBy: row.updated_by }),
  };
}

export function hasPoll(message: Message) {
  return message.attachments?.some((a) => a.type === "poll") ?? false;
}

/** Group reaction rows into chips, in the order each emoji was first used. */
export function toReactions(rows: { emoji: string; member_id: string }[]): Reaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) byEmoji.set(row.emoji, [...(byEmoji.get(row.emoji) ?? []), row.member_id]);
  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

/** Member ids per option, for each poll in the message. */
export function toPollVotes(message: Message, rows: { poll_index: number; member_id: string; option_index: number }[]) {
  const votes: Record<string, string[][]> = {};
  message.attachments?.forEach((attachment, index) => {
    if (attachment.type === "poll") votes[index] = attachment.options.map(() => []);
  });
  for (const row of rows) votes[row.poll_index]?.[row.option_index]?.push(row.member_id);
  return votes;
}

export function hasQuiz(message: Pick<Message, "attachments">) {
  return message.attachments?.some((a) => a.type === "quiz") ?? false;
}

type QuizAnswerRow = { message_id: string; quiz_index: number; option_index: number; correct_index: number };

export function toQuizAnswer(row: Pick<QuizAnswerRow, "option_index" | "correct_index">): QuizAnswer {
  return { option: row.option_index, correct: row.correct_index };
}

/**
 * Attach reactions and poll votes to loaded messages, and, given who they're
 * for (`viewerId`), that member's answers to their quizzes.
 */
export async function hydrate(list: Message[], viewerId?: string): Promise<Message[]> {
  const ids = list.filter((m) => !m.deleted).map((m) => m.id);
  if (ids.length === 0) return list;
  const pollIds = list.filter(hasPoll).map((m) => m.id);
  const quizIds = viewerId ? list.filter((m) => !m.deleted && hasQuiz(m)).map((m) => m.id) : [];
  const [reactions, votes, answers] = await Promise.all([
    db.from("message_reactions").select("message_id, member_id, emoji").in("message_id", ids).order("created_at"),
    pollIds.length
      ? db.from("poll_votes").select("message_id, poll_index, member_id, option_index").in("message_id", pollIds)
      : Promise.resolve({ data: [] as { message_id: string; poll_index: number; member_id: string; option_index: number }[] }),
    quizIds.length
      ? db.from("quiz_answers").select("message_id, quiz_index, option_index, correct_index")
        .eq("member_id", viewerId!).in("message_id", quizIds)
      : Promise.resolve({ data: [] as QuizAnswerRow[] }),
  ]);
  return list.map((message) => {
    const mine = (reactions.data ?? []).filter((r) => r.message_id === message.id);
    const myVotes = (votes.data ?? []).filter((v) => v.message_id === message.id);
    const myAnswers = (answers.data ?? []).filter((a) => a.message_id === message.id);
    return {
      ...message,
      ...(mine.length > 0 && { reactions: toReactions(mine) }),
      ...(hasPoll(message) && { pollVotes: toPollVotes(message, myVotes) }),
      ...(myAnswers.length > 0 && {
        quizAnswers: Object.fromEntries(myAnswers.map((a) => [a.quiz_index, toQuizAnswer(a)])),
      }),
    };
  });
}

export async function loadMessage(id: string) {
  const { data } = await db.from("messages").select("*").eq("id", id).maybeSingle();
  return (data as MessageRow | null) ?? null;
}

// Emoji only: pictographs plus the joiners/variation selectors/skin tones that
// build compound emoji. Blocks arbitrary text being used as a "reaction".
export const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️)+$/u;

export const MAX_REACTIONS_PER_MESSAGE = 20;
