import type { Group, GroupRole, GroupVisibility } from "./groups";
import type { Member, User } from "./users";

// Who may do what in a group. Each role grants a set of permission flags
// (ROLE_PERMISSIONS); the guards below combine them with the one rule flags
// can't express: you only act on members ranked below you.
//
// The server (server.mts) imports this file and enforces these rules; the
// client uses them to hide actions that would fail. server.mts imports it by
// path under Node's type stripping, so this file may only `import type`, and
// only use syntax that strips cleanly (no enums or namespaces).

/** A member's role within one group. Each group has at most one owner. */
export type MemberRole =
  | "owner"
  | "admin"
  | "moderator"
  | "member";

// ---------------------------------------------------------------------------
// Permission flags, by what they act on. Joining, viewing and leaving aren't
// flags: they depend on a group's visibility, bans and invites, not on a role
// (you have no role in a group before you join it).
// ---------------------------------------------------------------------------
export type MessagePermission =
  /** Read the group's channels. */
  | "MESSAGE:READ"
  /** Post messages and thread replies (unless muted). */
  | "MESSAGE:WRITE"
  /** React and vote in polls. */
  | "MESSAGE:REACT"
  /** Edit your own messages. */
  | "MESSAGE:EDIT"
  /** Delete your own messages. */
  | "MESSAGE:DELETE"
  /** Pin and unpin messages. */
  | "MESSAGE:PIN"
  /** Post top-level messages in announcement channels. */
  | "MESSAGE:ANNOUNCE"
  /** Delete others' messages and manage their events (members ranked below you). */
  | "MESSAGE:MANAGE";

export type MemberPermission =
  /** Invite people (needed to join a private group) and revoke invites. */
  | "MEMBER:INVITE"
  /** Mute members ranked below you, for a while or until unmuted. */
  | "MEMBER:MUTE"
  /** Remove members ranked below you (they can rejoin). */
  | "MEMBER:KICK"
  /** Ban and unban members ranked below you, and see the ban list. */
  | "MEMBER:BAN"
  /** Change the roles of members ranked below you, to a role below your own. */
  | "MEMBER:MANAGE";

export type GroupPermission =
  /** Change the group's name, color, visibility and description. */
  | "GROUP:EDIT"
  /** Create, edit, arrange and delete its channels. */
  | "GROUP:MANAGE"
  /** Delete the group with everything in it. */
  | "GROUP:DELETE"
  /** Make someone else the owner. */
  | "GROUP:TRANSFER"
  /** Read the moderation log. */
  | "GROUP:AUDIT";

export type Permission =
  | MessagePermission
  | MemberPermission
  | GroupPermission
  /** Every permission above. */
  | "ADMINISTRATOR"
  /** The owner of the group, with all permissions. */
  | "OWNER";

const MEMBER: readonly Permission[] = [
  "MESSAGE:READ",
  "MESSAGE:WRITE",
  "MESSAGE:REACT",
  "MESSAGE:EDIT",
  "MESSAGE:DELETE",
];
const MODERATOR: readonly Permission[] = [
  ...MEMBER,
  "MESSAGE:PIN",
  "MESSAGE:MANAGE",
  "MEMBER:INVITE",
  "MEMBER:MUTE",
  "MEMBER:KICK",
];
const ADMIN: readonly Permission[] = [
  ...MODERATOR,
  "MESSAGE:ANNOUNCE",
  "MEMBER:BAN",
  "MEMBER:MANAGE",
  "GROUP:EDIT",
  "GROUP:MANAGE",
  "GROUP:AUDIT",
];
// ADMINISTRATOR grants everything, so only the owner has it: deleting the
// group and transferring it stay the owner's.
const OWNER: readonly Permission[] = [...ADMIN, "GROUP:DELETE", "GROUP:TRANSFER", "ADMINISTRATOR", "OWNER"];

/** What each role may do. Each role has everything the one below it has. */
export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  member: MEMBER,
  moderator: MODERATOR,
  admin: ADMIN,
  owner: OWNER,
};

/** Whether `role` grants `permission` (ADMINISTRATOR grants all). No role (not a member) grants nothing. */
export function hasPermission(role: MemberRole | undefined, permission: Permission) {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes("ADMINISTRATOR") || granted.includes(permission);
}

// ---------------------------------------------------------------------------
// Rank: a member can only act on members ranked below them.
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<MemberRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };

export function outranks(actor: MemberRole, target: MemberRole) {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * Someone's role in a group, from its member list. App-wide admins act as
 * (at least) group admins everywhere except direct messages (`dm`), as on the server.
 */
export function roleOf(members: Member[] | undefined, user: User | undefined, dm = false): MemberRole | undefined {
  if (!user) return undefined;
  const role = members?.find((m) => m.user.id === user.id)?.role;
  if (!dm && user.role === "admin" && (!role || outranks("admin", role))) return "admin";
  return role;
}

/**
 * Your role in a group from its list entry: app-wide admins act as (at least)
 * group admins everywhere except direct messages, as on the server.
 */
export function groupRole(group: Pick<Group, "role" | "kind">, self: Pick<User, "role"> | undefined) {
  if (group.kind !== "dm" && self?.role === "admin" && (!group.role || outranks("admin", group.role))) return "admin";
  return group.role;
}

// ---------------------------------------------------------------------------
// Custom roles: named, colored roles a group defines (see GroupRole) that
// grant some extra permissions on top of a member's rank. Rank still decides
// who acts on whom; powers over others that come from a custom role only
// reach plain members who don't hold that power themselves.
// ---------------------------------------------------------------------------

/** What a custom role can grant. Banning, roles and the group's own settings stay with ranks. */
export type RolePermission =
  | "MESSAGE:PIN"
  | "MESSAGE:ANNOUNCE"
  | "MESSAGE:MANAGE"
  | "MEMBER:INVITE"
  | "MEMBER:MUTE"
  | "MEMBER:KICK"
  | "GROUP:MANAGE"
  | "GROUP:AUDIT";

/** Every permission a custom role can grant, in the order they're offered. */
export const ROLE_PERMISSIONS_GRANTABLE: readonly RolePermission[] = [
  "MESSAGE:PIN",
  "MESSAGE:ANNOUNCE",
  "MESSAGE:MANAGE",
  "MEMBER:INVITE",
  "MEMBER:MUTE",
  "MEMBER:KICK",
  "GROUP:MANAGE",
  "GROUP:AUDIT",
];

export function isRolePermission(value: unknown): value is RolePermission {
  return typeof value === "string" && (ROLE_PERMISSIONS_GRANTABLE as readonly string[]).includes(value);
}

/** Someone's standing in a group: their rank, plus what their custom roles grant (if anything). */
export type Standing = { role: MemberRole; granted?: readonly Permission[] };

/** What the custom roles `held` grant, given the group's roles (ids it no longer has grant nothing). */
export function grantedBy(held: readonly string[] | undefined, roles: readonly GroupRole[] | undefined): Permission[] {
  if (!held?.length || !roles?.length) return [];
  const granted = new Set<Permission>();
  for (const role of roles) if (held.includes(role.id)) role.permissions.forEach((p) => granted.add(p));
  return [...granted];
}

/** Whether their standing allows `permission`, from their rank or a custom role. No standing (not a member) allows nothing. */
export function allows(standing: Standing | undefined, permission: Permission) {
  if (!standing) return false;
  return hasPermission(standing.role, permission) || (standing.granted?.includes(permission) ?? false);
}

/**
 * Whether `actor` may use `permission` on `target` (muting, removing, deleting
 * their messages): by rank, on members ranked below them; or by a custom
 * role, on plain members who don't hold that power too.
 */
export function mayActOn(actor: Standing | undefined, target: Standing, permission: Permission) {
  if (!actor) return false;
  if (hasPermission(actor.role, permission) && outranks(actor.role, target.role)) return true;
  return (
    (actor.granted?.includes(permission) ?? false) &&
    target.role === "member" &&
    !(target.granted?.includes(permission) ?? false)
  );
}

/** Make, edit, delete and hand out custom roles: whoever changes roles (admins and up). */
export function canManageRoles(role: MemberRole | undefined) {
  return hasPermission(role, "MEMBER:MANAGE");
}

/** Give or take custom roles from someone: yourself, or members ranked below you. */
export function canAssignRoles(actor: MemberRole | undefined, target: MemberRole, self: boolean) {
  return canManageRoles(actor) && (self || outranks(actor!, target));
}

/** Whether `value` is a role (clients can send anything). */
export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && Object.hasOwn(ROLE_PERMISSIONS, value);
}

// ---------------------------------------------------------------------------
// Guards: permission flags plus rank.
// ---------------------------------------------------------------------------

/** Remove members ranked below you. */
export function canModerate(actor: MemberRole, target: MemberRole) {
  return hasPermission(actor, "MEMBER:KICK") && outranks(actor, target);
}

/** Mute members ranked below you. */
export function canMute(actor: MemberRole, target: MemberRole) {
  return hasPermission(actor, "MEMBER:MUTE") && outranks(actor, target);
}

/** Delete messages (and manage events) of members ranked below you. */
export function canManageMessages(actor: MemberRole, author: MemberRole) {
  return hasPermission(actor, "MESSAGE:MANAGE") && outranks(actor, author);
}

/** Ban members ranked below you. */
export function canBan(actor: MemberRole, target: MemberRole) {
  return hasPermission(actor, "MEMBER:BAN") && outranks(actor, target);
}

/** Change the role of members ranked below you, to a role below your own. */
export function canSetRole(actor: MemberRole, target: MemberRole, role: MemberRole) {
  return hasPermission(actor, "MEMBER:MANAGE") && outranks(actor, target) && outranks(actor, role);
}

/** Make someone else the owner. */
export function canTransfer(actor: MemberRole, actorId: string, targetId: string) {
  return hasPermission(actor, "GROUP:TRANSFER") && actorId !== targetId;
}

/** See and act on reported messages (whoever can remove others' messages). */
export function canReviewReports(role: MemberRole | undefined) {
  return hasPermission(role, "MESSAGE:MANAGE");
}

/** Read the group's moderation log. */
export function canViewModerationLog(role: MemberRole | undefined) {
  return hasPermission(role, "GROUP:AUDIT");
}

/** Delete the group (app-wide admins can too; the server checks that separately). */
export function canDeleteGroup(role: MemberRole | undefined) {
  return hasPermission(role, "GROUP:DELETE");
}

/** The owner can't leave until they've transferred ownership. */
export function canLeave(role: MemberRole) {
  return role !== "owner";
}

export function isMuted(member: Pick<Member, "mutedUntil">, now = Date.now()) {
  return member.mutedUntil !== undefined && member.mutedUntil > now;
}

/** Invite people to the group (needed to join a private one). */
export function canInvite(actor: MemberRole) {
  return hasPermission(actor, "MEMBER:INVITE");
}

/** Top-level posts in announcement channels; bots post anywhere. */
export function canAnnounce(role: MemberRole | undefined, self: Pick<User, "role"> | undefined) {
  return self?.role === "bot" || hasPermission(role, "MESSAGE:ANNOUNCE");
}

/** Pinning; in a direct message, anyone in it (nobody moderates them). */
export function canPin(role: MemberRole | undefined, dm: boolean) {
  return dm ? role !== undefined : hasPermission(role, "MESSAGE:PIN");
}

/** Banned people can't join; private groups also need an invite. */
export function canJoinGroup(visibility: GroupVisibility | undefined, access: { banned: boolean; invited: boolean }) {
  if (access.banned) return false;
  return visibility !== "private" || access.invited;
}

/** Private groups (and their channels and messages) are hidden from non-members. */
export function canView(visibility: GroupVisibility | undefined, isMember: boolean) {
  return visibility !== "private" || isMember;
}

/**
 * Someone's standing in a group from its member list (see roleOf), with
 * their custom roles. Undefined for people not in it (and unknown users).
 */
export function memberStanding(
  members: Member[] | undefined,
  user: User | undefined,
  group: Pick<Group, "kind" | "roles">,
): Standing | undefined {
  const role = roleOf(members, user, group.kind === "dm");
  if (!role || !user) return undefined;
  const held = members?.find((m) => m.user.id === user.id)?.roles;
  const granted = group.kind === "dm" ? [] : grantedBy(held, group.roles);
  return granted.length ? { role, granted } : { role };
}

/**
 * Your standing in a group from its list entry: your rank (see groupRole) and
 * what your custom roles there grant. Undefined when you're not in it.
 */
export function groupStanding(
  group: Pick<Group, "role" | "kind" | "roles" | "customRoles">,
  self: Pick<User, "role"> | undefined,
): Standing | undefined {
  const role = groupRole(group, self);
  if (!role) return undefined;
  const granted = group.kind === "dm" ? [] : grantedBy(group.customRoles, group.roles);
  return granted.length ? { role, granted } : { role };
}

/**
 * Whether you manage the group's channels, emoji, bots and webhooks
 * (creating, editing, ordering and categorizing channels; the server's
 * canManage uses the same flag): by rank or a custom role. App-wide admins
 * count as group admins. Nobody manages direct messages.
 */
export function canManageGroup(group: Pick<Group, "role" | "kind" | "roles" | "customRoles">, self: Pick<User, "role"> | undefined) {
  if (group.kind === "dm") return false;
  return allows(groupStanding(group, self), "GROUP:MANAGE");
}

/** Whether you change the group itself: its name, color, visibility, description and blocked words (admins and up). */
export function canEditGroup(group: Pick<Group, "role" | "kind">, self: Pick<User, "role"> | undefined) {
  if (group.kind === "dm") return false;
  return hasPermission(groupRole(group, self), "GROUP:EDIT");
}

/**
 * Whether a private channel lets someone in who can read its group: its
 * owner, admins and moderators (by rank, always), anyone a custom role lets
 * manage channels, and the roles and members it names. App-wide admins are
 * let in by the server before this. Public channels (no `access`) let in everyone.
 */
export function letsIn(
  access: { roles: readonly string[]; members: readonly string[] } | undefined,
  userId: string,
  membership: { role: MemberRole; roles?: readonly string[] } | undefined,
  groupRoles: readonly GroupRole[] | undefined,
) {
  if (!access) return true;
  if (!membership) return false;
  // Those who run the group see every channel in it.
  if (membership.role !== "member") return true;
  if (allows({ role: membership.role, granted: grantedBy(membership.roles, groupRoles) }, "GROUP:MANAGE")) return true;
  return access.members.includes(userId) || (membership.roles ?? []).some((role) => access.roles.includes(role));
}
