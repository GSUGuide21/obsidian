import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only same-site paths, so the callback can't be used as an open redirect. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

/**
 * Sign-in providers, and links in sign-in, confirmation and password reset
 * emails, come back here (via Supabase) with a one-time code to trade for a session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  let message = url.searchParams.get("error_description") ?? "Sign-in was cancelled.";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // Library errors are technical (e.g. missing PKCE verifier when the flow
    // started in another browser); log them, show something actionable.
    console.error("sign-in failed:", error.message);
    message = "Sign-in didn't complete. Please try again in this browser (open email links where you asked for them).";
  }

  const back = new URL("/", url.origin);
  back.searchParams.set("auth_error", message.slice(0, 200));
  return NextResponse.redirect(back);
}
