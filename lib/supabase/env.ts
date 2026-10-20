// NEXT_PUBLIC_* values must be read as literal `process.env.X` expressions so
// Next can inline them into the browser bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Holds the new-style publishable key (sb_publishable_…); the name is legacy.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local and restart the server.`);
  return value;
}

export function supabaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL", url);
}

export function supabasePublishableKey() {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", publishableKey);
}
