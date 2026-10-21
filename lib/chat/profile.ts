import type { User as SupabaseUser } from "@supabase/supabase-js";
import { AVATAR_COLORS, MAX_NAME_LENGTH, type Member, type User } from "./types";

/**
 * Users as they appear inside one group: members' group profiles replace
 * their app-wide name, photo and bio. Returns `users` itself when nothing changes.
 */
export function withGroupProfiles(users: Record<string, User>, members: Member[] | undefined) {
  const overrides = (members ?? []).filter((m) => m.profile && users[m.user.id]);
  if (overrides.length === 0) return users;
  const next = { ...users };
  for (const { user, profile } of overrides) {
    next[user.id] = {
      ...users[user.id],
      ...(profile!.displayName && { name: profile!.displayName }),
      ...(profile!.avatarUrl && { avatarUrl: profile!.avatarUrl }),
      ...(profile!.bio && { bio: profile!.bio }),
    };
  }
  return next;
}

/**
 * Profile photo setting for signed-in users, stored as
 * user_metadata.profile_avatar: "default" (the photo from their sign-in provider), "none", or a URL.
 */
export type PhotoChoice = "default" | "none" | string;

export type Profile = {
  name: string;
  color?: string;
  /** The photo actually shown (after applying the choice). */
  avatarUrl?: string;
  photo: PhotoChoice;
  /** Signed-in users only: the photo from the account they sign in with (Google, Facebook…). */
  providerAvatar?: string;
  /** user_metadata.profile_bio. */
  bio?: string;
  /** Cover photo URL, user_metadata.profile_poster. */
  posterUrl?: string;
};

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isAvatarColor(value: unknown): value is string {
  return typeof value === "string" && AVATAR_COLORS.includes(value);
}

/**
 * Mirrors verifyAccessToken in server.mts. The server's copy (from the verified
 * token) is what everyone sees; this one drives the UI and re-joins.
 */
export function profileFromUser(user: SupabaseUser): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    str(meta.display_name) ?? str(meta.full_name) ?? str(meta.name) ?? user.email?.split("@")[0] ?? "Member";
  const providerAvatar = str(meta.avatar_url);
  const photo: PhotoChoice = str(meta.profile_avatar) ?? "default";
  const avatarUrl = photo === "none" ? undefined : photo === "default" ? providerAvatar : photo;
  return {
    name: name.replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH),
    color: isAvatarColor(meta.avatar_color) ? meta.avatar_color : undefined,
    avatarUrl,
    photo,
    providerAvatar,
    bio: str(meta.profile_bio),
    posterUrl: str(meta.profile_poster),
  };
}
