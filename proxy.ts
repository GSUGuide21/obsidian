import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on each request so Server Components
 * and Route Handlers always see a valid session. It does not block anyone;
 * protected routes must still check the user themselves.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Mirror refreshed cookies onto the request (for this render) and the
        // response (for the browser).
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // no-store headers so a CDN never serves one user's session to another.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Verifies the JWT and refreshes it if it's about to expire. Don't put code
  // between createServerClient and this call.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets (uploads are served by Supabase Storage).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
