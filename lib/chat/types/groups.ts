import type { GroupBot } from "./bots";
import type { Message } from "./messages";
import type { MemberRole, RolePermission } from "./permissions";
import type { User } from "./users";

export type GroupType =
  | "text"
  | "announcement"
  | "wiki"
  /** Picking it joins its call; its messages are the chat beside the call. */
  | "voice";

export type Subgroup = {
  id: string;
  groupId: string;
  name: string;
  topic?: string;
  type: GroupType;
  /** Sidebar section within the group; uncategorized channels are listed first. */
  category?: string;
  /** Slow mode: seconds between each member's messages (moderators exempt); absent when off. */
  slowMode?: number;
};

/**
 * Public groups are listed for everyone and anyone (not banned) can join.
 * Private groups are only listed for their members and need an invite to join.
 */
export type GroupVisibility = "public" | "private";

export type Group = {
  id: string;
  name: string;
  color: string;
  subgroups: Subgroup[];
  type: GroupType;
  /** Absent means public. */
  visibility?: GroupVisibility;
  /** What the group is about, shown on its discover card. */
  description?: string;
  /** You're invited to this private group but haven't joined: `subgroups` is empty until you do. */
  invited?: true;
  /**
   * Your role in it; absent when you're not a member. The sidebar lists only
   * the groups you're in (and invites); public ones you're not in can still be
   * previewed from Discover.
   */
  role?: MemberRole;
  /**
   * "dm": a direct message, a private conversation with one channel between
   * `members` (fixed when it's started). Absent for ordinary groups.
   */
  kind?: "dm";
  /** Direct messages only: everyone in the conversation, you included. */
  members?: string[];
  /** The group's custom emoji, used as :name: in messages and reactions. */
  emoji?: CustomEmoji[];
  /** The group's bots and the slash commands they answer. */
  bots?: GroupBot[];
  /** The group's custom roles, in the order they're listed (the first one you hold colors your name). */
  roles?: GroupRole[];
  /** The custom roles you hold here (ids); absent when none. */
  customRoles?: string[];
};

/**
 * A custom role: a name and color members can be given, granting some extra
 * permissions on top of their rank (see Standing in permissions.ts).
 */
export type GroupRole = { id: string; name: string; color: string; permissions: RolePermission[] };

export type GroupRoleDraft = { name: string; color: string; permissions: RolePermission[] };

export const MAX_GROUP_ROLES = 20;

export const MAX_ROLE_NAME_LENGTH = 32;

/** What each grantable permission lets a role's members do, as shown when picking them. */
export const ROLE_PERMISSION_LABELS: Record<RolePermission, { label: string; description: string }> = {
  "MESSAGE:PIN": { label: "Pin messages", description: "Pin and unpin messages in any channel." },
  "MESSAGE:ANNOUNCE": { label: "Post announcements", description: "Post in announcement channels, not just reply in threads." },
  "MESSAGE:MANAGE": { label: "Remove messages", description: "Remove plain members' messages, review reports, and skip slow mode and blocked words." },
  "MEMBER:INVITE": { label: "Invite people", description: "Invite people by name and make invite links." },
  "MEMBER:MUTE": { label: "Mute members", description: "Mute and unmute plain members." },
  "MEMBER:KICK": { label: "Remove members", description: "Remove plain members from the group (they can rejoin)." },
  "GROUP:MANAGE": { label: "Manage channels", description: "Create, edit, arrange and delete channels, and manage emoji, bots and webhooks." },
  "GROUP:AUDIT": { label: "View the moderation log", description: "See who moderated what here." },
};

/** Your name's color in the group: your first custom role's (in the group's order), if you hold any. */
export function roleColor(roles: GroupRole[] | undefined, held: string[] | undefined) {
  if (!held?.length) return undefined;
  return roles?.find((role) => held.includes(role.id))?.color;
}

/** A group's custom emoji: an uploaded image used as :name:. */
export type CustomEmoji = { name: string; url: string };

export const MAX_CUSTOM_EMOJI = 50;
const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;

/** Whether `name` can name a custom emoji: 2–32 lowercase letters, digits or underscores. */
export function isEmojiName(name: string) {
  return EMOJI_NAME.test(name);
}

/** The emoji name in a ":name:" reaction, if that's what it is. */
export function customEmojiName(reaction: string) {
  const match = /^:([a-z0-9_]{2,32}):$/.exec(reaction);
  return match?.[1];
}

/** An incoming webhook: a secret URL that posts into one channel as a bot. */
export type Webhook = { id: string; subgroupId: string; name: string; createdAt: number; createdBy?: string };

/** The URL a webhook posts to (shown once, when it's made: only a hash of the token is kept). */
export function webhookUrl(origin: string, id: string, token: string) {
  return `${origin}/api/webhooks/${id}/${token}`;
}

/** Most people in one direct message, its starter included. */
export const MAX_DM_MEMBERS = 9;

export function isDm(group: Pick<Group, "kind">) {
  return group.kind === "dm";
}

/** What a direct message is called: the other people in it, by name. */
export function dmName(group: Pick<Group, "members">, users: Record<string, User>, selfId: string) {
  const others = (group.members ?? []).filter((id) => id !== selfId);
  if (others.length === 0) return users[selfId]?.name ?? "Just you";
  return others.map((id) => users[id]?.name ?? "Unknown user").join(", ");
}

/**
 * How much a channel notifies you: every message, only mentions and replies
 * to you, or nothing. Set per group and per channel.
 */
export type NotificationLevel = "all" | "mentions" | "none";

/** Your level for a channel: its own setting, else its group's, else the default (DMs: all; groups: mentions). */
export function notificationLevel(
  settings: Record<string, NotificationLevel>,
  group: Pick<Group, "id" | "kind">,
  subgroupId: string,
): NotificationLevel {
  return settings[subgroupId] ?? settings[group.id] ?? (isDm(group) ? "all" : "mentions");
}

/** Why you're notified: mentioned, replied to, a reply in a thread you're in, a direct message, or a channel set to "all". */
export type NotifyReason = "mention" | "reply" | "thread" | "dm" | "message";

export type Notify = { message: Message; reason: NotifyReason; groupId: string };

/** In your sidebar: you're in it, or invited to it. */
export function isMine(group: Pick<Group, "role" | "invited">) {
  return Boolean(group.role || group.invited);
}

/** A ban from one group. */
export type GroupBan = {
  user: User;
  reason?: string;
  /** When it ends (ms); absent when permanent. */
  until?: number;
  /** When it was made (ms). */
  at: number;
  /** Who banned them (a member id), if they still exist. */
  by?: string;
};

/**
 * A public group's stats on the discover page. Its name, description and
 * channels come from the group list, and its last activity from the latest messages.
 */
export type DiscoverGroup = {
  id: string;
  /** Absent if they couldn't be counted. */
  memberCount?: number;
  /** People online in it: its members with an open session, plus anyone looking at one of its channels. */
  onlineCount: number;
  /** You're a member. */
  joined: boolean;
};

export type DiscoverPage = {
  groups: DiscoverGroup[];
  /** Messages with events that haven't ended, in public groups, soonest first. */
  events: Message[];
  /** Everyone the events refer to. */
  users: User[];
};

/** `description`: blank clears it; absent leaves it as it is. */
export type GroupDraft = {
  name: string;
  color: string;
  visibility?: GroupVisibility;
  description?: string;
  /** Editing only: words members' messages can't contain (see cleanBlockedWords); absent leaves them as they are. */
  blockedWords?: string[];
};

export type ChannelDraft = {
  groupId: string;
  name: string;
  topic?: string;
  type: GroupType;
  category?: string;
  /** Seconds (one of SLOW_MODES); 0 or absent turns it off. */
  slowMode?: number;
};

export const MAX_GROUP_NAME_LENGTH = 64;

export const MAX_GROUP_DESCRIPTION_LENGTH = 200;

export const MAX_CHANNEL_NAME_LENGTH = 64;

export const MAX_TOPIC_LENGTH = 200;

export const MAX_CATEGORY_LENGTH = 40;

/** Channel names keep their case and spaces, like "#Game Night" (mirrored in server.mts). */
export function cleanChannelName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_CHANNEL_NAME_LENGTH)
    .trim();
}

/**
 * A shareable link that lets anyone who opens it join the group (private ones
 * too), until it expires, runs out of uses or is revoked. Moderators and up
 * create and revoke them.
 */
export type InviteLink = {
  code: string;
  groupId: string;
  /** Who made it, if they still exist. */
  createdBy?: string;
  createdAt: number;
  /** When it stops working (ms); absent: never. */
  expiresAt?: number;
  /** How many people can join with it; absent: unlimited. */
  maxUses?: number;
  uses: number;
};

/** What someone opening an invite link sees before joining. */
export type InvitePreview = {
  code: string;
  group: Pick<Group, "id" | "name" | "color" | "visibility"> & Partial<Pick<Group, "description">>;
  /** Absent if it couldn't be counted. */
  memberCount?: number;
  /** You're already in it. */
  joined: boolean;
};

/** Joining by link: the group, and the channel to open. */
export type RedeemResult = { ok: true; groupId: string; subgroupId?: string } | { ok: false; error: string };

export type InviteLinkResult = { ok: true; link: InviteLink } | { ok: false; error: string };

/** The page path an invite link opens (the app reads the code from it). */
export function inviteUrl(origin: string, code: string) {
  return `${origin}/?invite=${encodeURIComponent(code)}`;
}
