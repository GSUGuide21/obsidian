"use client";

import { useState } from "react";
import Dialog from "@/components/Dialog";
import { summarize } from "@/lib/chat/format";
import type { Message } from "@/lib/chat/types";

type DeleteDialogProps = {
  /** The message to confirm deleting; the dialog is open while set. */
  message: Message | null;
  selfId: string;
  onClose: () => void;
  /** Resolves to an error message, or undefined on success. */
  onDelete: (id: string) => Promise<string | undefined>;
};

export default function DeleteDialog({ message, selfId, onClose, onDelete }: DeleteDialogProps) {
  return (
    <Dialog open={Boolean(message)} title="Delete message?" onClose={onClose}>
      {message && <DeleteConfirm message={message} selfId={selfId} onCancel={onClose} onDelete={onDelete} />}
    </Dialog>
  );
}

function DeleteConfirm({
  message,
  selfId,
  onCancel,
  onDelete,
}: {
  message: Message;
  selfId: string;
  onCancel: () => void;
  onDelete: (id: string) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const preview = summarize(message);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        This removes it for everyone. Replies will show it as deleted. You can&apos;t undo this.
        {message.authorId !== selfId && " It will say it was removed by a moderator."}
      </p>
      {preview && (
        <blockquote className="line-clamp-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          {preview}
        </blockquote>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const failure = await onDelete(message.id);
            setBusy(false);
            if (failure) setError(failure);
            else onCancel();
          }}
          className="h-9 rounded-lg bg-danger-strong px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
