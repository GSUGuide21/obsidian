"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import Dialog from "@/components/Dialog";
import ChannelIcon from "@/components/chat/ChannelIcon";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import Input from "@/components/form/Input";
import { dmName, isDm } from "@/lib/chat/types";

type ForwardDialogProps = {
  /** A short summary of what's being forwarded. */
  preview: string;
  /** Resolves to an error message. */
  onForward: (subgroupId: string) => Promise<string | undefined>;
  onClose: () => void;
};

/** Pick a chat to forward a message to: your groups' channels and your direct messages. */
export default function ForwardDialog({ preview, onForward, onClose }: ForwardDialogProps) {
  const { state } = useChatContext();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const searchId = useId();
  const needle = query.trim().toLowerCase();

  // Every chat you're in, by name ("Group › #channel", or who a DM is with); wikis have no chat to post in.
  const targets = state.groups
    .filter((g) => g.role)
    .flatMap((group) =>
      isDm(group)
        ? group.subgroups.slice(0, 1).map((s) => ({ id: s.id, label: dmName(group, state.users, state.selfId), group, subgroup: s }))
        : group.subgroups.filter((s) => s.type !== "wiki").map((s) => ({ id: s.id, label: `${group.name} › #${s.name}`, group, subgroup: s })),
    )
    .filter((t) => !needle || t.label.toLowerCase().includes(needle))
    .slice(0, 50);

  async function forward(id: string, label: string) {
    setBusy(id);
    setError(undefined);
    const failure = await onForward(id);
    setBusy(null);
    if (failure) setError(failure);
    else setSent(label);
  }

  return (
    <Dialog open title="Forward message" onClose={onClose}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm">Forwarded to {sent}.</p>
          <div className="flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="line-clamp-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{preview || "Attachment"}</p>
          <label htmlFor={searchId} className="sr-only">
            Search chats
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              id={searchId}
              autoFocus
              autoComplete="off"
              placeholder="Search chats"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <ul className="max-h-72 space-y-px overflow-y-auto">
            {targets.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No chats match.</li>}
            {targets.map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void forward(target.id, target.label)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  {isDm(target.group) ? (
                    <Avatar name={target.label} color={target.group.color} size="sm" />
                  ) : (
                    <ChannelIcon type={target.subgroup.type} className="size-4 text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{target.label}</span>
                  {busy === target.id && <span className="text-xs text-muted">Sending…</span>}
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
