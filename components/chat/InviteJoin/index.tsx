"use client";

import { useEffect, useState } from "react";
import { Lock, Users } from "lucide-react";
import Dialog from "@/components/Dialog";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import type { InvitePreview, RedeemResult } from "@/lib/chat/types";

type InviteJoinProps = {
  code: string;
  /** `null` if the link doesn't work; `undefined` if the server couldn't be asked. */
  onPreview: (code: string) => Promise<InvitePreview | null | undefined>;
  onRedeem: (code: string) => Promise<RedeemResult>;
  /** Joined (or already in): open this channel. */
  onJoined: (subgroupId: string | undefined, groupId: string) => void;
  onClose: () => void;
};

/** What an invite link leads to, with Join. */
export default function InviteJoin({ code, onPreview, onRedeem, onJoined, onClose }: InviteJoinProps) {
  /** `undefined` while loading, `null` if it doesn't work. */
  const [preview, setPreview] = useState<InvitePreview | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void onPreview(code).then((result) => {
      if (!active) return;
      if (result === undefined) setError("Couldn't check the invite. Try the link again in a moment.");
      setPreview(result ?? null);
    });
    return () => {
      active = false;
    };
  }, [code, onPreview]);

  async function join() {
    setBusy(true);
    setError(undefined);
    const result = await onRedeem(code);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onJoined(result.subgroupId, result.groupId);
  }

  const group = preview?.group;
  return (
    <Dialog open title={group ? `Join ${group.name}?` : "Invite"} onClose={onClose}>
      {preview === undefined && !error ? (
        <p className="text-sm text-muted">Checking the invite…</p>
      ) : !group ? (
        <div className="space-y-4">
          <p className="text-sm">{error ?? "This invite link has expired or is no longer valid. Ask for a new one."}</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium hover:bg-surface-2">
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={group.name} color={group.color} size="lg" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate font-semibold">
                {group.name}
                {group.visibility === "private" && <Lock aria-label="Private" className="size-3.5 text-muted" />}
              </p>
              {preview.memberCount !== undefined && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Users aria-hidden className="size-3.5" />
                  {preview.memberCount} {preview.memberCount === 1 ? "member" : "members"}
                </p>
              )}
            </div>
          </div>
          {group.description && <p className="text-sm whitespace-pre-line">{group.description}</p>}
          {preview.joined && <p className="text-sm text-muted">You&apos;re already in this group.</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {preview.joined ? "Close" : "Not now"}
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={() => void join()}
              className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {preview.joined ? "Open it" : busy ? "Joining…" : "Join group"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
