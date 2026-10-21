"use client";

import { useEffect, useId, useState } from "react";
import Dialog from "@/components/Dialog";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import { RESET_PASSWORD_PARAM, updatePassword } from "@/lib/supabase/useSession";

const MIN_PASSWORD_LENGTH = 6;

/** Choosing a new password for the signed-in account (twice, so a typo doesn't lock them out). */
export function PasswordForm({ onDone, submitLabel = "Save password" }: { onDone?: () => void; submitLabel?: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const ids = { password: useId(), again: useId() };
  const mismatch = again.length > 0 && again !== password;

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH || password !== again || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await updatePassword(password);
      setPassword("");
      setAgain("");
      setSaved(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-3"
    >
      <Field label="New password" htmlFor={ids.password} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        <Input
          id={ids.password}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <Field label="Type it again" htmlFor={ids.again} error={mismatch ? "The passwords don't match." : undefined}>
        <Input
          id={ids.again}
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => {
            setAgain(event.target.value);
            setSaved(false);
          }}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !onDone && (
        <p role="status" className="text-sm text-muted">
          Your password was changed.
        </p>
      )}
      <button
        type="submit"
        disabled={busy || password.length < MIN_PASSWORD_LENGTH || password !== again}
        className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** After following a password reset link (it signs you in): ask for the new password. */
export function ResetPasswordDialog() {
  // Only rendered in the browser (Core waits for the session there).
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has(RESET_PASSWORD_PARAM));

  useEffect(() => {
    // Drop it from the URL so a reload doesn't ask again.
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RESET_PASSWORD_PARAM)) return;
    url.searchParams.delete(RESET_PASSWORD_PARAM);
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <Dialog open={open} title="Choose a new password" onClose={() => setOpen(false)}>
      <p className="mb-4 text-sm text-muted">You&apos;re signed in from the reset link. Pick the password to use from now on.</p>
      <PasswordForm onDone={() => setOpen(false)} />
    </Dialog>
  );
}
