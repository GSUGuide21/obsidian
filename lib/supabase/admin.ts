import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Supabase client with the secret key. It BYPASSES Row Level Security, so use
 * it only in server code for trusted operations (e.g. validated uploads), and
 * never return its results to a user without your own permission checks.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never run in the browser.");
  }
  // Not NEXT_PUBLIC_, so Next never ships it to the browser bundle.
  const secretKey = process.env.NEXT_SUPABASE_ADMIN_KEY;
  if (!secretKey) {
    throw new Error("Missing NEXT_SUPABASE_ADMIN_KEY. Add it to .env.local and restart the server.");
  }
  return createClient(supabaseUrl(), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
