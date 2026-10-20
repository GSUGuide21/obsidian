"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { authorName, formatDateTime } from "@/lib/chat/format";
import type { GroupBan, User } from "@/lib/chat/types";

type BanListProps = {
  /** For the names of who banned whom. */
  users: Record<string, User>;
  /** `undefined` if they couldn't be loaded. */
  onLoad: () => Promise<GroupBan[] | undefined>;
  /** Resolves to an error message, or undefined on success. */
  onUnban: (userId: string) => Promise<string | undefined>;
};

/** Admins and up: the group's active bans, with the reason, who banned them and until when (a group settings section). */
export function BanList({ users, onLoad, onUnban }: BanListProps) {
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [bans, setBans] = useState<GroupBan[] | null>();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  // Mounted when the dialog opens, so this loads fresh each time.
  useEffect(() => {
    let active = true;
    void onLoad().then((list) => {
      if (active) setBans(list ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoad]);

  async function unban(userId: string) {
    setPending(userId);
    setError(undefined);
    const failure = await onUnban(userId);
    setPending(null);
    if (failure) setError(failure);
    else setBans((list) => list?.filter((ban) => ban.user.id !== userId));
  }

  if (bans === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (bans === null) return <p className="text-sm text-muted">Couldn&apos;t load the bans. Try again.</p>;

  return (
    <div className="space-y-3">
      {bans.length === 0 ? (
        <p className="text-sm text-muted">No one is banned from this group.</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {bans.map((ban) => (
            <li key={ban.user.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
              <Avatar name={ban.user.name} color={ban.user.color} src={ban.user.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ban.user.name}</p>
                <p className="text-xs text-muted">
                  {ban.until ? `Until ${formatDateTime(ban.until)}` : "Permanent"}
                  {ban.by && ` · by ${authorName(users[ban.by], ban.by)}`}
                </p>
                {ban.reason && <p className="mt-0.5 text-xs wrap-break-word">{ban.reason}</p>}
              </div>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void unban(ban.user.id)}
                className="h-7 shrink-0 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {pending === ban.user.id ? "Lifting…" : "Unban"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Unbanned people can rejoin public groups; private groups still need an invite.</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
