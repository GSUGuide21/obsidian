"use client";

import { useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import { createId } from "@/lib/chat/id";
import { saveIdentity } from "@/lib/chat/identity";
import { MAX_NAME_LENGTH } from "@/lib/chat/types";
import { signInWithGoogle } from "@/lib/supabase/useSession";

export default function Join() {
  const [name, setName] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  // The OAuth callback sends failures back as ?auth_error=… (Join only renders client-side).
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("auth_error"));
  const cleaned = name.trim().replace(/\s+/g, " ");

  useEffect(() => {
    // Drop the error from the URL so a reload doesn't show it again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth_error")) {
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
  }, []);

  async function google() {
    setError(null);
    setRedirecting(true);
    try {
      await signInWithGoogle(); // navigates away to Google on success
    } catch (err) {
      setRedirecting(false);
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in.");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/5">
        <div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-accent/15">
          <Gem aria-hidden className="size-6 text-accent-bright" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Welcome to Obsidian Chat</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Sign in to keep your name across devices, or join as a guest.</p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={google}
          disabled={redirecting}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          <FcGoogle aria-hidden className="size-5" />
          {redirecting ? "Opening Google…" : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator">
          <span className="h-px flex-1 bg-border" />
          or join as a guest
          <span className="h-px flex-1 bg-border" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (cleaned) saveIdentity({ id: createId(), name: cleaned });
          }}
        >
          <Field label="Display name" htmlFor="display-name" hint="Shown next to your messages.">
            <Input
              id="display-name"
              autoComplete="nickname"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ada Lovelace"
            />
          </Field>

          <button
            type="submit"
            disabled={!cleaned}
            className="mt-4 h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Join as guest
          </button>
        </form>
      </div>
    </main>
  );
}
