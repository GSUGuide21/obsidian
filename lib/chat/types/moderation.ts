import type { EventAttachment } from "./attachments";
import type { Group, GroupRole, Subgroup } from "./groups";
import type { Message } from "./messages";
import type { MemberRole } from "./permissions";
import type { User } from "./users";

/** A channel as it was at the time. */
export type ChannelSnapshot = Pick<Subgroup, "id" | "name" | "type"> &
  Partial<Pick<Subgroup, "topic" | "category" | "slowMode" | "disappearAfter">> & {
    /** A forum's tags, by name. */
    tags?: string[];
  };

/** A group's settings as they were at the time. */
export type GroupSnapshot = Pick<Group, "name" | "color"> &
  Partial<Pick<Group, "visibility" | "description">> & { blockedWords?: string[] };

/**
 * A message as it was when a moderator acted on it. Removed messages lose
 * their content, so this copy is the only record of what was said.
 */
export type MessageSnapshot = Pick<Message, "id" | "subgroupId" | "authorId" | "text" | "createdAt"> &
  Partial<Pick<Message, "attachments" | "system" | "threadId">>;

/** What happened, with a snapshot of what it changed. */
export type ModerationRecord =
  /** Removed someone else's message (or a system notice). */
  | { action: "message_remove"; message: MessageSnapshot }
  /** Edited, cancelled or restored someone else's event. */
  | { action: "event_update"; messageId: string; subgroupId: string; before: EventAttachment; after: EventAttachment }
  | { action: "message_pin"; message: MessageSnapshot }
  | { action: "message_unpin"; message: MessageSnapshot }
  /** Muted until `until` (ms); `previousUntil` when they were already muted. */
  | { action: "member_mute"; until: number; previousUntil?: number }
  | { action: "member_unmute"; previousUntil?: number }
  /** Removed from the group; `role` is what they were. */
  | { action: "member_kick"; role: MemberRole }
  /** `until` absent: permanent. `role` absent: they weren't a member. */
  | { action: "member_ban"; role?: MemberRole; reason?: string; until?: number }
  /** The ban that was lifted. */
  | { action: "member_unban"; reason?: string; until?: number; bannedAt?: number }
  | { action: "member_role"; from: MemberRole; to: MemberRole }
  /** Made the target the owner (the actor became an admin). */
  | { action: "owner_transfer" }
  | { action: "member_invite" }
  /** Withdrew someone's invite (declining your own isn't logged). */
  | { action: "invite_revoke" }
  | { action: "channel_create"; channel: ChannelSnapshot }
  /** Changed its name, topic, type or category. */
  | { action: "channel_update"; before: ChannelSnapshot; after: ChannelSnapshot }
  /** Deleted it with all its messages (`messageCount` of them, when they could be counted). */
  | { action: "channel_delete"; channel: ChannelSnapshot; messageCount?: number }
  /**
   * Moved it to another category or group (reordering within a section isn't
   * logged). Between groups, both groups' logs get the entry.
   */
  | {
      action: "channel_move";
      channel: ChannelSnapshot;
      from: { groupId: string; groupName: string; category?: string };
      to: { groupId: string; groupName: string; category?: string };
    }
  /** Made an (empty) category. */
  | { action: "category_create"; name: string }
  /** Renamed a category, with the channels in it. */
  | { action: "category_rename"; from: string; to: string }
  /** Deleted a category; its `channelCount` channels stayed, uncategorized. */
  | { action: "category_delete"; name: string; channelCount: number }
  /** Changed the group's name, color, visibility or description. */
  | { action: "group_update"; before: GroupSnapshot; after: GroupSnapshot }
  /** Made an invite link (see InviteLink). */
  | { action: "invite_link_create"; code: string; expiresAt?: number; maxUses?: number }
  /** Revoked an invite link, after `uses` people joined with it. */
  | { action: "invite_link_revoke"; code: string; uses: number }
  /** Looked at a report and left the message up (removing it logs message_remove instead). */
  | { action: "report_dismiss"; reportId: string; reason?: string; message: MessageSnapshot }
  | { action: "webhook_create"; name: string; subgroupId: string }
  | { action: "webhook_delete"; name: string; subgroupId: string }
  | { action: "bot_add"; name: string; url: string }
  | { action: "bot_remove"; name: string; url: string }
  | { action: "emoji_add"; name: string; url: string }
  | { action: "emoji_remove"; name: string; url: string }
  | { action: "sticker_add"; name: string; url: string }
  | { action: "sticker_remove"; name: string; url: string }
  | { action: "role_create"; role: GroupRole }
  /** Changed a custom role's name, color or permissions. */
  | { action: "role_update"; before: GroupRole; after: GroupRole }
  | { action: "role_delete"; role: GroupRole }
  /** Changed which custom roles the target holds (role names, as they were). */
  | { action: "member_roles"; added: string[]; removed: string[] };

export type ModerationAction = ModerationRecord["action"];

/** One entry in a group's moderation log. */
export type ModerationEntry = ModerationRecord & {
  id: string;
  groupId: string;
  /** Who did it; absent once their account is gone. */
  actorId?: string;
  /** Who it was done to; absent once their account is gone. */
  targetId?: string;
  /** When (ms). */
  at: number;
};

/** A page of the log, newest first, plus everyone it refers to. */
export type ModerationLogPage = {
  entries: ModerationEntry[];
  users: User[];
  /** Older entries exist beyond these. */
  hasMore: boolean;
};

export const MODERATION_LOG_PAGE = 50;

/** A member flagging a message for the group's moderators. */
export type MessageReport = {
  id: string;
  groupId: string;
  messageId: string;
  /** Who reported it; absent once their account is gone. */
  reporterId?: string;
  authorId?: string;
  reason?: string;
  /** The message as it was when reported (it may have been edited or removed since). */
  message: MessageSnapshot;
  at: number;
};

/** Open reports, newest first, plus everyone they refer to. */
export type ReportsPage = { reports: MessageReport[]; users: User[] };

export const MAX_REPORT_REASON_LENGTH = 500;
