// The discover page: public groups with their stats, and upcoming events.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Attachment, DiscoverGroup, Message } from "../chat/types";
import { accessByMember, listedGroups, noAccess } from "./access.ts";
import { DISCOVER_DEBOUNCE, DISCOVER_EVENTS } from "./constants.ts";
import { db } from "./db.ts";
import { toMessage } from "./messages.ts";
import { io } from "./sockets.ts";
import { connections, groups, type MessageRow } from "./state.ts";
import { usersFor } from "./users.ts";

// ---------------------------------------------------------------------------
// Discover page: public groups with their stats, and upcoming events. Sockets
// showing it are in DISCOVER_ROOM and get a fresh page shortly after member
// counts, presence or events change. Each socket also says which channel it's
// looking at, so people reading a group without joining count as online in it.
// ---------------------------------------------------------------------------

export const DISCOVER_ROOM = "discover";

export let discoverTimer: ReturnType<typeof setTimeout> | undefined;

/** Something on the discover page changed: send everyone watching it a new one (batched). */
export function discoverChanged() {
  if (discoverTimer || !io.sockets.adapter.rooms.get(DISCOVER_ROOM)?.size) return;
  discoverTimer = setTimeout(() => {
    discoverTimer = undefined;
    void pushDiscover();
  }, DISCOVER_DEBOUNCE).unref();
}

export async function pushDiscover() {
  const watchers = [...io.sockets.sockets.values()].filter((s) => s.rooms.has(DISCOVER_ROOM));
  if (watchers.length === 0) return;
  const shared = await discoverShared();
  for (const socket of watchers) socket.emit("discover:update", await discoverPage(socket.data.userId, shared));
}

/** What every watcher's page is made from: counts and events for all public groups. */
export async function discoverShared() {
  const publicGroups = groups.filter((g) => g.visibility !== "private");
  const [counts, events] = await Promise.all([
    db.rpc("group_member_counts"),
    upcomingEvents(publicGroups.flatMap((g) => g.subgroups.map((s) => s.id))),
  ]);
  if (counts.error) console.error("member counts failed:", counts.error.message);
  const memberCounts = counts.error ? undefined : new Map(
    ((counts.data ?? []) as { group_id: string; members: number }[]).map((row) => [row.group_id, Number(row.members)]),
  );
  // Online in a group: its members with an open session, plus anyone looking at it.
  const online = new Map(publicGroups.map((g) => [g.id, new Set<string>()]));
  for (const userId of connections.keys()) {
    for (const groupId of accessByMember.get(userId)?.groups.keys() ?? []) online.get(groupId)?.add(userId);
  }
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId && socket.data.viewing) online.get(socket.data.viewing)?.add(socket.data.userId);
  }
  return { memberCounts, online, events };
}

/** One person's page: the public groups they can see, and those groups' events. */
export async function discoverPage(userId: string | undefined, shared: Awaited<ReturnType<typeof discoverShared>>) {
  const access = (userId && accessByMember.get(userId)) || noAccess;
  const listed = listedGroups(userId).filter((g) => g.visibility !== "private");
  const channelIds = new Set(listed.flatMap((g) => g.subgroups.map((s) => s.id)));
  const events = shared.events.filter((m) => channelIds.has(m.subgroupId));
  return {
    groups: listed.map((group): DiscoverGroup => ({
      id: group.id,
      ...(shared.memberCounts && { memberCount: shared.memberCounts.get(group.id) ?? 0 }),
      onlineCount: shared.online.get(group.id)?.size ?? 0,
      joined: access.groups.has(group.id),
    })),
    events,
    users: await usersFor(events),
  };
}

/** Messages in these channels with an event that hasn't ended, soonest first. */
export async function upcomingEvents(channelIds: string[]): Promise<Message[]> {
  if (channelIds.length === 0) return [];
  const { data, error } = await db.rpc("upcoming_event_messages", { p_channels: channelIds, p_limit: DISCOVER_EVENTS });
  if (error) {
    console.error("upcoming events query failed:", error.message);
    return [];
  }
  return (data as MessageRow[]).map(toMessage);
}

export function hasEvent(attachments: Attachment[] | undefined) {
  return attachments?.some((a) => a.type === "event") ?? false;
}
