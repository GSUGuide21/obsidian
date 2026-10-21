// Disappearing messages: a loop deletes the messages that are past their channel's timer, and their files.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { uploadObjectPath } from "../chat/storage.ts";
import type { Attachment } from "../chat/types";
import { toChannel } from "./access.ts";
import { db, supabaseUrl } from "./db.ts";
import { refreshThread, toMessage } from "./messages.ts";
import { likePattern } from "./search.ts";
import { channels, latest, type MessageRow } from "./state.ts";

// ---------------------------------------------------------------------------
// Disappearing messages: in channels with a timer (Subgroup.disappearAfter),
// messages older than it are deleted for good, not just hidden (their
// reactions, votes, edits and saves go with them), and so are the files they
// carried, unless something else still uses them. Everyone looking is told to
// drop them ("messages:expired").
//
// A thread's root can be older than its replies. Deleting it would take the
// replies with it, so while its thread still has replies younger than the
// timer it's wiped instead (no text, attachments or reactions) and kept as a
// deleted message holding the thread. It goes once its last reply does.
// ---------------------------------------------------------------------------

export let sweepingExpired = false;

export async function sweepExpired() {
  if (sweepingExpired) return;
  sweepingExpired = true;
  try {
    for (const channel of [...channels.values()]) {
      if (channel.disappearAfter) await expireChannel(channel.id, Date.now() - channel.disappearAfter * 1000);
    }
  } finally {
    sweepingExpired = false;
  }
}

/** Delete the channel's messages posted before `before` (ms), and tell everyone. */
export async function expireChannel(channelId: string, before: number) {
  const cutoff = new Date(before).toISOString();

  // Roots past their time whose threads still have younger replies are kept, wiped.
  const { data: rootRows, error: rootError } = await db.from("messages").select("*")
    .eq("channel_id", channelId).is("thread_id", null).lt("created_at", cutoff).gte("thread_last_at", cutoff);
  if (rootError) return console.error("expiring messages failed:", rootError.message);
  const kept = rootRows as MessageRow[];
  const wiped = await wipeRoots(kept.filter((row) => row.body || row.attachments.length > 0 || !row.deleted_at));

  // Ids match ID_PATTERN, so they're safe in a PostgREST list.
  let query = db.from("messages").delete().eq("channel_id", channelId).lt("created_at", cutoff);
  if (kept.length > 0) query = query.not("id", "in", `(${kept.map((row) => row.id).join(",")})`);
  const { data, error } = await query.select("id, thread_id, attachments");
  if (error) return console.error("expiring messages failed:", error.message);
  if (data.length === 0 && wiped.length === 0) return;

  const latestId = latest.get(channelId)?.id;
  const touched = new Set([...data.map((row) => row.id), ...wiped.map((row) => row.id)]);
  if (latestId && touched.has(latestId)) await refreshLatest(channelId);
  if (data.length > 0) toChannel(channelId).emit("messages:expired", { subgroupId: channelId, before });
  // Threads that lost some replies but not their root: recount them.
  const deleted = new Set(data.map((row) => row.id));
  const roots = new Set(data.map((row) => row.thread_id).filter((id): id is string => typeof id === "string" && !deleted.has(id)));
  for (const rootId of roots) await refreshThread(rootId, channelId);

  await removeUnusedUploads([...data, ...wiped].flatMap((row) => fileUrls(row.attachments ?? [])));
}

/** Empty the roots (kept for their threads) and show them as deleted; resolves to what they carried. */
async function wipeRoots(rows: MessageRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const { error } = await db.from("messages").update({ body: "", attachments: [], pinned_at: null, pinned_by: null }).in("id", ids);
  // Ones already deleted keep who deleted them.
  const { error: deleteError } = error
    ? { error }
    : await db.from("messages").update({ deleted_at: new Date().toISOString() }).in("id", ids).is("deleted_at", null);
  const { data, error: loadError } = deleteError ? { data: null, error: deleteError } : await db.from("messages").select("*").in("id", ids);
  if (loadError || !data) {
    console.error("wiping expired thread roots failed:", loadError?.message);
    return [];
  }
  // What hung off them goes as it would have with them.
  const results = await Promise.all(
    ["message_reactions", "poll_votes", "quiz_answers", "event_reminders", "saved_messages", "message_edits"].map((table) =>
      db.from(table).delete().in("message_id", ids),
    ),
  );
  for (const result of results) if (result.error) console.error("wiping expired thread roots failed:", result.error.message);
  for (const row of data as MessageRow[]) toChannel(row.channel_id).emit("message:update", toMessage(row));
  return rows;
}

/** The uploaded files a message carried (media and files; link cards and stickers point elsewhere). */
function fileUrls(attachments: Attachment[]) {
  return attachments.flatMap((a) =>
    (a.type === "image" || a.type === "video" || a.type === "audio" || a.type === "voice" || a.type === "file") && a.src
      ? [a.src]
      : [],
  );
}

/**
 * Delete these uploads from storage, except the ones still used anywhere
 * else: another message (a forwarded copy, a link to it), a scheduled one,
 * an emoji, a sticker, someone's photo or a wiki page. Unsure (a check
 * failed): kept.
 */
export async function removeUnusedUploads(urls: string[]) {
  const unused: string[] = [];
  for (const url of new Set(urls)) {
    const path = uploadObjectPath(url, supabaseUrl!);
    if (!path) continue;
    const pattern = likePattern(url);
    // As JSON strings: given an array, supabase-js writes a Postgres array literal, not JSON.
    const checks = await Promise.all([
      db.from("messages").select("id").contains("attachments", JSON.stringify([{ src: url }])).limit(1),
      db.from("messages").select("id").contains("attachments", JSON.stringify([{ url }])).limit(1),
      db.from("messages").select("id").ilike("body", pattern).limit(1),
      db.from("scheduled_messages").select("id").contains("attachments", JSON.stringify([{ src: url }])).limit(1),
      db.from("scheduled_messages").select("id").ilike("body", pattern).limit(1),
      db.from("group_emoji").select("name").eq("url", url).limit(1),
      db.from("group_stickers").select("name").eq("url", url).limit(1),
      db.from("profiles").select("member_id").eq("avatar_url", url).limit(1),
      db.from("profiles").select("member_id").eq("poster_url", url).limit(1),
      db.from("group_members").select("member_id").eq("avatar_url", url).limit(1),
      db.from("channel_pages").select("channel_id").ilike("body", pattern).limit(1),
    ]);
    if (checks.every((check) => !check.error && check.data.length === 0)) unused.push(path);
  }
  if (unused.length === 0) return;
  const { error } = await db.storage.from("uploads").remove(unused);
  if (error) return console.error("removing expired files failed:", error.message);
  const { error: recordError } = await db.from("uploads").delete().in("object_path", unused);
  if (recordError) console.error("removing expired upload records failed:", recordError.message);
}

/** The channel's newest top-level message again, for previews (as loadState finds it). */
async function refreshLatest(channelId: string) {
  const { data } = await db.from("messages").select("*").eq("channel_id", channelId).is("thread_id", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (data?.[0]) latest.set(channelId, toMessage(data[0] as MessageRow));
  else latest.delete(channelId);
}
