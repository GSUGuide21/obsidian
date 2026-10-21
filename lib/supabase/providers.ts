// Ways to sign in: the OAuth providers the app has buttons for, and which of
// them (and email) the Supabase project has switched on. Providers are turned
// on in the Supabase dashboard (Authentication → Sign In / Providers); the
// sign-in screen shows whichever are.

/** OAuth providers the sign-in screen can offer, in the order it lists them (Supabase's ids). */
export const OAUTH_PROVIDERS = ["google", "facebook", "apple", "azure", "twitch"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** How each provider is named to people: "facebook" is Meta's (named as its button must be), "azure" Microsoft's. */
export const PROVIDER_LABELS: Record<OAuthProvider | "email", string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  azure: "Microsoft",
  twitch: "Twitch",
  email: "email",
};

export type AuthMethods = {
  /** OAuth providers that are on, in OAUTH_PROVIDERS order. */
  oauth: OAuthProvider[];
  /** Email and password, emailed sign-in links and password resets. */
  email: boolean;
  /** New accounts can be made (with any method). */
  signup: boolean;
};

/** What the app offered before it could ask: Google only. */
export const FALLBACK_METHODS: AuthMethods = { oauth: ["google"], email: false, signup: true };

/**
 * The methods a project's public auth settings (GET /auth/v1/settings) turn
 * on. Anything unexpected in them counts as off.
 */
export function toAuthMethods(settings: unknown): AuthMethods {
  const value = (settings ?? {}) as { external?: Record<string, unknown>; disable_signup?: unknown };
  const external = value.external ?? {};
  return {
    oauth: OAUTH_PROVIDERS.filter((provider) => external[provider] === true),
    email: external.email === true,
    signup: value.disable_signup !== true,
  };
}

/** Ask the project which sign-in methods are on; FALLBACK_METHODS if it can't be reached. */
export async function loadAuthMethods(url: string, publishableKey: string): Promise<AuthMethods> {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey } });
    if (!response.ok) return FALLBACK_METHODS;
    const methods = toAuthMethods(await response.json());
    // Nothing on at all is more likely a misread than a project nobody can sign in to.
    return methods.oauth.length || methods.email ? methods : FALLBACK_METHODS;
  } catch {
    return FALLBACK_METHODS;
  }
}

/** The label for how an account signs in, from its user's app_metadata.provider. */
export function providerLabel(provider: unknown) {
  return typeof provider === "string" && Object.hasOwn(PROVIDER_LABELS, provider)
    ? PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS]
    : undefined;
}
