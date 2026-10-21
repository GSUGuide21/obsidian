import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { FALLBACK_METHODS, loadAuthMethods, providerLabel, toAuthMethods } from "../lib/supabase/providers.ts";

describe("toAuthMethods", () => {
  it("offers the providers that are on, in the app's order", () => {
    const methods = toAuthMethods({ external: { facebook: true, google: true, github: true, email: true, twitch: false } });
    assert.deepEqual(methods, { oauth: ["google", "facebook"], email: true, signup: true });
  });

  it("says when signing up is off", () => {
    assert.equal(toAuthMethods({ external: { email: true }, disable_signup: true }).signup, false);
  });

  it("treats anything unexpected as off", () => {
    assert.deepEqual(toAuthMethods({ external: { google: "yes" } }), { oauth: [], email: false, signup: true });
    assert.deepEqual(toAuthMethods(null), { oauth: [], email: false, signup: true });
  });
});

describe("loadAuthMethods", () => {
  afterEach(() => mock.restoreAll());

  it("asks the project's public auth settings", async () => {
    const fetch = mock.method(globalThis, "fetch", async () =>
      Response.json({ external: { email: true, facebook: true }, disable_signup: false }),
    );
    const methods = await loadAuthMethods("https://project.supabase.co", "sb_publishable_x");
    assert.deepEqual(methods, { oauth: ["facebook"], email: true, signup: true });
    const [url, init] = fetch.mock.calls[0].arguments;
    assert.equal(url, "https://project.supabase.co/auth/v1/settings");
    assert.deepEqual((init as RequestInit).headers, { apikey: "sb_publishable_x" });
  });

  it("falls back to Google when the project can't be reached or offers nothing", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new Error("offline");
    });
    assert.deepEqual(await loadAuthMethods("https://x", "k"), FALLBACK_METHODS);
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => Response.json({ external: {} }));
    assert.deepEqual(await loadAuthMethods("https://x", "k"), FALLBACK_METHODS);
  });
});

describe("providerLabel", () => {
  it("names the providers people know", () => {
    assert.equal(providerLabel("facebook"), "Facebook");
    assert.equal(providerLabel("email"), "email");
    assert.equal(providerLabel("azure"), "Microsoft");
    assert.equal(providerLabel("toString"), undefined);
    assert.equal(providerLabel(undefined), undefined);
  });
});
