"use client";

import { useId, useState } from "react";
import { Check, Search, X } from "lucide-react";
import Dialog from "@/components/Dialog";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { CustomStatus } from "@/components/chat/Status";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { isOnline, MAX_DM_MEMBERS } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type NewDmDialogProps = {
  open: boolean;
  /** Resolves to an error message; closes on success. */
  onStart: (userIds: string[]) => Promise<string | undefined>;
  onClose: () => void;
};

/** Pick one person (or a few) to message. */
export default function NewDmDialog({ open, onClose, ...props }: NewDmDialogProps) {
  return (
    <Dialog open={open} title="New message" onClose={onClose}>
      {open && <Picker onClose={onClose} {...props} />}
    </Dialog>
  );
}

function Picker({ onStart, onClose }: Omit<NewDmDialogProps, "open">) {
  const {
    state: { users, selfId },
  } = useChatContext();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const searchId = useId();
  const max = MAX_DM_MEMBERS - 1;
  const needle = query.trim().toLowerCase();

  // Signed-in people only: guests' conversations would vanish with them.
  const candidates = Object.values(users)
    .filter((u) => u.id !== selfId && u.role !== "bot" && !u.id.startsWith("guest-"))
    .filter((u) => !needle || u.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.name.localeCompare(b.name))
    .slice(0, 50);

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : current.length < max ? [...current, id] : current,
    );
  }

  async function start() {
    setBusy(true);
    setError(undefined);
    const failure = await onStart(picked);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <div className="space-y-3">
      {picked.length > 0 && (
        <ul aria-label="To" className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remove ${users[id]?.name ?? "them"}`}
                className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-accent-bright hover:bg-accent/25"
              >
                {users[id]?.name ?? "Unknown user"}
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={searchId} className="relative block">
        <span className="sr-only">Search people</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id={searchId}
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </label>
      <ul className="max-h-72 space-y-px overflow-y-auto" aria-label="People">
        {candidates.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted">
            {needle ? "Nobody matches." : "Nobody else has signed in yet."}
          </li>
        )}
        {candidates.map((user) => {
          const selected = picked.includes(user.id);
          return (
            <li key={user.id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={!selected && picked.length >= max}
                onClick={() => toggle(user.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-40",
                  selected && "bg-accent/10",
                )}
              >
                <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{user.name}</span>
                  <CustomStatus user={user} className="text-xs text-muted" />
                </span>
                {selected && <Check aria-hidden className="size-4 shrink-0 text-accent-bright" />}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-muted">{picked.length > 1 && `Group message with ${picked.length} people`}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={() => void start()}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Opening…" : "Message"}
        </button>
      </div>
    </div>
  );
}
