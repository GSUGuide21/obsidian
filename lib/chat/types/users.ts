import type { MemberRole } from "./permissions";

/**
 * App-wide role. Admins manage groups and channels and post in announcement
 * channels everywhere; bots post anywhere and are always online.
 */
export type UserRole =
  | "admin"
  | "bot"
  | "member";

/** Presence. Anything but "offline" counts as online (see `isOnline`). */
export type UserStatus =
  | "online"
  | "offline"
  | "away"
  /** Do not disturb. */
  | "dnd";

/**
 * The presence someone picks: shown as their status while they're connected
 * ("invisible" shows them offline). "online" turns "away" while they're idle.
 */
export type Presence = "online" | "away" | "dnd" | "invisible";

export const PRESENCES: Presence[] = ["online", "away", "dnd", "invisible"];
export const MAX_STATUS_TEXT_LENGTH = 80;

export type User = {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /** Custom status, e.g. "🌴 On vacation"; absent when not set or expired. */
  statusText?: string;
  statusEmoji?: string;
  /** When the custom status clears itself (ms); absent when it doesn't. */
  statusUntil?: number;
  /** Avatar background color, one of AVATAR_COLORS. */
  color: string;
  /** Profile picture (e.g. from their sign-in provider). Absent for guests. */
  avatarUrl?: string;
  /** Cover photo for the user's profile. Absent if not set. */
  posterUrl?: string;
  /** The user's bio. Absent if not set. */
  bio?: string;
  /** They've asked not to be found by people outside their groups and conversations (see "people:list"). */
  unlisted?: true;
};

export function isOnline(user: Pick<User, "status">) {
  return user.status !== "offline";
}

/** How someone appears within one group, overriding their app-wide profile. */
export type MemberProfile = {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
};

export type Member = {
  user: User;
  role: MemberRole;
  /** Absent when they use their app-wide profile in this group. */
  profile?: MemberProfile;
  /** Muted until this time (ms). */
  mutedUntil?: number;
  /** The group's custom roles they hold (ids); absent when none. */
  roles?: string[];
};

/** Avatar background colors users can choose from (mirrored in server.mts). */
export const AVATAR_COLORS = [
  "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#2563eb",
  "#65a30d", "#c026d3", "#dc2626", "#0891b2", "#4f46e5",
];

export const MAX_NAME_LENGTH = 32;

/** A page of people you can find (see "people:list"), most recently around first. */
export type PeoplePage = {
  users: User[];
  /** More people match beyond these. */
  hasMore: boolean;
};

/** People per "people:list" page. */
export const PEOPLE_PAGE = 30;
