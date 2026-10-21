"use client";

import { useEffect, useState } from "react";
import Dialog from "@/components/Dialog";
import { formatDateTime } from "@/lib/chat/format";
import { MAX_EDIT_HISTORY, type MessageVersion } from "@/lib/chat/types";

type EditHistoryProps = {
  messageId: string;
  authorName: string;
  /** Every version, oldest first (the current one last); `undefined` if it couldn't be loaded. */
  onLoad: (id: string) => Promise<MessageVersion[] | undefined>;
  onClose: () => void;
};

/**
 * What an edited message said before: every version of its text, newest
 * first, with when each was written. Anyone who can read the message can see
 * it, so edits are out in the open (and moderators can check what changed).
 */
export default function EditHistory({ messageId, authorName, onLoad, onClose }: EditHistoryProps) {
  /** `undefined` while loading; `null` if it couldn't be loaded. */
  const [versions, setVersions] = useState<MessageVersion[] | null>();

  useEffect(() => {
    let active = true;
    void onLoad(messageId).then((loaded) => {
      if (active) setVersions(loaded ?? null);
    });
    return () => {
      active = false;
    };
  }, [messageId, onLoad]);

  // Past the limit, the oldest one shown is an earlier edit, not the original.
  const complete = versions ? versions.length <= MAX_EDIT_HISTORY : false;

  return (
    <Dialog open title={`Edit history of ${authorName}'s message`} onClose={onClose}>
      {versions === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : versions === null ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load the edit history. The message may have been deleted.
        </p>
      ) : (
        <div className="space-y-3">
          {versions.length === 1 && (
            <p className="text-xs text-muted">Earlier versions of this message weren&apos;t kept.</p>
          )}
          <ol aria-label="Versions, newest first" className="max-h-[60vh] space-y-2 overflow-y-auto">
            {versions
              .map((version, index) => ({ version, index }))
              .reverse()
              .map(({ version, index }) => {
                const label =
                  index === versions.length - 1 ? "Current" : index === 0 && complete ? "Original" : `Edit ${index}`;
                return (
                  <li key={index} className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="mb-1 text-[11px] text-muted">
                      <span className="font-medium text-foreground">{label}</span> ·{" "}
                      <time dateTime={new Date(version.at).toISOString()}>{formatDateTime(version.at)}</time>
                    </p>
                    {version.text ? (
                      <p className="text-sm whitespace-pre-wrap wrap-break-word">{version.text}</p>
                    ) : (
                      <p className="text-sm text-muted italic">No text</p>
                    )}
                  </li>
                );
              })}
          </ol>
        </div>
      )}
    </Dialog>
  );
}
