"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Gem, Mail } from "lucide-react";
import { FaApple, FaFacebook, FaMicrosoft, FaTwitch } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import { createId } from "@/lib/chat/id";
import { saveIdentity } from "@/lib/chat/identity";
import { MAX_NAME_LENGTH } from "@/lib/chat/types";
import { useT, type MessageKey } from "@/lib/i18n";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { loadAuthMethods, PROVIDER_LABELS, type AuthMethods, type OAuthProvider } from "@/lib/supabase/providers";
import {
  sendPasswordReset,
  sendSignInLink,
  signInWithPassword,
  signInWithProvider,
  signUpWithEmail,
} from "@/lib/supabase/useSession";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<OAuthProvider, ReactNode> = {
  google: <FcGoogle aria-hidden className="size-5" />,
  facebook: <FaFacebook aria-hidden className="size-5 text-[#0866FF]" />,
  apple: <FaApple aria-hidden className="size-5" />,
  azure: <FaMicrosoft aria-hidden className="size-5 text-[#00A4EF]" />,
  twitch: <FaTwitch aria-hidden className="size-5 text-[#9146FF]" />,
};

/** Supabase's default; the project can ask for more (its error says so). */
const MIN_PASSWORD_LENGTH = 6;

const button =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60";
const primary =
  "h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40";

export default function Join() {
  const t = useT();
  const [name, setName] = useState("");
  /** `undefined` until the project says which sign-in methods are on. */
  const [methods, setMethods] = useState<AuthMethods>();
  const [redirecting, setRedirecting] = useState<OAuthProvider | null>(null);
  // The sign-in callback sends failures back as ?auth_error=… (Join only renders client-side).
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("auth_error"));
  const cleaned = name.trim().replace(/\s+/g, " ");

  useEffect(() => {
    // Drop the error from the URL so a reload doesn't show it again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth_error")) {
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
    let active = true;
    void loadAuthMethods(supabaseUrl(), supabasePublishableKey()).then((found) => {
      if (active) setMethods(found);
    });
    return () => {
      active = false;
    };
  }, []);

  async function provider(id: OAuthProvider) {
    setError(null);
    setRedirecting(id);
    try {
      await signInWithProvider(id); // navigates away to the provider on success
    } catch (err) {
      setRedirecting(null);
      setError(err instanceof Error ? err.message : t("join.providerFailed", { provider: PROVIDER_LABELS[id] }));
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/5">
        <div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-accent/15">
          <Gem aria-hidden className="size-6 text-accent-bright" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t("join.title")}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{t("join.subtitle")}</p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!methods ? (
          <div aria-busy className="space-y-2">
            <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
            <span className="sr-only">{t("join.loading")}</span>
          </div>
        ) : (
          <>
            {methods.oauth.length > 0 && (
              <div className="space-y-2">
                {methods.oauth.map((id) => (
                  <button key={id} type="button" onClick={() => void provider(id)} disabled={redirecting !== null} className={button}>
                    {PROVIDER_ICONS[id]}
                    {t(redirecting === id ? "join.opening" : "join.continueWith", { provider: PROVIDER_LABELS[id] })}
                  </button>
                ))}
              </div>
            )}
            {methods.email && (
              <>
                {methods.oauth.length > 0 && <Divider>{t("join.orEmail")}</Divider>}
                <EmailSignIn signup={methods.signup} onError={setError} />
              </>
            )}
          </>
        )}

        <Divider>{t("join.orGuest")}</Divider>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (cleaned) saveIdentity({ id: createId(), name: cleaned });
          }}
        >
          <Field label={t("join.displayName")} htmlFor="display-name" hint={t("join.displayNameHint")}>
            <Input
              id="display-name"
              autoComplete="nickname"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("join.namePlaceholder")}
            />
          </Field>

          <button type="submit" disabled={!cleaned} className={cn(primary, "mt-4")}>
            {t("join.asGuest")}
          </button>
        </form>
      </div>
    </main>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Signing in with a password, making an account, an emailed sign-in link, or resetting a password. */
type Mode = "signin" | "signup" | "link" | "reset";

const SUBMIT_LABELS: Record<Mode, [idle: MessageKey, busy: MessageKey]> = {
  signin: ["join.signIn", "join.signingIn"],
  signup: ["join.createAccount", "join.creating"],
  link: ["join.sendLink", "join.sending"],
  reset: ["join.sendReset", "join.sending"],
};

/** Email sign-in. Errors go to the screen's alert (`onError`); what was sent is said here. */
function EmailSignIn({ signup, onError }: { signup: boolean; onError: (error: string | null) => void }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** What happened, when there's an email to go and look at. */
  const [sent, setSent] = useState<string>();
  const ids = { email: useId(), password: useId(), name: useId() };
  const address = email.trim();
  const displayName = name.trim().replace(/\s+/g, " ");
  const needsPassword = mode === "signin" || mode === "signup";
  const ready =
    address.includes("@") &&
    (!needsPassword || password.length >= MIN_PASSWORD_LENGTH) &&
    (mode !== "signup" || Boolean(displayName));

  function switchTo(next: Mode) {
    setMode(next);
    setSent(undefined);
    onError(null);
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setSent(undefined);
    onError(null);
    try {
      if (mode === "signin") {
        await signInWithPassword(address, password); // the session change shows the chat
      } else if (mode === "signup") {
        const { confirm } = await signUpWithEmail(address, password, displayName);
        if (confirm) setSent(t("join.confirmSent", { email: address }));
      } else if (mode === "link") {
        await sendSignInLink(address);
        setSent(t("join.linkSent", { email: address }));
      } else {
        await sendPasswordReset(address);
        setSent(t("join.resetSent", { email: address }));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : t("join.failed"));
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
      {(mode === "signin" || mode === "signup") && (
        <div role="tablist" aria-label="Email" className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
          {(
            [
              ["signin", t("join.signIn")],
              ...(signup ? ([["signup", t("join.createAccount")]] as const) : []),
            ] as const
          ).map(([option, label]) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => switchTo(option)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 transition-colors",
                mode === option ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "reset" && <p className="text-sm text-muted">{t("join.resetIntro")}</p>}
      {mode === "link" && <p className="text-sm text-muted">{t("join.linkIntro")}</p>}

      {mode === "signup" && (
        <Field label={t("join.displayName")} htmlFor={ids.name}>
          <Input
            id={ids.name}
            autoComplete="nickname"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("join.namePlaceholder")}
          />
        </Field>
      )}
      <Field label={t("join.email")} htmlFor={ids.email}>
        <Input
          id={ids.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      {needsPassword && (
        <Field
          label={t("join.password")}
          htmlFor={ids.password}
          hint={mode === "signup" ? t("join.passwordHint", { count: MIN_PASSWORD_LENGTH }) : undefined}
        >
          <Input
            id={ids.password}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      )}

      {sent && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">
          <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-bright" />
          {sent}
        </p>
      )}

      <button type="submit" disabled={!ready || busy} className={primary}>
        {t(SUBMIT_LABELS[mode][busy ? 1 : 0])}
      </button>

      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {mode !== "signin" && <TextButton onClick={() => switchTo("signin")}>{t("join.withPassword")}</TextButton>}
        {mode === "signin" && <TextButton onClick={() => switchTo("reset")}>{t("join.forgot")}</TextButton>}
        {mode !== "link" && <TextButton onClick={() => switchTo("link")}>{t("join.linkInstead")}</TextButton>}
      </p>
    </form>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-medium text-accent-bright underline-offset-2 hover:underline">
      {children}
    </button>
  );
}
