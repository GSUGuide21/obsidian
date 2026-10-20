import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Client Components. Sessions live in cookies, so the
 * server client and proxy see the same signed-in user. createBrowserClient
 * returns a shared instance in the browser, so calling this often is cheap.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
