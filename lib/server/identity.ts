// Who someone is: verifying signed-in users' tokens, and checking the profile fields people send.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import { MAX_BIO_LENGTH, MAX_NAME_LENGTH } from "./constants.ts";
import { supabaseAuth } from "./db.ts";

// ---------------------------------------------------------------------------
// Signed-in users: verify their Supabase access token. The id and name come
// from the verified token, never from what the browser claims.
// ---------------------------------------------------------------------------

export async function verifyAccessToken(token: string) {
  if (token.length > 8192) return null;
  let result;
  try {
    // Throws (rather than returning an error) on some malformed tokens.
    result = await supabaseAuth.auth.getClaims(token);
  } catch {
    return null;
  }
  const { data, error } = result;
  if (error || !data?.claims.sub) return null;
  const claims = data.claims;
  // Profile edits live in our own keys (display_name, avatar_color,
  // profile_avatar) because Google overwrites full_name/avatar_url on sign-in.
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fallback = typeof claims.email === "string" ? claims.email.split("@")[0] : "";
  const rawName = [meta.display_name, meta.full_name, meta.name, fallback].find(
    (v) => typeof v === "string" && v.trim(),
  );
  const name = (rawName as string | undefined)?.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH) || "Member";
  // profile_avatar: "none" hides the photo, a URL replaces it, anything else
  // (including "default") falls back to the Google photo.
  const avatarUrl =
    meta.profile_avatar === "none" ? undefined : (validAvatar(meta.profile_avatar) ?? validAvatar(meta.avatar_url));
  return {
    userId: claims.sub,
    name,
    avatarUrl,
    color: validColor(meta.avatar_color),
    bio: cleanBio(meta.profile_bio),
    posterUrl: validAvatar(meta.profile_poster),
  };
}

/** A bio: trimmed, up to MAX_BIO_LENGTH characters; undefined if absent, blank or too long. */
export function cleanBio(value: unknown) {
  if (typeof value !== "string") return undefined;
  const bio = value.trim();
  return bio && bio.length <= MAX_BIO_LENGTH ? bio : undefined;
}

/** Profile photos: https images (uploads are on Supabase Storage). */
export function validAvatar(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  return value.startsWith("https://") ? value : undefined;
}

// Mirrors AVATAR_COLORS in lib/chat/types/users.ts.
export const palette = [
  "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#2563eb",
  "#65a30d", "#c026d3", "#dc2626", "#0891b2", "#4f46e5",
];

/** Avatar colors: one of the palette. */
export function validColor(value: unknown) {
  return typeof value === "string" && palette.includes(value) ? value : undefined;
}

/** Group colors: any "#rrggbb" (picked with a color picker), lowercased as the table's check expects. */
export function validHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return palette[hash % palette.length];
}
