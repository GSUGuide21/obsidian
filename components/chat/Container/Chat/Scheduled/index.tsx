"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import Dialog from "@/components/Dialog";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { formatDateTime, summarize } from "@/lib/chat/format";
import type { ScheduledMessage } from "@/lib/chat/types";

/** "2 scheduled" above the composer when you have messages waiting here; opens the list. */
export default function Scheduled({ subgroupId }: { subgroupId: string }) {
  const { state, loadScheduled, cancelScheduled } = useChatContext();
  const version = state.scheduledVersion[subgroupId] ?? 0;
  const connected = state.status === "ready";
  const [list, setList] = useState<ScheduledMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  // Refetched when the channel changes, after reconnecting, and when one is scheduled, sent or fails.
  useEffect(() => {
    if (!connected) return;
    let active = true;
    void loadScheduled(subgroupId).then((found) => {
      if (active && found) setList(found);
    });
    return () => {
      active = false;
    };
  }, [subgroupId, version, connected, loadScheduled]);

  async function cancel(id: string) {
    setPending(id);
    setError(undefined);
    const failure = await cancelScheduled(id);
    setPending(null);
    if (failure) setError(failure);
    else setList((current) => current.filter((s) => s.id !== id));
  }

  if (list.length === 0) return null;
  const failed = list.some((s) => s.failure);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
      >
        {failed ? <AlertCircle aria-hidden className="size-3.5 text-danger" /> : <Clock aria-hidden className="size-3.5" />}
        {list.length} scheduled {list.length === 1 ? "message" : "messages"}
        {failed && <span className="text-danger">· one couldn&apos;t be sent</span>}
      </button>
      <Dialog open={open} title="Scheduled messages" onClose={() => setOpen(false)}>
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {list.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Clock aria-hidden className="size-3.5" />
                {formatDateTime(item.sendAt)}
              </p>
              <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line">
                {summarize({ text: item.text, attachments: item.attachments }) || "Attachment"}
              </p>
              {item.failure && (
                <p className="mt-1 flex items-start gap-1 text-xs text-danger">
                  <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
                  Not sent: {item.failure}
                </p>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void cancel(item.id)}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                >
                  {item.failure ? "Dismiss" : pending === item.id ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
