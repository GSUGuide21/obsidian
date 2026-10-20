// The Supabase clients: one that verifies access tokens, one (with the secret key) that reads and writes chat data.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

import "./env.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseSecret = process.env.NEXT_SUPABASE_ADMIN_KEY;
if (!supabaseUrl || !supabaseKey || !supabaseSecret) {
  console.error(
    "> Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_SUPABASE_ADMIN_KEY) in .env.local.",
  );
  process.exit(1);
}

export const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

// Verifies users' access tokens.
export const supabaseAuth: SupabaseClient = createClient(supabaseUrl, supabaseKey, clientOptions);

// Reads and writes chat data. The secret key bypasses RLS: this server is the
// only thing allowed to touch the tables (see supabase/migrations).
export const db: SupabaseClient = createClient(supabaseUrl, supabaseSecret, clientOptions);
