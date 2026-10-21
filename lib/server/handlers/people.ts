// People: finding others to talk to (Discover's People tab).

import { accessOf } from "../access.ts";
import { db } from "../db.ts";
import { canRead } from "../limits.ts";
import { likePattern } from "../search.ts";
import { members, STATUS_COLUMNS, toMemberRow, type ChatSocket } from "../state.ts";
import { toUser } from "../users.ts";

// Mirrors PEOPLE_PAGE in lib/chat/types/users.ts.
const PEOPLE_PAGE = 30;

export function registerPeopleHandlers(socket: ChatSocket) {
  socket.on("people:list", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const empty = { users: [], hasMore: false };
    const userId = socket.data.userId;
    if (!userId || !canRead(socket.id)) return ack(empty);
    const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 64) : "";
    const offset = Number.isInteger(payload?.offset) && payload.offset! >= 0 ? Math.min(payload.offset!, 10_000) : 0;

    // Signed-in accounts that let themselves be found, most recently around first. The profile
    // is joined (!inner) so its setting can filter the rows.
    let search = db.from("members")
      .select(`id, kind, name, role, profile:profiles!inner(color, avatar_url, bio, poster_url, ${STATUS_COLUMNS})`)
      .eq("kind", "user").neq("id", userId).is("banned_at", null).eq("profile.discoverable", true)
      .order("last_seen_at", { ascending: false }).order("id")
      .range(offset, offset + PEOPLE_PAGE);
    if (query) search = search.ilike("name", likePattern(query));
    const [{ data, error }, access, { data: blockers }] = await Promise.all([
      search,
      accessOf(userId),
      // People who blocked you don't show up either.
      db.from("member_blocks").select("member_id").eq("blocked_id", userId),
    ]);
    if (error) {
      console.error("people list failed:", error.message);
      return ack(empty);
    }
    const hidden = new Set([...access.blocked, ...(blockers ?? []).map((row) => row.member_id as string)]);
    const rows = (data ?? []).map((raw) => toMemberRow(raw as Record<string, unknown>));
    // Kept, so messaging them works like anyone else the server knows.
    for (const row of rows) if (!members.has(row.id)) members.set(row.id, row);
    const users = rows.slice(0, PEOPLE_PAGE).filter((row) => !hidden.has(row.id)).map((row) => toUser(members.get(row.id) ?? row));
    ack({ users, hasMore: rows.length > PEOPLE_PAGE });
  });
}
