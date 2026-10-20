"use client";

import { useEffect, useId, useState } from "react";
import { Power, RotateCw } from "lucide-react";
import Dialog from "@/components/Dialog";
import Field from "@/components/form/Field";
import Input from "@/components/form/Input";
import Switch from "@/components/form/Switch";
import TextArea from "@/components/form/TextArea";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import {
  MAX_INSTANCE_NAME_LENGTH,
  MAX_NOTICE_LENGTH,
  type InstanceBan,
  type ObsidianSettings,
  type User,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type AdminDialogProps = {
  open: boolean;
  onClose: () => void;
};

/** What the dialog's parts get from the chat. */
type AdminData = {
  settings: ObsidianSettings;
  users: Record<string, User>;
  selfId: string;
  /** Each resolves to an error message, or undefined on success. */
  onSaveSettings: (changes: Partial<ObsidianSettings>) => Promise<string | undefined>;
  onBan: (userId: string, reason?: string) => Promise<string | undefined>;
  onUnban: (userId: string) => Promise<string | undefined>;
  onStop: (mode: "restart" | "shutdown") => Promise<string | undefined>;
  /** `undefined` if they couldn't be loaded. */
  onLoadBans: () => Promise<InstanceBan[] | undefined>;
};

type Tab = "settings" | "bans" | "server";
const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "bans", label: "Bans" },
  { id: "server", label: "Server" },
];

/** App-wide admins: instance settings, instance-wide bans, and restarting or stopping the server. */
export default function AdminDialog({ open, onClose }: AdminDialogProps) {
  const chat = useChatContext();
  const props: AdminData = {
    settings: chat.state.settings,
    users: chat.state.users,
    selfId: chat.state.selfId,
    onSaveSettings: chat.updateSettings,
    onBan: chat.banFromInstance,
    onUnban: chat.unbanFromInstance,
    onStop: chat.stopServer,
    onLoadBans: chat.loadInstanceBans,
  };
  const [tab, setTab] = useState<Tab>("settings");
  return (
    <Dialog open={open} title="Instance admin" onClose={onClose}>
      <div role="tablist" aria-label="Sections" className="mb-4 flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 transition-colors",
              tab === option.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {tab === "settings" && <SettingsForm settings={props.settings} onSave={props.onSaveSettings} onClose={onClose} />}
      {tab === "bans" && <Bans {...props} />}
      {tab === "server" && <Server onStop={props.onStop} />}
    </Dialog>
  );
}

function SettingsForm({
  settings,
  onSave,
  onClose,
}: {
  settings: ObsidianSettings;
  onSave: AdminData["onSaveSettings"];
  onClose: () => void;
}) {
  const [name, setName] = useState(settings.name);
  const [notice, setNotice] = useState(settings.notice ?? "");
  const [guestsAllowed, setGuestsAllowed] = useState(settings.guestsAllowed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ids = { name: useId(), notice: useId() };

  async function submit() {
    if (!name.trim()) return setError("Give the instance a name.");
    setBusy(true);
    setError(undefined);
    const failure = await onSave({ name: name.trim(), notice: notice.trim(), guestsAllowed });
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <Field label="Name" htmlFor={ids.name} hint="Shown in the sidebar and the browser tab.">
        <Input
          id={ids.name}
          maxLength={MAX_INSTANCE_NAME_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Notice" htmlFor={ids.notice} optional hint="Shown to everyone above the chat; leave empty for none.">
        <TextArea
          id={ids.notice}
          rows={3}
          maxLength={MAX_NOTICE_LENGTH}
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          placeholder="e.g. Maintenance tonight at 22:00 UTC"
        />
      </Field>
      <Switch
        checked={guestsAllowed}
        onChange={setGuestsAllowed}
        description="When off, only people signed in with Google can join. Guests already here stay until they leave."
      >
        Allow guests
      </Switch>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Bans({ users, selfId, onBan, onUnban, onLoadBans }: AdminData) {
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [bans, setBans] = useState<InstanceBan[] | null>();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [reloads, setReloads] = useState(0);
  const ids = { search: useId(), reason: useId() };

  useEffect(() => {
    let active = true;
    void onLoadBans().then((list) => {
      if (active) setBans(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoadBans, reloads]);

  const banned = new Set((bans ?? []).map((b) => b.user.id));
  const needle = query.trim().toLowerCase();
  // Admins and bots can't be banned; neither can you.
  const candidates = needle
    ? Object.values(users)
        .filter((u) => u.id !== selfId && u.role === "member" && !banned.has(u.id))
        .filter((u) => u.name.toLowerCase().includes(needle))
        .slice(0, 8)
    : [];

  async function run(userId: string, action: Promise<string | undefined>) {
    setPending(userId);
    setError(undefined);
    const failure = await action;
    setPending(null);
    if (failure) return setError(failure);
    setReason("");
    setReloads((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Ban someone</h3>
        <p className="text-xs text-muted">
          They&apos;re disconnected right away and can&apos;t rejoin. Guests can come back under a new guest name, so
          consider turning guests off too.
        </p>
        <Field label="Search" htmlFor={ids.search}>
          <Input
            id={ids.search}
            autoComplete="off"
            placeholder="Name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field label="Reason" htmlFor={ids.reason} optional hint="They see it when they try to join.">
          <Input id={ids.reason} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {candidates.length > 0 && (
          <ul className="space-y-px">
            {candidates.map((user) => (
              <Row key={user.id} user={user}>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void run(user.id, onBan(user.id, reason.trim() || undefined))}
                  className="h-7 rounded-md bg-danger-strong px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending === user.id ? "Banning…" : "Ban"}
                </button>
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium">Banned</h3>
        {bans === undefined && <p className="px-2 py-1.5 text-xs text-muted">Loading…</p>}
        {bans === null && <p className="px-2 py-1.5 text-xs text-muted">Couldn&apos;t load the bans.</p>}
        {bans?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No one is banned.</p>}
        {bans && bans.length > 0 && (
          <ul className="max-h-60 space-y-px overflow-y-auto">
            {bans.map((ban) => (
              <Row
                key={ban.user.id}
                user={ban.user}
                detail={[new Date(ban.at).toLocaleDateString(), ban.reason].filter(Boolean).join(" · ")}
              >
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void run(ban.user.id, onUnban(ban.user.id))}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                >
                  {pending === ban.user.id ? "Lifting…" : "Unban"}
                </button>
              </Row>
            ))}
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

function Server({ onStop }: { onStop: AdminData["onStop"] }) {
  const [confirming, setConfirming] = useState<"restart" | "shutdown" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function stop(mode: "restart" | "shutdown") {
    setBusy(true);
    setError(undefined);
    const failure = await onStop(mode);
    setBusy(false);
    if (failure) setError(failure);
    setConfirming(null);
  }

  const options = [
    {
      mode: "restart" as const,
      icon: RotateCw,
      label: "Restart",
      description:
        "Everyone sees a notice, gets disconnected and reconnects once it's back. Needs a process manager (systemd, pm2, Docker) to start it again; in development, save server.mts to restart.",
    },
    {
      mode: "shutdown" as const,
      icon: Power,
      label: "Shut down",
      description: "Everyone sees a notice and gets disconnected. Someone has to start the server again by hand.",
    },
  ];

  return (
    <div className="space-y-3">
      {options.map(({ mode, icon: Icon, label, description }) => (
        <section key={mode} className="rounded-lg border border-border p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Icon aria-hidden className="size-4 text-muted" />
            {label}
          </h3>
          <p className="mt-1 text-xs text-muted">{description}</p>
          <div className="mt-2 flex justify-end gap-2">
            {confirming === mode ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => void stop(mode)}
                  className="h-8 rounded-lg bg-danger-strong px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {label} now
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(mode)}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
              >
                {label}…
              </button>
            )}
          </div>
        </section>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Row({ user, detail, children }: { user: User; detail?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5">
      <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{user.name}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      {children}
    </li>
  );
}
