// Read state: unread counts and "last read" times per member and channel.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { db } from "./db.ts";

 // read markers

// ---------------------------------------------------------------------------
// Read state: unread counts and "last read" times per member and channel.
// ---------------------------------------------------------------------------

/**
 * Read state for the channels this member can see, plus unread mentions of
 * them in `mine` (the channels of their own groups and direct messages).
 */
export async function readSnapshot(memberId: string, channelIds: string[], mine: string[]) {
  const { data } = await db.from("read_state").select("channel_id, last_read_at").eq("member_id", memberId);
  const rows = data ?? [];
  const lastRead: Record<string, number> = {};
  const unread: Record<string, number> = {};
  const mentions: Record<string, number> = {};

  if (rows.length === 0) {
    // First visit: start with everything read rather than every message unread.
    const now = new Date().toISOString();
    await db.from("read_state").upsert(
      channelIds.map((channel_id) => ({ member_id: memberId, channel_id, last_read_at: now })),
    );
    for (const channelId of channelIds) lastRead[channelId] = Date.parse(now);
    return { lastRead, unread, mentions };
  }

  // Channels created since this member's first visit have no row yet: they
  // haven't read any of it, so everything in them counts.
  const read = new Map(rows.map((row) => [row.channel_id, row.last_read_at]));
  await Promise.all(
    channelIds.map(async (channelId) => {
      const lastReadAt = read.get(channelId);
      lastRead[channelId] = lastReadAt ? Date.parse(lastReadAt) : 0;
      // `author_id <> me` also skips messages whose author was deleted (null).
      let query = db.from("messages").select("id", { count: "exact", head: true })
        .eq("channel_id", channelId).is("thread_id", null)
        .neq("author_id", memberId).is("deleted_at", null).is("system", null);
      if (lastReadAt) query = query.gt("created_at", lastReadAt);
      const { count } = await query;
      if (count) unread[channelId] = Math.min(count, 100);
    }),
  );

  // Mentions since the oldest read position among `mine`, counted per channel past its own.
  const mentioned = mine.filter((id) => unread[id]);
  if (mentioned.length > 0) {
    const since = Math.min(...mentioned.map((id) => lastRead[id]));
    const { data: rows } = await db.from("messages").select("channel_id, created_at")
      .in("channel_id", mentioned).neq("author_id", memberId).is("deleted_at", null)
      .contains("attachments", JSON.stringify([{ type: "mention", userId: memberId }]))
      .gt("created_at", new Date(since).toISOString()).limit(500);
    for (const row of rows ?? []) {
      if (Date.parse(row.created_at) <= lastRead[row.channel_id]) continue;
      mentions[row.channel_id] = Math.min((mentions[row.channel_id] ?? 0) + 1, 100);
    }
  }
  return { lastRead, unread, mentions };
}
