"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "./client";

/**
 * The current Supabase session: `undefined` while loading, `null` when signed
 * out. For UI only; the chat server verifies the access token itself.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Fires INITIAL_SESSION right away, then on sign-in, sign-out and refresh.
    const { data } = createClient().auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}

export async function signInWithGoogle() {
  const redirectTo = new URL("/auth/callback", window.location.origin);
  const { error } = await createClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo.href },
  });
  if (error) throw error;
}

/**
 * Save profile edits to the account. Uses our own metadata keys because
 * Google overwrites full_name/avatar_url on every sign-in.
 */
export async function updateProfile(profile: {
  name: string;
  color: string;
  photo: string;
  /** Empty for none. */
  bio: string;
  /** A cover photo URL; empty for none. */
  poster: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    data: {
      display_name: profile.name,
      avatar_color: profile.color,
      profile_avatar: profile.photo,
      profile_bio: profile.bio,
      profile_poster: profile.poster,
    },
  });
  if (error) throw error;
  // The chat server reads the profile from the access token, so get one
  // that includes the new metadata.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
}

export async function signOut() {
  await createClient().auth.signOut();
}

export async function getAccessToken() {
  // getSession() refreshes the token first if it has expired.
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}
