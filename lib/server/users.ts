// People: presence, custom statuses, and loading members the server doesn't know yet.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Message, User } from "../chat/types";
import { db } from "./db.ts";
import { io } from "./sockets.ts";
import { connections, idleSockets, MEMBER_SELECT, members, toMemberRow, type MemberRow } from "./state.ts";

export function isIdle(userId: string) {
  const idle = idleSockets.get(userId) ?? 0;
  return idle > 0 && idle >= (connections.get(userId) ?? 0);
}

/** What others see: offline unless connected (and not invisible); online turns away while idle. */
export function statusOf(row: MemberRow): User["status"] {
  if (row.kind === "bot") return "online";
  if (!connections.has(row.id) || row.presence === "invisible") return "offline";
  if (row.presence === "dnd" || row.presence === "away") return row.presence;
  return isIdle(row.id) ? "away" : "online";
}

/** Their custom status, unless it has cleared itself. */
export function customStatus(row: MemberRow, now = Date.now()) {
  const until = row.status_expires_at ? Date.parse(row.status_expires_at) : undefined;
  if ((!row.status_text && !row.status_emoji) || (until !== undefined && until <= now)) return {};
  return {
    ...(row.status_text && { statusText: row.status_text }),
    ...(row.status_emoji && { statusEmoji: row.status_emoji }),
    ...(until !== undefined && { statusUntil: until }),
  };
}

export function toUser(row: MemberRow): User {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    role: row.kind === "bot" ? "bot" : row.role,
    status: statusOf(row),
    ...customStatus(row),
    ...(row.avatar_url && { avatarUrl: row.avatar_url }),
    ...(row.bio && { bio: row.bio }),
    ...(row.poster_url && { posterUrl: row.poster_url }),
    ...(row.kind === "user" && !row.discoverable && { unlisted: true as const }),
  };
}

/** Send everyone someone's current record (presence or status changed). */
export function publishUser(userId: string) {
  const row = members.get(userId);
  if (row) io.emit("user:update", toUser(row));
}

// Custom statuses that clear themselves: everyone gets the cleared record then.
export const statusTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleStatusEnd(row: MemberRow) {
  clearTimeout(statusTimers.get(row.id));
  statusTimers.delete(row.id);
  if (!row.status_expires_at) return;
  const delay = Date.parse(row.status_expires_at) - Date.now();
  if (delay <= 0 || delay > 2 ** 31 - 1) return;
  statusTimers.set(row.id, setTimeout(() => {
    statusTimers.delete(row.id);
    publishUser(row.id);
  }, delay).unref());
}

/** Make sure we know everyone these messages refer to (authors, mentions, pinners, repliers). */
export async function usersFor(list: Message[]): Promise<User[]> {
  const ids = new Set<string>();
  for (const message of list) {
    if (message.authorId) ids.add(message.authorId);
    if (message.pinned?.by) ids.add(message.pinned.by);
    for (const id of message.thread?.participants ?? []) ids.add(id);
    for (const a of message.attachments ?? []) {
      if (a.type === "mention") ids.add(a.userId);
      // Who a forwarded message was originally from.
      if (a.type === "forward" && a.authorId) ids.add(a.authorId);
    }
    // Who a kick or ban notice is about.
    if (message.system && "memberId" in message.system) ids.add(message.system.memberId);
  }
  return usersByIds(ids);
}

/** Users by id, loading any we don't know yet. Unknown ids are skipped. */
export async function usersByIds(ids: Iterable<string>): Promise<User[]> {
  const missing = [...ids].filter((id) => !members.has(id));
  if (missing.length > 0) {
    const { data } = await db.from("members").select(MEMBER_SELECT).in("id", missing);
    for (const raw of data ?? []) {
      const row = toMemberRow(raw);
      members.set(row.id, row);
    }
  }
  return [...ids].flatMap((id) => {
    const row = members.get(id);
    return row ? [toUser(row)] : [];
  });
}

export function touchLastSeen(userId: string) {
  void db.from("members").update({ last_seen_at: new Date().toISOString() }).eq("id", userId)
    .then(({ error }) => error && console.error("last_seen update failed:", error.message));
}
