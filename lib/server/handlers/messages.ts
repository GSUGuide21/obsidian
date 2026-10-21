// Messages: history, sending (and slash commands), editing (and edit history), deleting, threads, search, pins, reactions, polls, quizzes, read state, RSVPs, forwarding, scheduling and GIFs.

import { randomUUID } from "node:crypto";
import { attachmentText } from "../../chat/safety.ts";
import type { Attachment } from "../../chat/types";
import { isClosed } from "../../chat/types/attachments.ts";
import { SEARCH_HAS } from "../../chat/types/messages.ts";
import { customEmojiName } from "../../chat/types/groups.ts";
import {
  accessByMember,
  canAccess,
  channelFor,
  findGroup,
  listedGroups,
  mutedIn,
  toChannel,
  visibleChannels,
} from "../access.ts";
import { canCommand, invocationFor, postAnswer, runInvocation, type CommandOutcome } from "../bots.ts";
import {
  COLLECTION_PAGE,
  COLLECTION_TYPES,
  FORUM_PAGE,
  HISTORY_PAGE,
  ID_PATTERN,
  MAX_EDIT_HISTORY,
  MAX_MESSAGE_LENGTH,
  MAX_PINS_PER_CHANNEL,
  MAX_TITLE_LENGTH,
  MIN_SEARCH_LENGTH,
  SEARCH_PAGE,
  THREAD_PAGE,
} from "../constants.ts";
import { db } from "../db.ts";
import { discoverChanged } from "../discover.ts";
import { canSearchGifs, searchGifs, tenorKey } from "../gifs.ts";
import { canMark, canReact, canRead, canSend } from "../limits.ts";
import {
  EMOJI,
  hydrate,
  loadMessage,
  MAX_REACTIONS_PER_MESSAGE,
  mayPin,
  toMessage,
  toPollVotes,
  toQuizAnswer,
  toReactions,
} from "../messages.ts";
import { logModeration, mayManageMessagesOf, mayRemoveMessage, removeMessage, snapshotOf } from "../moderation.ts";
import { afterPost, announce, filterError, postingError, stickerError } from "../posting.ts";
import { canPreview, previewFor } from "../previews.ts";
import { saveReminders } from "../reminders.ts";
import { forumFilter, likePattern, parseForumCursor, searchWords } from "../search.ts";
import { MAX_SCHEDULE_AHEAD, MAX_SCHEDULED, toScheduled, type ScheduledRow } from "../scheduled.ts";
import { emptyPage, io } from "../sockets.ts";
import { channels, latest, members, sharesReads, type ChatSocket, type MessageRow } from "../state.ts";
import { postSystem } from "../system.ts";
import { usersByIds, usersFor } from "../users.ts";
import { cleanTitle, compact, postTags, MAX_ATTACHMENTS, num, sanitizeAttachment, sanitizeAttachments } from "../validation.ts";

export function registerMessagesHandlers(socket: ChatSocket) {
  socket.on("history", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    if (!channelFor(channelId, socket.data.userId) || !canRead(socket.id)) return ack(emptyPage);

    let query = db.from("messages").select("*").eq("channel_id", channelId).is("thread_id", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(HISTORY_PAGE + 1);

    // Keyset pagination: everything strictly older than the `before` message.
    // Its exact timestamp comes from the database (microseconds; JS dates
    // would round them and skip or repeat messages).
    const before = typeof payload.before === "string" && ID_PATTERN.test(payload.before) ? payload.before : null;
    if (before) {
      const { data: cursor } = await db.from("messages").select("id, created_at")
        .eq("id", before).eq("channel_id", channelId).maybeSingle();
      if (!cursor) return ack(emptyPage);
      const at = `"${cursor.created_at}"`;
      query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("history query failed:", error.message);
      return ack(emptyPage);
    }
    const rows = data as MessageRow[];
    const page = await hydrate(rows.slice(0, HISTORY_PAGE).reverse().map(toMessage), socket.data.userId);
    ack({ messages: page, users: await usersFor(page), hasMore: rows.length > HISTORY_PAGE });
  });

  socket.on("forum:posts", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const empty = { messages: [], users: [], hasMore: false };
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    if (channelFor(channelId, socket.data.userId)?.type !== "forum" || !canRead(socket.id)) return ack(empty);

    // Newest first by activity (active_at: posted, or its latest reply) or posting time; ids break ties.
    const column = payload.sort === "newest" ? "created_at" : "active_at";
    let query = db.from("messages").select("*").eq("channel_id", channelId).is("thread_id", null).is("system", null)
      .order(column, { ascending: false }).order("id", { ascending: false })
      .limit(FORUM_PAGE + 1);
    if (typeof payload.tag === "string" && payload.tag.length <= 32) query = query.contains("tags", [payload.tag]);
    // Every word in the title or the text, and keyset pagination past the previous page, as one filter.
    const text = typeof payload.query === "string" ? payload.query.trim().slice(0, 200) : "";
    const filter = forumFilter(column, searchWords(text), parseForumCursor(payload.cursor));
    if (filter) query = query.or(filter);

    const { data, error } = await query;
    if (error) {
      console.error("forum query failed:", error.message);
      return ack(empty);
    }
    const rows = data as MessageRow[];
    const shown = rows.slice(0, FORUM_PAGE);
    const last = shown.at(-1);
    const page = await hydrate(shown.map(toMessage), socket.data.userId);
    ack({
      messages: page,
      users: await usersFor(page),
      hasMore: rows.length > FORUM_PAGE,
      ...(last && { cursor: `${last[column]}|${last.id}`, boundary: Date.parse(last[column]) }),
    });
  });

  socket.on("messages:lookup", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    if (!channelFor(channelId, socket.data.userId) || !Array.isArray(payload.ids) || !canRead(socket.id)) {
      return ack({ messages: [], users: [] });
    }
    const ids = payload.ids.filter((id) => typeof id === "string" && ID_PATTERN.test(id)).slice(0, 50);
    if (ids.length === 0) return ack({ messages: [], users: [] });
    const { data } = await db.from("messages").select("*").eq("channel_id", channelId).in("id", ids);
    const found = await hydrate(((data ?? []) as MessageRow[]).map(toMessage), socket.data.userId);
    ack({ messages: found, users: await usersFor(found) });
  });

  socket.on("message:send", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) {
      return ack({ ok: false, error: "You're sending messages too quickly. Wait a moment and retry." });
    }

    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    const channel = channelFor(channelId, userId);
    if (!channel) return ack({ ok: false, error: "That channel doesn't exist." });

    // Thread replies: the root must be a live, top-level message in this channel.
    const threadId =
      typeof payload.threadId === "string" && ID_PATTERN.test(payload.threadId) ? payload.threadId : null;
    // A forum's top-level messages are posts, each with a title and maybe tags (ignored anywhere else).
    const posting = channel.type === "forum" && !threadId;
    const title = posting ? cleanTitle(payload.title) : "";
    const tags = posting ? postTags(payload.tags, channel.tags) : null;
    if (posting && !title) return ack({ ok: false, error: "Give your post a title." });
    if (title.length > MAX_TITLE_LENGTH) {
      return ack({ ok: false, error: `Titles are limited to ${MAX_TITLE_LENGTH} characters.` });
    }
    const held = await postingError(channel, userId, Boolean(threadId || title));
    if (held) return ack({ ok: false, error: held });
    let root: MessageRow | null = null;
    if (threadId) {
      root = await loadMessage(threadId);
      if (!root || root.channel_id !== channelId || root.thread_id) {
        return ack({ ok: false, error: "That thread no longer exists." });
      }
    }

    const body = typeof payload.text === "string" ? payload.text.trim() : "";
    if (body.length > MAX_MESSAGE_LENGTH) {
      return ack({ ok: false, error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` });
    }
    const attachments = sanitizeAttachments(payload.attachments);
    if (typeof attachments === "string") return ack({ ok: false, error: attachments });
    // The word filter reads what's written in titles, polls, events and captions too.
    const filtered = filterError(channel.groupId, userId, `${title}\n${body}\n${attachmentText(attachments)}`) ??
      stickerError(channel.groupId, attachments);
    if (filtered) return ack({ ok: false, error: filtered });
    // Mentions and replies decorate a message; they can't be the whole message.
    if (!body && !attachments.some((a) => a.type !== "mention" && a.type !== "reply")) {
      return ack({ ok: false, error: "Messages can't be empty." });
    }
    // Replies must point at a real message in the same channel.
    const reply = attachments.find((a) => a.type === "reply");
    let replyTo: string | null = null;
    if (reply) {
      const { data: target } = await db.from("messages").select("id, author_id")
        .eq("id", reply.messageId).eq("channel_id", channelId).maybeSingle();
      if (!target) return ack({ ok: false, error: "The message you're replying to no longer exists." });
      replyTo = target.author_id;
    }

    // Accept the client's id so retries are idempotent, but never let one
    // user's id collide with another user's message.
    let id = typeof payload.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : randomUUID();

    // A slash command runs before its message is posted: if it refuses, nothing is.
    const invocation = invocationFor(channel, body);
    let answer: CommandOutcome | undefined;
    if (invocation) {
      // A retry of a command whose message did save: don't run it again.
      const { data: existing } = await db.from("messages").select("*").eq("id", id).maybeSingle();
      const saved = existing as MessageRow | null;
      if (saved?.author_id === userId && saved.channel_id === channelId) return ack({ ok: true, message: toMessage(saved) });
      if (saved) id = randomUUID();
      if (!canCommand(userId)) return ack({ ok: false, error: "You're running commands too quickly. Wait a moment." });
      answer = await runInvocation(invocation, {
        user: { id: userId, name: members.get(userId)?.name ?? "Unknown user" },
        channel: { id: channel.id, name: channel.name },
        group: { id: channel.groupId, name: findGroup(channel.groupId)?.name ?? "" },
      }, id, threadId);
      if (!answer.ok) return ack({ ok: false, error: answer.error });
    }

    const insert = () =>
      db.from("messages")
        .insert({ id, channel_id: channelId, author_id: userId, body, attachments, thread_id: threadId, title: title || null, tags })
        .select("*").single();
    let { data, error } = await insert();
    if (error?.code === "23505") {
      const { data: existing } = await db.from("messages").select("*").eq("id", id).maybeSingle();
      const row = existing as MessageRow | null;
      if (row && row.author_id === userId && row.channel_id === channelId) {
        return ack({ ok: true, message: toMessage(row) }); // a retry of a message that did save
      }
      id = randomUUID();
      ({ data, error } = await insert());
    }
    if (error || !data) {
      console.error("message insert failed:", error?.message);
      return ack({ ok: false, error: "Couldn't save your message. Try again." });
    }

    const message = toMessage(data as MessageRow);
    announce(message, channel);
    ack({ ok: true, message });
    if (answer?.ok && answer.text) await postAnswer(answer.authorId, answer.text, channel, message, root);
    await afterPost(message, channel, { replyTo, root, preview: payload.preview !== false });
  });

  socket.on("message:edit", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "You're editing too quickly. Wait a moment." });

    const id = typeof payload?.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : "";
    const body = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (body.length > MAX_MESSAGE_LENGTH) {
      return ack({ ok: false, error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` });
    }
    const row = id ? await loadMessage(id) : null;
    const channel = row && channelFor(row.channel_id, userId);
    if (!row || row.deleted_at || !channel) return ack({ ok: false, error: "That message no longer exists." });
    if (row.author_id !== userId) return ack({ ok: false, error: "You can only edit your own messages." });
    if (row.system) return ack({ ok: false, error: "System messages can't be edited." });
    if (mutedIn(channel.groupId, userId)) return ack({ ok: false, error: "You can't edit messages while you're muted." });
    const hasContent = (row.attachments ?? []).some((a) => a.type !== "mention" && a.type !== "reply");
    if (!body && !hasContent) return ack({ ok: false, error: "A message can't be empty. Delete it instead." });
    // Forum posts can be renamed; a title given for anything else is ignored.
    const title = row.title && payload.title !== undefined ? cleanTitle(payload.title) : row.title;
    if (row.title && !title) return ack({ ok: false, error: "Posts need a title." });
    if (title && title.length > MAX_TITLE_LENGTH) {
      return ack({ ok: false, error: `Titles are limited to ${MAX_TITLE_LENGTH} characters.` });
    }
    // Posts can be retagged too (any top-level message in a forum is listed as one).
    const isPost = channel.type === "forum" && !row.thread_id;
    const tags = isPost && payload.tags !== undefined ? postTags(payload.tags, channel.tags) : row.tags;
    const retagged = (tags ?? []).join() !== (row.tags ?? []).join();
    const filtered = (body !== row.body ? filterError(channel.groupId, userId, body) : undefined) ??
      (title !== row.title ? filterError(channel.groupId, userId, title ?? "") : undefined);
    if (filtered) return ack({ ok: false, error: filtered });

    // A rename or retag alone isn't an edit of the text: it keeps no earlier version and no "edited" mark.
    if ((title !== row.title || retagged) && body === row.body) {
      const { data, error } = await db.from("messages")
        .update({ title, tags }).eq("id", id).eq("author_id", userId).is("deleted_at", null)
        .select("*").single();
      if (error || !data) {
        console.error("post update failed:", error?.message);
        return ack({ ok: false, error: "Couldn't update your post. Try again." });
      }
      Object.assign(row, data);
    } else if (body !== row.body) {
      // Keep the text it's replacing, with when that was written, for "message:history".
      const { data: kept, error: historyError } = await db.from("message_edits")
        .insert({ message_id: id, body: row.body, written_at: row.edited_at ?? row.created_at })
        .select("id").single();
      if (historyError || !kept) {
        console.error("saving edit history failed:", historyError?.message);
        return ack({ ok: false, error: "Couldn't save your edit. Try again." });
      }
      const { data, error } = await db.from("messages")
        .update({ body, title, tags, edited_at: new Date().toISOString() })
        .eq("id", id).eq("author_id", userId).is("deleted_at", null)
        .select("*").single();
      if (error || !data) {
        console.error("message edit failed:", error?.message);
        // The text wasn't replaced after all: it isn't an earlier version.
        await db.from("message_edits").delete().eq("id", kept.id);
        return ack({ ok: false, error: "Couldn't save your edit. Try again." });
      }
      Object.assign(row, data);
    }
    const [message] = await hydrate([toMessage(row)]);
    if (latest.get(message.subgroupId)?.id === id) latest.set(message.subgroupId, message);
    toChannel(message.subgroupId).emit("message:update", message);
    ack({ ok: true, message });
  });

  socket.on("message:history", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const id = typeof payload?.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : "";
    if (!id || !canRead(socket.id)) return ack(null);
    const row = await loadMessage(id);
    if (!row || row.deleted_at || !channelFor(row.channel_id, socket.data.userId)) return ack(null);
    if (!row.edited_at) return ack([{ text: row.body, at: Date.parse(row.created_at) }]);
    const { data, error } = await db.from("message_edits").select("body, written_at")
      .eq("message_id", id).order("id", { ascending: false }).limit(MAX_EDIT_HISTORY);
    if (error) {
      console.error("edit history query failed:", error.message);
      return ack(null);
    }
    ack([
      ...data.reverse().map((edit) => ({ text: edit.body, at: Date.parse(edit.written_at) })),
      { text: row.body, at: Date.parse(row.edited_at) },
    ]);
  });

  socket.on("event:update", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "You're saving too quickly. Wait a moment." });

    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const index = Number.isInteger(payload?.index) ? payload.index : -1;
    const row = id ? await loadMessage(id) : null;
    const channel = row && channelFor(row.channel_id, userId);
    const previous = row?.attachments?.[index];
    if (!row || row.deleted_at || !channel || previous?.type !== "event") {
      return ack({ ok: false, error: "That event no longer exists." });
    }
    if (mutedIn(channel.groupId, userId)) return ack({ ok: false, error: "You can't change events while you're muted." });
    // Its author, or moderators over the author (as with deleting it).
    if (row.author_id !== userId && !(await mayManageMessagesOf(channel.groupId, userId, row.author_id))) {
      return ack({ ok: false, error: "Only the event's creator and moderators can change it." });
    }
    const input = payload.event && typeof payload.event === "object" ? payload.event : {};
    const cleaned = sanitizeAttachment({ ...input, type: "event" });
    if (cleaned?.type !== "event") return ack({ ok: false, error: "Check the event's details and try again." });
    const filtered = filterError(channel.groupId, userId, attachmentText([cleaned]));
    if (filtered) return ack({ ok: false, error: filtered });
    // Who's going isn't edited here.
    const event = compact({ ...cleaned, attendees: previous.attendees });
    const attachments = row.attachments.map((a, i) => (i === index ? event : a));

    const { data, error } = await db.from("messages")
      .update({ attachments }).eq("id", id).is("deleted_at", null)
      .select("*").single();
    if (error || !data) {
      console.error("event update failed:", error?.message);
      return ack({ ok: false, error: "Couldn't save the event. Try again." });
    }
    // Reminders follow the new time: drop the unsent ones and save the event's again (none once cancelled).
    const { error: reminderError } = await db.from("event_reminders").delete()
      .eq("message_id", id).eq("attachment_index", index).is("sent_at", null);
    if (reminderError) console.error("clearing reminders failed:", reminderError.message);
    const [message] = await hydrate([toMessage(data as MessageRow)]);
    await saveReminders(message, index);
    if (latest.get(message.subgroupId)?.id === id) latest.set(message.subgroupId, message);
    toChannel(message.subgroupId).emit("message:update", message);
    ack({ ok: true });
    discoverChanged();
    if (row.author_id !== userId) {
      await logModeration(channel.groupId, userId, row.author_id, {
        action: "event_update",
        messageId: id,
        subgroupId: row.channel_id,
        before: previous,
        after: event,
      });
    }
  });

  socket.on("message:delete", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : "";
    const row = id ? await loadMessage(id) : null;
    if (!row || row.deleted_at) return ack({ ok: true }); // already gone
    const channel = channelFor(row.channel_id, userId);
    if (!channel) return ack({ ok: false, error: "That message no longer exists." });
    // System messages belong to the channel, not whoever caused them: only moderators remove them.
    const own = row.author_id === userId && !row.system;
    if (!own && !(await mayRemoveMessage(row, channel, userId))) {
      return ack({ ok: false, error: "You can only delete your own messages." });
    }
    const failure = await removeMessage(row, channel, userId, own);
    ack(failure ? { ok: false, error: failure } : { ok: true });
  });

  socket.on("thread:history", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const rootId = typeof payload?.rootId === "string" && ID_PATTERN.test(payload.rootId) ? payload.rootId : "";
    const empty = { root: null, replies: [], users: [], hasMore: false };
    if (!rootId || !canRead(socket.id)) return ack(empty);
    const root = await loadMessage(rootId);
    if (!root || root.thread_id || !channelFor(root.channel_id, socket.data.userId)) return ack(empty);

    const { data, error } = await db.from("messages").select("*").eq("thread_id", rootId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(THREAD_PAGE + 1);
    if (error) {
      console.error("thread query failed:", error.message);
      return ack(empty);
    }
    const rows = data as MessageRow[];
    const [hydratedRoot, ...replies] = await hydrate([
      toMessage(root),
      ...rows.slice(0, THREAD_PAGE).reverse().map(toMessage),
    ], socket.data.userId);
    ack({
      root: hydratedRoot,
      replies,
      users: await usersFor([hydratedRoot, ...replies]),
      hasMore: rows.length > THREAD_PAGE,
    });
  });

  socket.on("group:collection", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const empty = { messages: [], users: [], hasMore: false };
    const group = findGroup(payload?.groupId);
    const kind = payload?.kind;
    const types = typeof kind === "string" && Object.hasOwn(COLLECTION_TYPES, kind) ? COLLECTION_TYPES[kind] : null;
    if (!types || !group || !canAccess(group, socket.data.userId) || !canRead(socket.id)) return ack(empty);
    const channelIds = visibleChannels(group, socket.data.userId).map((s) => s.id);
    if (channelIds.length === 0) return ack(empty);

    // One containment query per attachment type (served by the GIN index), merged newest first.
    const results = await Promise.all(
      types.map((type) =>
        db.from("messages").select("*").in("channel_id", channelIds).is("deleted_at", null)
          // As a JSON string: given an array, supabase-js writes a Postgres array literal ("{…}"), not JSON.
          .contains("attachments", JSON.stringify([{ type }]))
          .order("created_at", { ascending: false }).limit(COLLECTION_PAGE + 1),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("collection query failed:", failed.error.message);
      return ack(empty);
    }
    const byId = new Map(results.flatMap((r) => r.data as MessageRow[]).map((row) => [row.id, row]));
    const rows = [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const page = await hydrate(rows.slice(0, COLLECTION_PAGE).map(toMessage), socket.data.userId);
    ack({ messages: page, users: await usersFor(page), hasMore: rows.length > COLLECTION_PAGE });
  });

  socket.on("search", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const empty = { messages: [], users: [], hasMore: false };
    const userId = socket.data.userId;
    if (!userId || !canRead(socket.id)) return ack(empty);
    const query = typeof payload?.query === "string" ? payload.query.trim() : "";
    if (query.length > 200) return ack(empty);
    const words = searchWords(query);
    // Filters (parsed in the browser: see lib/chat/searchQuery.ts).
    const authorIds = Array.isArray(payload.authorIds)
      ? payload.authorIds.filter((id): id is string => typeof id === "string" && id.length <= 128).slice(0, 20)
      : [];
    const has = Array.isArray(payload.has) ? SEARCH_HAS.filter((kind) => payload.has!.includes(kind)) : [];
    const since = num(payload.since);
    const until = num(payload.until);
    const filtered = authorIds.length > 0 || has.length > 0 || since !== undefined || until !== undefined;
    // Words need some length; a filter alone is enough to search by.
    if (query.length < MIN_SEARCH_LENGTH && !filtered) return ack(empty);

    // One channel, one group, or everything you're in (your groups and direct messages).
    let channelIds: string[];
    if (typeof payload.subgroupId === "string") {
      const channel = channelFor(payload.subgroupId, userId);
      channelIds = channel ? [channel.id] : [];
    } else if (typeof payload.groupId === "string") {
      const group = findGroup(payload.groupId);
      channelIds = group && canAccess(group, userId) ? visibleChannels(group, userId).map((s) => s.id) : [];
    } else {
      channelIds = listedGroups(userId).filter((g) => g.role).flatMap((g) => g.subgroups.map((s) => s.id));
    }
    if (channelIds.length === 0) return ack(empty);

    let search = db.from("messages").select("*").in("channel_id", channelIds)
      .is("deleted_at", null).is("system", null);
    for (const word of words) search = search.ilike("body", likePattern(word));
    if (authorIds.length > 0) search = search.in("author_id", authorIds);
    for (const kind of has) {
      // A link is in the text (its card is added later, and not always).
      search = kind === "link" ? search.ilike("body", "%://%") : search.contains("attachments", [{ type: kind }]);
    }
    if (since !== undefined) search = search.gte("created_at", new Date(since).toISOString());
    if (until !== undefined) search = search.lt("created_at", new Date(until).toISOString());
    // Keyset pagination past the `before` message, as in "history".
    const before = typeof payload.before === "string" && ID_PATTERN.test(payload.before) ? payload.before : null;
    if (before) {
      const { data: cursor } = await db.from("messages").select("id, created_at").eq("id", before).maybeSingle();
      if (!cursor) return ack(empty);
      const at = `"${cursor.created_at}"`;
      search = search.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`);
    }
    const { data, error } = await search
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(SEARCH_PAGE + 1);
    if (error) {
      console.error("search failed:", error.message);
      return ack(empty);
    }
    const rows = data as MessageRow[];
    const page = rows.slice(0, SEARCH_PAGE).map(toMessage);
    ack({ messages: page, users: await usersFor(page), hasMore: rows.length > SEARCH_PAGE });
  });

  socket.on("pins", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    if (!channelFor(channelId, socket.data.userId) || !canRead(socket.id)) return ack({ messages: [], users: [] });
    const { data, error } = await db.from("messages").select("*").eq("channel_id", channelId)
      .not("pinned_at", "is", null).is("deleted_at", null)
      .order("pinned_at", { ascending: false }).limit(MAX_PINS_PER_CHANNEL);
    if (error) {
      console.error("pins query failed:", error.message);
      return ack({ messages: [], users: [] });
    }
    const pinned = await hydrate((data as MessageRow[]).map(toMessage), socket.data.userId);
    ack({ messages: pinned, users: await usersFor(pinned) });
  });

  socket.on("message:pin", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (members.get(userId)?.kind === "guest") return ack({ ok: false, error: "Sign in to pin messages." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : "";
    const pin = payload?.pinned === true;
    const row = id ? await loadMessage(id) : null;
    const channel = row && channelFor(row.channel_id, userId);
    if (!row || row.deleted_at || !channel) {
      return ack({ ok: false, error: "That message no longer exists." });
    }
    if (!mayPin(channel.groupId, userId)) return ack({ ok: false, error: "Only moderators and up can pin messages." });
    if (row.thread_id) return ack({ ok: false, error: "Only channel messages can be pinned." });
    if (row.system) return ack({ ok: false, error: "System messages can't be pinned." });
    if (Boolean(row.pinned_at) === pin) return ack({ ok: true });

    if (pin) {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("channel_id", row.channel_id).not("pinned_at", "is", null).is("deleted_at", null);
      if ((count ?? 0) >= MAX_PINS_PER_CHANNEL) {
        return ack({ ok: false, error: `A channel can have at most ${MAX_PINS_PER_CHANNEL} pins. Unpin one first.` });
      }
    }
    const { data, error } = await db.from("messages")
      .update(pin ? { pinned_at: new Date().toISOString(), pinned_by: userId } : { pinned_at: null, pinned_by: null })
      .eq("id", id).select("*").single();
    if (error || !data) {
      console.error("pin failed:", error?.message);
      return ack({ ok: false, error: "Couldn't update the pin. Try again." });
    }
    const message = toMessage(data as MessageRow);
    if (latest.get(message.subgroupId)?.id === id) latest.set(message.subgroupId, message);
    toChannel(message.subgroupId).emit("message:pin", {
      subgroupId: message.subgroupId,
      messageId: id,
      ...(message.pinned && { pinned: message.pinned }),
    });
    ack({ ok: true });
    await logModeration(channel.groupId, userId, row.author_id, {
      action: pin ? "message_pin" : "message_unpin",
      message: snapshotOf(row),
    });
    if (pin) await postSystem(row.channel_id, userId, { type: "message_pin", messageId: id });
  });

  socket.on("reaction:toggle", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const emoji = typeof payload?.emoji === "string" ? payload.emoji : "";
    const custom = customEmojiName(emoji);
    if (!emoji || (!custom && (emoji.length > 16 || !EMOJI.test(emoji)))) {
      return ack({ ok: false, error: "That isn't a supported reaction." });
    }
    const id = typeof payload.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const row = id ? await loadMessage(id) : null;
    const reactChannel = row && channelFor(row.channel_id, userId);
    if (!row || row.deleted_at || !reactChannel) {
      return ack({ ok: false, error: "That message no longer exists." });
    }
    // ":name:" reactions are the group's own custom emoji.
    if (custom && !findGroup(reactChannel.groupId)?.emoji?.some((e) => e.name === custom)) {
      return ack({ ok: false, error: "This group has no emoji by that name." });
    }

    const { data: current } = await db.from("message_reactions")
      .select("member_id, emoji").eq("message_id", id).order("created_at");
    const rows = current ?? [];
    const mine = rows.some((r) => r.member_id === userId && r.emoji === emoji);
    if (mine) {
      await db.from("message_reactions").delete().eq("message_id", id).eq("member_id", userId).eq("emoji", emoji);
    } else {
      const distinct = new Set(rows.map((r) => r.emoji));
      if (!distinct.has(emoji) && distinct.size >= MAX_REACTIONS_PER_MESSAGE) {
        return ack({ ok: false, error: "This message has too many different reactions." });
      }
      const { error } = await db.from("message_reactions")
        .upsert({ message_id: id, member_id: userId, emoji }, { ignoreDuplicates: true });
      if (error) {
        console.error("reaction failed:", error.message);
        return ack({ ok: false, error: "Couldn't add the reaction. Try again." });
      }
    }
    const { data: after } = await db.from("message_reactions")
      .select("member_id, emoji").eq("message_id", id).order("created_at");
    toChannel(row.channel_id).emit("message:reactions", { subgroupId: row.channel_id, messageId: id, reactions: toReactions(after ?? []) });
    ack({ ok: true });
  });

  socket.on("poll:vote", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const pollIndex = Number.isInteger(payload?.poll) ? payload.poll : -1;
    const option = payload?.option === null ? null : Number.isInteger(payload?.option) ? payload.option : -1;
    const row = id ? await loadMessage(id) : null;
    const poll = row && !row.deleted_at ? row.attachments?.[pollIndex] : undefined;
    if (!row || poll?.type !== "poll" || !channelFor(row.channel_id, userId)) {
      return ack({ ok: false, error: "That poll no longer exists." });
    }
    if (option !== null && (option < 0 || option >= poll.options.length)) {
      return ack({ ok: false, error: "That isn't one of the options." });
    }
    if (isClosed(poll)) return ack({ ok: false, error: "This poll has closed." });

    // In one transaction (see cast_poll_vote), so quick votes can't interleave or go past the limit.
    // Adding a choice again (a retry) changes nothing.
    const { data: refused, error } = await db.rpc("cast_poll_vote", {
      p_message_id: id,
      p_poll_index: pollIndex,
      p_member_id: userId,
      p_option: option,
      p_chosen: !(poll.multiple && payload.chosen === false),
      p_single: !poll.multiple,
      p_max: poll.maxChoices ?? null,
    });
    if (error) {
      console.error("vote failed:", error.message);
      return ack({ ok: false, error: "Couldn't record your vote. Try again." });
    }
    if (refused === "limit") {
      return ack({ ok: false, error: `You can pick up to ${poll.maxChoices}. Take one back to choose another.` });
    }
    const { data: votes } = await db.from("poll_votes")
      .select("poll_index, member_id, option_index").eq("message_id", id);
    toChannel(row.channel_id).emit("poll:votes", {
      subgroupId: row.channel_id,
      messageId: id,
      pollVotes: toPollVotes(toMessage(row), votes ?? []),
    });
    ack({ ok: true });
  });

  socket.on("read:mark", async (payload) => {
    const userId = socket.data.userId;
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    if (!userId || !channelFor(channelId, userId) || !id || !canMark(userId)) return;
    // Use the message's exact database timestamp (microseconds), so the
    // message itself never counts as unread after a reload.
    const { data } = await db.from("messages").select("created_at").eq("id", id).eq("channel_id", channelId).maybeSingle();
    if (!data) return;
    const { error } = await db.from("read_state")
      .upsert({ member_id: userId, channel_id: channelId, last_read_at: data.created_at });
    if (error) return console.error("read mark failed:", error.message);
    // "Seen by" for whoever's looking at the group (only members' reads count),
    // both sides sharing reads (turning it off works both ways).
    const groupId = channels.get(channelId)?.groupId;
    if (!groupId || !accessByMember.get(userId)?.groups.has(groupId) || !sharesReads(userId)) return;
    const at = Date.parse(data.created_at);
    for (const other of io.sockets.sockets.values()) {
      const viewer = other.data.userId;
      if (other.data.viewing === groupId && viewer && viewer !== userId && sharesReads(viewer)) {
        other.emit("read:update", { subgroupId: channelId, userId, at });
      }
    }
  });

  socket.on("read:positions", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const channel = channelFor(payload?.subgroupId, userId);
    // With read receipts off you don't see others' either.
    if (!userId || !channel || !canRead(socket.id) || !sharesReads(userId)) return ack({});
    // Members only (people previewing a public group don't count), up to a few hundred.
    const { data: memberRows } = await db.from("group_members").select("member_id")
      .eq("group_id", channel.groupId).neq("member_id", userId).limit(300);
    // Their settings live on their member records: load anyone not known yet.
    await usersByIds((memberRows ?? []).map((row) => row.member_id));
    const ids = (memberRows ?? []).map((row) => row.member_id).filter(sharesReads);
    if (ids.length === 0) return ack({});
    const { data, error } = await db.from("read_state").select("member_id, last_read_at")
      .eq("channel_id", channel.id).in("member_id", ids);
    if (error) {
      console.error("read positions query failed:", error.message);
      return ack({});
    }
    ack(Object.fromEntries(data.map((row) => [row.member_id, Date.parse(row.last_read_at)])));
  });

  socket.on("read:markAll", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canMark(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    let channelIds: string[];
    if (typeof payload?.groupId === "string") {
      const group = findGroup(payload.groupId);
      if (!group || !canAccess(group, userId)) return ack({ ok: false, error: "That group no longer exists." });
      channelIds = visibleChannels(group, userId).map((s) => s.id);
    } else {
      channelIds = listedGroups(userId).filter((g) => g.role).flatMap((g) => g.subgroups.map((s) => s.id));
    }
    if (channelIds.length === 0) return ack({ ok: true });
    const now = new Date().toISOString();
    const { error } = await db.from("read_state")
      .upsert(channelIds.map((channel_id) => ({ member_id: userId, channel_id, last_read_at: now })));
    if (error) {
      console.error("mark all read failed:", error.message);
      return ack({ ok: false, error: "Couldn't mark everything as read. Try again." });
    }
    ack({ ok: true });
  });

  socket.on("read:unmark", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canMark(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const channelId = typeof payload?.subgroupId === "string" ? payload.subgroupId : "";
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const { data: target } = id && channelFor(channelId, userId)
      ? await db.from("messages").select("created_at, thread_id").eq("id", id).eq("channel_id", channelId).maybeSingle()
      : { data: null };
    // Thread replies don't count towards a channel's unread messages.
    if (!target || target.thread_id) return ack({ ok: false, error: "That message no longer exists." });

    // Read up to the message before it, so it and everything after it are unread.
    // Exact database timestamps (microseconds), as in "read:mark".
    const { data: previous } = await db.from("messages").select("created_at")
      .eq("channel_id", channelId).is("thread_id", null).lt("created_at", target.created_at)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const lastReadAt = previous?.created_at ?? new Date(0).toISOString();
    const { error } = await db.from("read_state")
      .upsert({ member_id: userId, channel_id: channelId, last_read_at: lastReadAt });
    if (error) {
      console.error("mark unread failed:", error.message);
      return ack({ ok: false, error: "Couldn't mark it unread. Try again." });
    }
    // Counted as on joining (see readSnapshot): others' messages, not notices.
    const { count } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("channel_id", channelId).is("thread_id", null).gt("created_at", lastReadAt)
      .neq("author_id", userId).is("deleted_at", null).is("system", null);
    ack({ ok: true, lastRead: Date.parse(lastReadAt), unread: Math.min(count ?? 0, 100) });
  });

  socket.on("quiz:answer", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });

    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const quizIndex = Number.isInteger(payload?.quiz) ? payload.quiz : -1;
    const option = Number.isInteger(payload?.option) ? payload.option : -1;
    const row = id ? await loadMessage(id) : null;
    const quiz = row && !row.deleted_at ? row.attachments?.[quizIndex] : undefined;
    if (!row || quiz?.type !== "quiz" || !channelFor(row.channel_id, userId)) {
      return ack({ ok: false, error: "That quiz no longer exists." });
    }
    if (option < 0 || option >= quiz.options.length) return ack({ ok: false, error: "That isn't one of the options." });
    if (isClosed(quiz)) return ack({ ok: false, error: "This quiz has closed." });
    const correct = quiz.options.indexOf(quiz.correctAnswer ?? "");
    if (correct < 0) return ack({ ok: false, error: "This quiz can't be answered." });

    // One answer each: trying again gets the first one back.
    const key = { message_id: id, quiz_index: quizIndex, member_id: userId };
    const { error } = await db.from("quiz_answers")
      .upsert({ ...key, option_index: option, correct_index: correct }, { ignoreDuplicates: true });
    const { data: answer } = error
      ? { data: null }
      : await db.from("quiz_answers").select("option_index, correct_index").match(key).maybeSingle();
    if (!answer) {
      console.error("quiz answer failed:", error?.message);
      return ack({ ok: false, error: "Couldn't record your answer. Try again." });
    }
    ack({ ok: true, answer: toQuizAnswer(answer) });
  });

  socket.on("event:rsvp", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const index = Number.isInteger(payload?.index) ? payload.index : -1;
    const row = id ? await loadMessage(id) : null;
    const channel = row && channelFor(row.channel_id, userId);
    const event = row?.attachments?.[index];
    if (!row || row.deleted_at || !channel || event?.type !== "event") {
      return ack({ ok: false, error: "That event no longer exists." });
    }
    const going = payload.going === true;
    const attendees = event.attendees ?? [];
    if (going === attendees.includes(userId)) return ack({ ok: true });
    if (going) {
      if (event.cancelled) return ack({ ok: false, error: "This event was cancelled." });
      // Mirrors eventEnd in lib/chat/types/attachments.ts.
      const end = event.endTime ?? (event.allDay ? event.startTime + 24 * 60 * 60 * 1000 : event.startTime);
      if (end < Date.now()) return ack({ ok: false, error: "This event is over." });
      if (attendees.length >= 100) return ack({ ok: false, error: "This event is full." });
    }
    const { data, error } = await db.rpc("set_event_attendance", {
      p_message: id,
      p_index: index,
      p_member: userId,
      p_going: going,
    });
    if (error || !data) {
      if (error) console.error("rsvp failed:", error.message);
      return ack({ ok: false, error: "Couldn't save your answer. Try again." });
    }
    const [message] = await hydrate([toMessage({ ...row, attachments: data as Attachment[] })]);
    if (latest.get(message.subgroupId)?.id === id) latest.set(message.subgroupId, message);
    toChannel(message.subgroupId).emit("message:update", message);
    ack({ ok: true });
  });

  socket.on("message:forward", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "You're sending messages too quickly. Wait a moment." });
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    const row = id ? await loadMessage(id) : null;
    if (!row || row.deleted_at || row.system || !channelFor(row.channel_id, userId)) {
      return ack({ ok: false, error: "That message no longer exists." });
    }
    const target = channelFor(payload.subgroupId, userId);
    if (!target) return ack({ ok: false, error: "That chat no longer exists." });
    const held = await postingError(target, userId);
    if (held) return ack({ ok: false, error: held });

    // Credit the original author (forwarding a forward keeps the first one). Replies and
    // mentions point into the old chat, so they're dropped; events lose their answers and reminders.
    const origin = row.attachments.find((a) => a.type === "forward") ?? {
      type: "forward" as const,
      authorId: row.author_id ?? "",
      messageId: row.id,
      subgroupId: row.channel_id,
      at: Date.parse(row.created_at),
    };
    const copied = row.attachments
      .filter((a) => a.type !== "reply" && a.type !== "mention" && a.type !== "forward")
      .map((a): Attachment =>
        a.type === "event" ? compact({ ...a, attendees: undefined, reminders: undefined, remindGoingOnly: undefined }) : a,
      );
    const attachments = [origin, ...copied].slice(0, MAX_ATTACHMENTS);
    const filtered = filterError(target.groupId, userId, `${row.body}\n${attachmentText(attachments)}`);
    if (filtered) return ack({ ok: false, error: filtered });

    const { data, error } = await db.from("messages")
      .insert({ id: randomUUID(), channel_id: target.id, author_id: userId, body: row.body, attachments })
      .select("*").single();
    if (error || !data) {
      console.error("forward failed:", error?.message);
      return ack({ ok: false, error: "Couldn't forward the message. Try again." });
    }
    const message = toMessage(data as MessageRow);
    announce(message, target);
    ack({ ok: true, message });
    await afterPost(message, target, { replyTo: null, root: null });
  });

  socket.on("schedule:create", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canSend(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const channel = channelFor(payload?.subgroupId, userId);
    if (!channel) return ack({ ok: false, error: "That channel doesn't exist." });
    const sendAt = num(payload.sendAt);
    if (sendAt === undefined || sendAt < Date.now() + 60_000 || sendAt > Date.now() + MAX_SCHEDULE_AHEAD) {
      return ack({ ok: false, error: "Pick a time from a minute to 30 days from now." });
    }
    const body = typeof payload.text === "string" ? payload.text.trim() : "";
    if (body.length > MAX_MESSAGE_LENGTH) {
      return ack({ ok: false, error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` });
    }
    const sanitized = sanitizeAttachments(payload.attachments);
    if (typeof sanitized === "string") return ack({ ok: false, error: sanitized });
    // A reply's target could be gone by then; scheduled messages stand on their own.
    const attachments = sanitized.filter((a) => a.type !== "reply");
    if (!body && !attachments.some((a) => a.type !== "mention")) return ack({ ok: false, error: "Messages can't be empty." });
    const held = (await postingError(channel, userId, false, false)) ??
      filterError(channel.groupId, userId, `${body}\n${attachmentText(attachments)}`) ??
      stickerError(channel.groupId, attachments);
    if (held) return ack({ ok: false, error: held });
    const { count } = await db.from("scheduled_messages").select("id", { count: "exact", head: true })
      .eq("author_id", userId).is("sent_at", null);
    if ((count ?? 0) >= MAX_SCHEDULED) {
      return ack({ ok: false, error: `You can have up to ${MAX_SCHEDULED} messages waiting. Cancel one first.` });
    }
    const { data, error } = await db.from("scheduled_messages")
      .insert({ channel_id: channel.id, author_id: userId, body, attachments, send_at: new Date(sendAt).toISOString() })
      .select("*").single();
    if (error || !data) {
      console.error("schedule failed:", error?.message);
      return ack({ ok: false, error: "Couldn't schedule the message. Try again." });
    }
    ack({ ok: true, scheduled: toScheduled(data as ScheduledRow) });
  });

  socket.on("schedule:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    const channel = channelFor(payload?.subgroupId, userId);
    if (!userId || !channel || !canRead(socket.id)) return ack([]);
    // Waiting ones, and failed ones until they're dismissed.
    const { data, error } = await db.from("scheduled_messages").select("*")
      .eq("author_id", userId).eq("channel_id", channel.id)
      .or("sent_at.is.null,failure.not.is.null").order("send_at").limit(50);
    if (error) {
      console.error("schedule list failed:", error.message);
      return ack([]);
    }
    ack((data as ScheduledRow[]).map(toScheduled));
  });

  socket.on("schedule:cancel", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    const id = typeof payload?.id === "string" && /^[0-9a-f-]{36}$/.test(payload.id) ? payload.id : "";
    if (!id) return ack({ ok: true });
    // Only before it's claimed for sending (or after it failed).
    const { error } = await db.from("scheduled_messages").delete()
      .eq("id", id).eq("author_id", userId).or("sent_at.is.null,failure.not.is.null");
    if (error) {
      console.error("schedule cancel failed:", error.message);
      return ack({ ok: false, error: "Couldn't cancel it. Try again." });
    }
    ack({ ok: true });
  });

  socket.on("gif:search", async (payload, ack) => {
    if (typeof ack !== "function") return;
    if (!tenorKey) return ack(null);
    const userId = socket.data.userId;
    if (!userId || !canSearchGifs(userId)) return ack([]);
    const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 100) : "";
    try {
      ack(await searchGifs(query));
    } catch (error) {
      console.error("gif search failed:", error instanceof Error ? error.message : error);
      ack([]);
    }
  });

  socket.on("link:preview", async (payload, ack) => {
    if (typeof ack !== "function") return;
    // Only for people who could post it; per connection, since it fetches other sites.
    if (!socket.data.userId || !canPreview(socket.id)) return ack(null);
    try {
      ack(await previewFor(payload?.url));
    } catch (error) {
      console.error("link preview failed:", error instanceof Error ? error.message : error);
      ack(null);
    }
  });
}
