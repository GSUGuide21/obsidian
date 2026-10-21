// Who can do what: group creation, memberships, bans, invites, and each member's access, cached while they're connected.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Group, Member, MemberProfile, MemberRole, NotificationLevel, ObsidianSettings, Permission, Standing, Subgroup } from "../chat/types";
import { allows, canView, grantedBy, hasPermission, isMemberRole, isMuted, letsIn, outranks } from "../chat/types/permissions.ts";
import { MAX_INSTANCE_NAME_LENGTH, MAX_NOTICE_LENGTH } from "./constants.ts";
import { db } from "./db.ts";
import { discoverChanged } from "./discover.ts";
import { limiter } from "./limits.ts";
import { io } from "./sockets.ts";
import { channels, groups, members, type ChatSocket, type MemberRow } from "./state.ts";
import { toUser } from "./users.ts";

// ---------------------------------------------------------------------------
// Groups and channels. Signed-in users create groups and own them; each
// group's owner and admins manage it and its channels (see canManage), and
// app-wide admins manage everything. Mirrors the limits in lib/chat/types/groups.ts.
// ---------------------------------------------------------------------------

export const CHANNEL_TYPES = new Set(["text", "announcement", "wiki", "voice", "forum"]);

export const MANAGE_CHANNELS_ERROR = "Only the group's owner and admins can manage its channels.";

// Bursts of 3 new groups, then one every 10 minutes (app-wide admins aren't limited).
export const canCreate = limiter(3, 1 / 600);

export function isAdmin(userId: string | undefined) {
  return Boolean(userId) && members.get(userId!)?.role === "admin";
}

/** Signed-in users and app-wide admins create groups; guests and bots don't. */
export function canCreateGroup(userId: string) {
  return isAdmin(userId) || members.get(userId)?.kind === "user";
}

// Group member permissions (roles, flags and the guards on them, such as
// canBan or canMute) come from lib/chat/types/permissions.ts, imported at the
// top: the same rules the client uses to hide actions.

// ---------------------------------------------------------------------------
// Group access: each member's memberships, bans and invites, loaded when they
// join a session (or are first acted on) and kept up to date by the member:*
// handlers. Each group's sockets share a room, so channel events only reach
// people who can see the group.
// ---------------------------------------------------------------------------

export type Membership = {
  role: MemberRole;
  mutedUntil?: number;
  profile?: MemberProfile;
  /** Where the group sits in their sidebar; absent until they place it. */
  position?: number;
  /** When they joined (ms), which orders the groups they haven't placed. */
  joinedAt?: number;
  /** The group's custom roles they hold (ids). */
  roles?: string[];
};

export type Access = {
  /** Group id → membership. */
  groups: Map<string, Membership>;
  /** Group id → ban expiry (ms), null when permanent. */
  bans: Map<string, number | null>;
  /** Private groups this member was invited to. */
  invites: Set<string>;
  /** Their notification settings, by group or channel id. */
  notifications: Map<string, NotificationLevel>;
  /** People they've blocked. */
  blocked: Set<string>;
};

export const accessByMember = new Map<string, Access>();

export const noAccess: Access = {
  groups: new Map(),
  bans: new Map(),
  invites: new Set(),
  notifications: new Map(),
  blocked: new Set(),
};

/** Whether either of them blocked the other (their access must be loaded). */
export function eitherBlocked(a: string, b: string) {
  return Boolean(accessByMember.get(a)?.blocked.has(b) || accessByMember.get(b)?.blocked.has(a));
}

export function isNotificationLevel(value: unknown): value is NotificationLevel {
  return value === "all" || value === "mentions" || value === "none";
}

export const MEMBERSHIP_COLUMNS = "role, muted_until, display_name, avatar_url, bio, position, joined_at, roles";

export type MembershipRow = {
  role: string;
  muted_until: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  position: number | null;
  joined_at: string;
  roles: string[] | null;
};

export function toMembership(row: MembershipRow): Membership {
  const profile: MemberProfile = {
    ...(row.display_name && { displayName: row.display_name }),
    ...(row.avatar_url && { avatarUrl: row.avatar_url }),
    ...(row.bio && { bio: row.bio }),
  };
  return {
    role: isMemberRole(row.role) ? row.role : "member",
    ...(row.muted_until && { mutedUntil: Date.parse(row.muted_until) }),
    ...(Object.keys(profile).length > 0 && { profile }),
    ...(row.position !== null && { position: row.position }),
    joinedAt: Date.parse(row.joined_at),
    ...(row.roles?.length && { roles: row.roles }),
  };
}

// Timed bans lift on their own: when one ends, the member's access is
// refreshed so the group reappears without reconnecting. Keyed "group:member".
export const banTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const MAX_TIMER = 2 ** 31 - 1;

 // ~24.8 days; longer bans lift on the next reconnect

export function scheduleBanEnd(groupId: string, userId: string, until: number | null) {
  const key = `${groupId}:${userId}`;
  clearTimeout(banTimers.get(key));
  banTimers.delete(key);
  const delay = until === null ? Infinity : until - Date.now();
  if (delay <= 0 || delay > MAX_TIMER) return;
  banTimers.set(key, setTimeout(() => {
    banTimers.delete(key);
    refreshAccess(userId);
  }, delay).unref());
}

/**
 * Load someone's access. `keep: false` returns it without caching it (for
 * people with no session, e.g. checking whether to push to them), so the
 * cache only holds people who are connected or being acted on.
 */
export async function loadAccess(userId: string, keep = true): Promise<Access> {
  const [memberRows, banRows, inviteRows, notificationRows, blockRows] = await Promise.all([
    db.from("group_members").select(`group_id, ${MEMBERSHIP_COLUMNS}`).eq("member_id", userId),
    db.from("group_bans").select("group_id, until").eq("member_id", userId),
    db.from("group_invites").select("group_id").eq("member_id", userId),
    db.from("notification_settings").select("target_id, level").eq("member_id", userId),
    db.from("member_blocks").select("blocked_id").eq("member_id", userId),
  ]);
  const error = memberRows.error ?? banRows.error ?? inviteRows.error ?? notificationRows.error ?? blockRows.error;
  if (error) throw new Error(`Couldn't load group access: ${error.message}`);
  const access: Access = {
    groups: new Map(memberRows.data!.map((row) => [row.group_id, toMembership(row)])),
    bans: new Map(banRows.data!.map((row) => [row.group_id, row.until ? Date.parse(row.until) : null])),
    invites: new Set(inviteRows.data!.map((row) => row.group_id)),
    notifications: new Map(
      notificationRows.data!.flatMap((row) => (isNotificationLevel(row.level) ? [[row.target_id, row.level]] : [])),
    ),
    blocked: new Set(blockRows.data!.map((row) => row.blocked_id)),
  };
  if (!keep) return access;
  accessByMember.set(userId, access);
  for (const [groupId, until] of access.bans) scheduleBanEnd(groupId, userId, until);
  return access;
}

/** Cached access for a member (everyone with an open session is cached). */
export async function accessOf(userId: string) {
  return accessByMember.get(userId) ?? loadAccess(userId);
}

export function findGroup(groupId: unknown) {
  return typeof groupId === "string" ? groups.find((g) => g.id === groupId) : undefined;
}

export function isBanned(access: Access, groupId: string, now = Date.now()) {
  if (!access.bans.has(groupId)) return false;
  const until = access.bans.get(groupId)!;
  return until === null || until > now;
}

/**
 * Their role in the group. App-wide admins act as (at least) group admins
 * everywhere, except in direct messages, which nobody moderates.
 */
export function roleIn(groupId: string, userId: string): MemberRole | undefined {
  const role = (accessByMember.get(userId) ?? noAccess).groups.get(groupId)?.role;
  if (findGroup(groupId)?.kind === "dm") return role;
  if (isAdmin(userId) && (!role || outranks("admin", role))) return "admin";
  return role;
}

/**
 * Whether they can read the group's channels. Sockets without a session only
 * see public groups; direct messages only their participants (admins included).
 */
export function canAccess(group: Group, userId: string | undefined, access = (userId && accessByMember.get(userId)) || noAccess) {
  if (group.kind === "dm") return Boolean(userId && access.groups.has(group.id));
  if (!userId) return group.visibility !== "private";
  if (isAdmin(userId)) return true;
  if (isBanned(access, group.id)) return false;
  return canView(group.visibility, access.groups.has(group.id));
}

/**
 * Whether a private channel lets them in (public ones let in everyone who can
 * read the group): the group's owner, admins and moderators, whoever a
 * custom role lets manage its channels, app-wide admins, and the roles and
 * members it names (see letsIn). Takes their access so it works for people without a
 * session too (e.g. deciding whether to push to them).
 */
export function channelAllows(channel: Subgroup, userId: string | undefined, access: Access = (userId && accessByMember.get(userId)) || noAccess) {
  if (!channel.access) return true;
  if (!userId) return false;
  if (isAdmin(userId)) return true;
  return letsIn(channel.access, userId, access.groups.get(channel.groupId), findGroup(channel.groupId)?.roles);
}

/** Whether they can read the channel: its group, and (when it's private) the channel itself. */
export function canSeeChannel(channel: Subgroup, userId: string | undefined, access: Access = (userId && accessByMember.get(userId)) || noAccess) {
  const group = findGroup(channel.groupId);
  return Boolean(group && canAccess(group, userId, access) && channelAllows(channel, userId, access));
}

/** The group's channels they can read (all of them, unless some are private). */
export function visibleChannels(group: Group, userId: string | undefined, access: Access = (userId && accessByMember.get(userId)) || noAccess) {
  return group.subgroups.filter((channel) => channelAllows(channel, userId, access));
}

/** The channel, if it exists and they can read it. */
export function channelFor(channelId: unknown, userId: string | undefined) {
  const channel = typeof channelId === "string" ? channels.get(channelId) : undefined;
  return channel && canSeeChannel(channel, userId) ? channel : undefined;
}

/**
 * The groups they're sent: the ones they can read (with their role in the ones
 * they're in) and private groups they're invited to (without channels). Their
 * own groups come first, in their order; the sidebar lists only those and invites.
 */
export function listedGroups(userId: string | undefined): Group[] {
  const access = (userId && accessByMember.get(userId)) || noAccess;
  const listed = groups.flatMap((group): Group[] => {
    const membership = access.groups.get(group.id);
    if (canAccess(group, userId)) {
      // Private channels only reach those they let in.
      const subgroups = visibleChannels(group, userId, access);
      const shown = subgroups.length === group.subgroups.length ? group : { ...group, subgroups };
      if (!membership) return [shown];
      return [{ ...shown, role: membership.role, ...(membership.roles?.length && { customRoles: membership.roles }) }];
    }
    if (access.invites.has(group.id) && !isBanned(access, group.id)) return [{ ...group, subgroups: [], invited: true }];
    return [];
  });
  // Placed groups by position, then unplaced ones oldest join first, then everything else as it was.
  const rank = (group: Group) => {
    const membership = group.role && access.groups.get(group.id);
    return membership ? [0, membership.position ?? Infinity, membership.joinedAt ?? Infinity] : [1, 0, 0];
  };
  return listed.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
}

/**
 * Their standing in the group: their rank (see roleIn) plus what their custom
 * roles grant. Undefined when they're not in it. Their access must be loaded
 * (see accessOf) for their custom roles to count.
 */
export function standingIn(groupId: string, userId: string | undefined): Standing | undefined {
  const role = userId ? roleIn(groupId, userId) : undefined;
  if (!role) return undefined;
  const group = findGroup(groupId);
  if (group?.kind === "dm") return { role };
  const granted = grantedBy(accessByMember.get(userId!)?.groups.get(groupId)?.roles, group?.roles);
  return granted.length ? { role, granted } : { role };
}

/** Whether their rank or a custom role allows `permission` in the group. */
export function allowedIn(groupId: string, userId: string | undefined, permission: Permission) {
  return allows(standingIn(groupId, userId), permission);
}

/**
 * Who manages a group's channels, emoji, bots and webhooks (owners and
 * admins, and custom roles that grant it; app-wide admins count as group
 * admins everywhere). Nobody manages direct messages.
 */
export function canManage(groupId: string, userId: string | undefined) {
  if (findGroup(groupId)?.kind === "dm") return false;
  return allowedIn(groupId, userId, "GROUP:MANAGE");
}

/** Who changes the group itself (name, color, visibility, description, blocked words): owners and admins, by rank. */
export function canEdit(groupId: string, userId: string | undefined) {
  if (findGroup(groupId)?.kind === "dm") return false;
  return hasPermission(userId ? roleIn(groupId, userId) : undefined, "GROUP:EDIT");
}

export function mutedIn(groupId: string, userId: string) {
  const membership = (accessByMember.get(userId) ?? noAccess).groups.get(groupId);
  return membership && isMuted(membership) ? membership.mutedUntil! : undefined;
}

export const groupRoom = (groupId: string) => `group:${groupId}`;

/** A private channel's own room: only the sockets it lets in. */
export const channelRoom = (channelId: string) => `channel:${channelId}`;

/** The room for a channel's events: its group's, or its own when it's private. */
export function roomFor(channelId: string) {
  const channel = channels.get(channelId);
  return channel?.access ? channelRoom(channelId) : groupRoom(channel?.groupId ?? "");
}

/** Send to everyone who can read the channel. */
export function toChannel(channelId: string) {
  return io.to(roomFor(channelId));
}

/** Put the socket in the rooms of exactly the groups (and private channels) it can read. */
export function syncRooms(socket: ChatSocket) {
  const userId = socket.data.userId;
  for (const group of groups) {
    const readable = canAccess(group, userId);
    if (readable) void socket.join(groupRoom(group.id));
    else void socket.leave(groupRoom(group.id));
    for (const channel of group.subgroups) {
      if (!channel.access) continue;
      if (readable && channelAllows(channel, userId)) void socket.join(channelRoom(channel.id));
      else void socket.leave(channelRoom(channel.id));
    }
  }
  // Rooms of private channels that were deleted or made public.
  for (const room of socket.rooms) {
    if (room.startsWith("channel:") && !channels.get(room.slice("channel:".length))?.access) void socket.leave(room);
  }
}

export function socketsOf(userId: string) {
  return [...io.sockets.sockets.values()].filter((s) => s.data.userId === userId);
}

/** After someone's access changed: update their rooms and send their new group list. */
export function refreshAccess(userId: string) {
  for (const socket of socketsOf(userId)) {
    syncRooms(socket);
    socket.emit("groups:update", listedGroups(userId));
  }
}

export function toMember(row: MemberRow, membership: Membership): Member {
  return {
    user: toUser(row),
    role: membership.role,
    ...(membership.mutedUntil && { mutedUntil: membership.mutedUntil }),
    ...(membership.profile && { profile: membership.profile }),
    ...(membership.roles?.length && { roles: membership.roles }),
  };
}

/** Validated instance settings: `input`'s valid keys over `base`. */
export function cleanSettings(input: Record<string, unknown>, base: ObsidianSettings): ObsidianSettings {
  const next = { ...base };
  if (typeof input.name === "string") {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name && name.length <= MAX_INSTANCE_NAME_LENGTH) next.name = name;
  }
  if (input.notice === null || typeof input.notice === "string") {
    const notice = (input.notice ?? "").trim();
    if (!notice) delete next.notice;
    else if (notice.length <= MAX_NOTICE_LENGTH) next.notice = notice;
  }
  if (typeof input.guestsAllowed === "boolean") next.guestsAllowed = input.guestsAllowed;
  return next;
}

/** Save a membership change in the cache and tell the group. */
export function publishMembership(groupId: string, userId: string, membership: Membership) {
  const access = accessByMember.get(userId);
  const previous = access?.groups.get(groupId);
  access?.groups.set(groupId, membership);
  const row = members.get(userId);
  if (row) io.to(groupRoom(groupId)).emit("member:update", { groupId, member: toMember(row, membership) });
  // Their group list carries their role and custom roles (they decide what they can manage).
  if (previous && (previous.role !== membership.role || String(previous.roles) !== String(membership.roles))) refreshAccess(userId);
}

/** Drop someone from the group (left, kicked or banned): tell the group, then cut their access. */
export function publishRemoval(groupId: string, userId: string) {
  accessByMember.get(userId)?.groups.delete(groupId);
  io.to(groupRoom(groupId)).emit("member:remove", { groupId, userId });
  refreshAccess(userId);
  discoverChanged();
}

/** Join a group as a plain member (explicitly, or by posting in a public group). */
export async function addMember(groupId: string, userId: string) {
  const { error } = await db.from("group_members")
    .upsert({ group_id: groupId, member_id: userId, role: "member" }, { onConflict: "group_id,member_id", ignoreDuplicates: true });
  if (error) return error;
  await db.from("group_invites").delete().eq("group_id", groupId).eq("member_id", userId);
  accessByMember.get(userId)?.invites.delete(groupId);
  // Re-read the row: an upsert that hit an existing membership keeps its role.
  const access = await loadAccess(userId);
  publishMembership(groupId, userId, access.groups.get(groupId) ?? { role: "member" });
  refreshAccess(userId);
  discoverChanged();
  return null;
}
