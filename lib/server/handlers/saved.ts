// Saved messages: each member's private "save for later" list.

import { channelFor } from "../access.ts";
import { ID_PATTERN, MAX_SAVED, SAVED_PAGE } from "../constants.ts";
import { db } from "../db.ts";
import { canRead, canReact } from "../limits.ts";
import { hydrate, loadMessage, toMessage } from "../messages.ts";
import type { ChatSocket, MessageRow } from "../state.ts";
import { usersFor } from "../users.ts";

/** The messages a member saved (ids, most recent first), for their session snapshot. */
export async function savedIds(memberId: string) {
  const { data } = await db.from("saved_messages").select("message_id")
    .eq("member_id", memberId).order("created_at", { ascending: false }).limit(MAX_SAVED);
  return (data ?? []).map((row) => row.message_id);
}

export function registerSavedHandlers(socket: ChatSocket) {
  socket.on("saved:set", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const userId = socket.data.userId;
    if (!userId) return ack({ ok: false, error: "You're not signed in." });
    if (!canReact(userId)) return ack({ ok: false, error: "Slow down a little and try again." });
    const id = typeof payload?.messageId === "string" && ID_PATTERN.test(payload.messageId) ? payload.messageId : "";
    if (!id) return ack({ ok: false, error: "That message no longer exists." });

    if (payload.saved === false) {
      const { error } = await db.from("saved_messages").delete().eq("member_id", userId).eq("message_id", id);
      if (error) {
        console.error("unsave failed:", error.message);
        return ack({ ok: false, error: "Couldn't remove it from your saved messages. Try again." });
      }
      return ack({ ok: true });
    }

    const row = await loadMessage(id);
    if (!row || row.deleted_at || row.system || !channelFor(row.channel_id, userId)) {
      return ack({ ok: false, error: "That message no longer exists." });
    }
    const { count } = await db.from("saved_messages").select("message_id", { count: "exact", head: true }).eq("member_id", userId);
    if ((count ?? 0) >= MAX_SAVED) {
      return ack({ ok: false, error: `You can keep up to ${MAX_SAVED} saved messages. Remove some first.` });
    }
    const { error } = await db.from("saved_messages")
      .upsert({ member_id: userId, message_id: id }, { ignoreDuplicates: true });
    if (error) {
      console.error("save failed:", error.message);
      return ack({ ok: false, error: "Couldn't save it. Try again." });
    }
    ack({ ok: true });
  });

  socket.on("saved:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const empty = { messages: [], users: [], hasMore: false };
    const userId = socket.data.userId;
    if (!userId || !canRead(socket.id)) return ack(empty);

    let query = db.from("saved_messages").select("message_id, created_at").eq("member_id", userId);
    // Keyset pagination past the save of the `before` message (exact timestamps, as in "history").
    const before = typeof payload?.before === "string" && ID_PATTERN.test(payload.before) ? payload.before : null;
    if (before) {
      const { data: cursor } = await db.from("saved_messages").select("created_at")
        .eq("member_id", userId).eq("message_id", before).maybeSingle();
      if (!cursor) return ack(empty);
      const at = `"${cursor.created_at}"`;
      query = query.or(`created_at.lt.${at},and(created_at.eq.${at},message_id.lt.${before})`);
    }
    const { data: saves, error } = await query
      .order("created_at", { ascending: false }).order("message_id", { ascending: false }).limit(SAVED_PAGE + 1);
    if (error) {
      console.error("saved list failed:", error.message);
      return ack(empty);
    }
    const ids = saves.slice(0, SAVED_PAGE).map((save) => save.message_id);
    const { data } = ids.length ? await db.from("messages").select("*").in("id", ids) : { data: [] };
    const byId = new Map(((data ?? []) as MessageRow[]).map((row) => [row.id, row]));
    // Only what's still there for you: it may have been deleted, or you left its group.
    const rows = ids
      .map((id) => byId.get(id))
      .filter((row): row is MessageRow => Boolean(row && !row.deleted_at && channelFor(row.channel_id, userId)));
    const page = await hydrate(rows.map(toMessage), userId);
    ack({ messages: page, users: await usersFor(page), hasMore: saves.length > SAVED_PAGE });
  });
}
