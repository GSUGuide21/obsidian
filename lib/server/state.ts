// What the server keeps in memory, and the shapes of the rows it reads. Supabase is the source of truth.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import type { Socket } from "socket.io";
import type {
  Attachment,
  ClientToServerEvents,
  Group,
  Message,
  ObsidianSettings,
  Presence,
  ServerToClientEvents,
  Subgroup,
  SystemEvent,
} from "../chat/types";
import type { CommandInfo } from "../commands/types.ts";
import { DEFAULT_SETTINGS } from "./constants.ts";
import { colorFor } from "./identity.ts";

export type SocketData = {
  userId?: string;
  /** The group whose channel it's looking at (see the "view" event). */
  viewing?: string;
  /** Its tab has been idle for a while (see "presence:idle"). */
  idle?: boolean;
};

export type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// ---------------------------------------------------------------------------
// Data. Supabase is the source of truth; memory holds channels (rarely
// change), the latest message per channel, known members and who's online.
// ---------------------------------------------------------------------------

/** How someone looks: their `profiles` row. */
export type ProfileRow = {
  color: string;
  avatar_url: string | null;
  bio: string | null;
  poster_url: string | null;
};

/**
 * What someone picked for themselves: also in their `profiles` row, but only
 * ever set by "status:set" and "privacy:set" (never by profile syncing).
 */
export type StatusRow = {
  presence: Presence;
  status_text: string | null;
  status_emoji: string | null;
  status_expires_at: string | null;
  /** Whether "Seen by" includes them (and shows them others). */
  read_receipts: boolean;
};

export const STATUS_COLUMNS = "presence, status_text, status_emoji, status_expires_at, read_receipts";

/** A `members` row joined with its profile (kept flat in memory). */
export type MemberRow = ProfileRow & StatusRow & {
  id: string;
  kind: "user" | "guest" | "bot";
  name: string;
  role: "member" | "admin";
};

/** Members with their profile embedded (profiles.member_id is a one-to-one foreign key). */
export const MEMBER_SELECT = `id, kind, name, role, profile:profiles(color, avatar_url, bio, poster_url, ${STATUS_COLUMNS})`;

export function toStatusRow(raw: Partial<StatusRow> | null | undefined): StatusRow {
  return {
    presence: isPresence(raw?.presence) ? raw.presence : "online",
    status_text: raw?.status_text ?? null,
    status_emoji: raw?.status_emoji ?? null,
    status_expires_at: raw?.status_expires_at ?? null,
    read_receipts: raw?.read_receipts !== false,
  };
}

/** Whether "Seen by" counts this member (members not loaded yet count as on, the default). */
export function sharesReads(userId: string) {
  return members.get(userId)?.read_receipts !== false;
}

export function isPresence(value: unknown): value is Presence {
  return value === "online" || value === "away" || value === "dnd" || value === "invisible";
}

/** Flatten a row selected with MEMBER_SELECT. Members without a profile row get defaults. */
export function toMemberRow(raw: Record<string, unknown>): MemberRow {
  const embedded = raw.profile as (ProfileRow & StatusRow) | (ProfileRow & StatusRow)[] | null;
  const profile = Array.isArray(embedded) ? embedded[0] : embedded;
  const id = raw.id as string;
  return {
    id,
    kind: raw.kind as MemberRow["kind"],
    name: raw.name as string,
    role: raw.role === "admin" ? "admin" : "member",
    color: profile?.color ?? colorFor(id),
    avatar_url: profile?.avatar_url ?? null,
    bio: profile?.bio ?? null,
    poster_url: profile?.poster_url ?? null,
    ...toStatusRow(profile),
  };
}

export type MessageRow = {
  id: string;
  channel_id: string;
  author_id: string | null;
  body: string;
  attachments: Attachment[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  thread_id: string | null;
  thread_count: number;
  thread_last_at: string | null;
  thread_participants: string[] | null;
  pinned_at: string | null;
  pinned_by: string | null;
  deleted_by: string | null;
  system: SystemEvent | null;
};

export let groups: Group[] = [];

export let settings: ObsidianSettings = { ...DEFAULT_SETTINGS };

export const channels = new Map<string, Subgroup>();

/** Each group's blocked words (see cleanBlockedWords), for groups that have any. */
export const blockedWords = new Map<string, string[]>();

/** A `group_bots` row (see the group bots section below). */
export type BotRow = {
  id: string;
  group_id: string;
  name: string;
  url: string;
  secret: string;
  commands: CommandInfo[];
  created_by: string | null;
  created_at: string;
};

export const BOT_COLUMNS = "id, group_id, name, url, secret, commands, created_by, created_at";

/** Each group's bots, for groups that have any. */
export const botsByGroup = new Map<string, BotRow[]>();

/** The member a group bot posts as. */
export const botMemberId = (id: string) => `bot-${id}`;

export const latest = new Map<string, Message>();

/** Every member this process knows about, keyed by id (presence in `connections`). */
export const members = new Map<string, MemberRow>();

/** Open sockets per member id. */
export const connections = new Map<string, number>();

/** Idle sockets per member id: they show as away while all their sockets are idle. */
export const idleSockets = new Map<string, number>();

// Other modules can read `groups` and `settings` but not assign them (they're imports there).

/** Groups and channels were (re)loaded (see loadStructure). */
export function setGroups(next: Group[]) {
  groups = next;
}

/** Instance settings were loaded, or changed by an app-wide admin. */
export function setSettings(next: ObsidianSettings) {
  settings = next;
}
