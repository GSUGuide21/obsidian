"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy, Link2Off } from "lucide-react";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Select from "@/components/form/Select";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { formatDateTime } from "@/lib/chat/format";
import { inviteUrl, isOnline, type InviteLink, type InviteLinkResult, type Member, type User } from "@/lib/chat/types";

type InvitePanelProps = {
  users: Record<string, User>;
  members: Member[];
  /** Each resolves to an error message, or undefined on success. */
  onInvite: (userId: string) => Promise<string | undefined>;
  onRevoke: (userId: string) => Promise<string | undefined>;
  onLoadInvites: () => Promise<User[] | undefined>;
  /** Invite links. */
  onCreateLink: (options: { expiresIn?: number; maxUses?: number }) => Promise<InviteLinkResult>;
  /** `undefined` if they couldn't be loaded. */
  onLoadLinks: () => Promise<InviteLink[] | undefined>;
  onRevokeLink: (code: string) => Promise<string | undefined>;
};

/** Moderators and up: invite links, and inviting people by name (a group settings section). */
export function InvitePanel({ onCreateLink, onLoadLinks, onRevokeLink, ...props }: InvitePanelProps) {
  return (
    <div className="space-y-8">
      <Links onCreate={onCreateLink} onLoad={onLoadLinks} onRevoke={onRevokeLink} />
      <Picker {...props} />
    </div>
  );
}

const HOUR = 60 * 60 * 1000;
const EXPIRIES = [
  { value: "never", label: "Never expires" },
  { value: String(30 * 60 * 1000), label: "Expires in 30 minutes" },
  { value: String(HOUR), label: "Expires in 1 hour" },
  { value: String(24 * HOUR), label: "Expires in 1 day" },
  { value: String(7 * 24 * HOUR), label: "Expires in 7 days" },
];
const USES = [
  { value: "unlimited", label: "No limit" },
  ...[1, 5, 10, 25, 100].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "use" : "uses"}` })),
];

/** Shareable links: make one, copy it, revoke it. */
function Links({
  onCreate,
  onLoad,
  onRevoke,
}: {
  onCreate: InvitePanelProps["onCreateLink"];
  onLoad: InvitePanelProps["onLoadLinks"];
  onRevoke: InvitePanelProps["onRevokeLink"];
}) {
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [links, setLinks] = useState<InviteLink[] | null>();
  const [expiry, setExpiry] = useState(String(7 * 24 * HOUR));
  const [uses, setUses] = useState("unlimited");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void onLoad().then((list) => {
      if (active) setLinks(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoad]);

  const urlOf = (code: string) => inviteUrl(window.location.origin, code);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(urlOf(code));
      setCopied(code);
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function create() {
    setBusy(true);
    setError(undefined);
    const result = await onCreate({
      ...(expiry !== "never" && { expiresIn: Number(expiry) }),
      ...(uses !== "unlimited" && { maxUses: Number(uses) }),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setLinks((list) => [result.link, ...(list ?? [])]);
    void copy(result.link.code);
  }

  async function revoke(code: string) {
    setBusy(true);
    setError(undefined);
    const failure = await onRevoke(code);
    setBusy(false);
    if (failure) setError(failure);
    else setLinks((list) => list?.filter((link) => link.code !== code));
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Invite link</h3>
        <p className="text-xs text-muted">Anyone with the link can join, even if the group is private.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="When the link expires" className="w-48" value={expiry} onChange={(v) => v && setExpiry(v)} options={EXPIRIES} />
        <Select aria-label="How many people can use it" className="w-32" value={uses} onChange={(v) => v && setUses(v)} options={USES} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          Create link
        </button>
      </div>
      {links === null && <p className="text-xs text-muted">Couldn&apos;t load the links.</p>}
      {links && links.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {links.map((link) => (
            <li key={link.code} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs select-all">{urlOf(link.code)}</p>
                <p className="text-[11px] text-muted">
                  {link.uses}
                  {link.maxUses ? `/${link.maxUses}` : ""} {link.uses === 1 && !link.maxUses ? "use" : "uses"} ·{" "}
                  {link.expiresAt ? `expires ${formatDateTime(link.expiresAt)}` : "never expires"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copy(link.code)}
                aria-label="Copy link"
                title={copied === link.code ? "Copied" : "Copy link"}
                className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
              >
                {copied === link.code ? <Check className="size-4 text-online" /> : <Copy className="size-4" />}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke(link.code)}
                aria-label="Revoke link"
                title="Revoke link"
                className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-danger disabled:opacity-50"
              >
                <Link2Off className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function Picker({
  users,
  members,
  onInvite,
  onRevoke,
  onLoadInvites,
}: Omit<InvitePanelProps, "onCreateLink" | "onLoadLinks" | "onRevokeLink">) {
  const [query, setQuery] = useState("");
  /** Pending invites; `undefined` while loading, `null` if they couldn't be loaded. */
  const [invited, setInvited] = useState<User[] | null>();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const searchId = useId();

  // Mounted when the dialog opens, so this loads fresh each time.
  useEffect(() => {
    let active = true;
    void onLoadInvites().then((list) => {
      if (active) setInvited(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoadInvites]);

  const excluded = new Set([...members.map((m) => m.user.id), ...(invited ?? []).map((u) => u.id)]);
  const needle = query.trim().toLowerCase();
  const candidates = Object.values(users)
    // Offline guests are gone for good; bots don't need invites.
    .filter((u) => !excluded.has(u.id) && u.role !== "bot" && (isOnline(u) || !u.id.startsWith("guest-")))
    .filter((u) => !needle || u.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.name.localeCompare(b.name));

  async function run(userId: string, action: Promise<string | undefined>, apply: (list: User[]) => User[]) {
    setPending(userId);
    setError(undefined);
    const failure = await action;
    setPending(null);
    if (failure) setError(failure);
    else setInvited((list) => (list ? apply(list) : list));
  }

  const invite = (user: User) => run(user.id, onInvite(user.id), (list) => [...list, user]);
  const revoke = (user: User) => run(user.id, onRevoke(user.id), (list) => list.filter((u) => u.id !== user.id));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Invite someone</h3>
        <p className="text-xs text-muted">Invited people see the group in their sidebar and can join it from there.</p>
      </div>
      <Field label="Search" htmlFor={searchId}>
        <Input
          id={searchId}
          autoComplete="off"
          placeholder="Name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <ul className="max-h-60 space-y-px overflow-y-auto">
        {candidates.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No one else to invite.</li>}
        {candidates.map((user) => (
          <Row key={user.id} user={user}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void invite(user)}
              className="h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {pending === user.id ? "Inviting…" : "Invite"}
            </button>
          </Row>
        ))}
      </ul>

      <section>
        <h3 className="mb-1 text-sm font-medium">Pending invites</h3>
        {invited === undefined && <p className="px-2 py-1.5 text-xs text-muted">Loading…</p>}
        {invited === null && <p className="px-2 py-1.5 text-xs text-muted">Couldn&apos;t load pending invites.</p>}
        {invited?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No pending invites.</p>}
        {invited && invited.length > 0 && (
          <ul className="max-h-40 space-y-px overflow-y-auto">
            {invited.map((invitee) => {
              // Live presence when we have it.
              const user = users[invitee.id] ?? invitee;
              return (
                <Row key={user.id} user={user}>
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void revoke(user)}
                    className="h-7 rounded-md px-2.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {pending === user.id ? "Revoking…" : "Revoke"}
                  </button>
                </Row>
              );
            })}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Row({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5">
      <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
      <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
      {children}
    </li>
  );
}
