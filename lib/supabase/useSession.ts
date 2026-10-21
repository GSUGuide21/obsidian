"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "./client";
import type { OAuthProvider } from "./providers";

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

/** Where sign-in links and providers send people back to; `next` is the page to land on after. */
function callbackUrl(next?: string) {
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.href;
}

/** Off to the provider's sign-in page (it comes back through /auth/callback). */
export async function signInWithProvider(provider: OAuthProvider) {
  const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl() } });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Make an account with an email and password. Resolves to whether it still
 * has to be confirmed from the email Supabase sends (when the project asks
 * for that); otherwise it's signed in already.
 */
export async function signUpWithEmail(email: string, password: string, name: string) {
  const { data, error } = await createClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(), data: { display_name: name } },
  });
  if (error) throw error;
  return { confirm: !data.session };
}

/** Email a one-time sign-in link (it makes the account too, if signing up is allowed). */
export async function sendSignInLink(email: string) {
  const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl() } });
  if (error) throw error;
}

/** Email a link that signs them in and asks for a new password (see RESET_PASSWORD_PARAM). */
export async function sendPasswordReset(email: string) {
  const { error } = await createClient().auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(`/?${RESET_PASSWORD_PARAM}=1`),
  });
  if (error) throw error;
}

/** The page a password reset link lands on has this, so the app asks for the new password. */
export const RESET_PASSWORD_PARAM = "reset_password";

/** Set a new password for the signed-in account. */
export async function updatePassword(password: string) {
  const { error } = await createClient().auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Save profile edits to the account. Uses our own metadata keys because
 * providers like Google overwrite full_name/avatar_url on every sign-in.
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
