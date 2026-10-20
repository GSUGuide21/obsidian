"use client";

import { useEffect, useState } from "react";
import { authorName, formatDateTime, formatRelative, summarize } from "@/lib/chat/format";
import type { MessageReport, ReportsPage, User } from "@/lib/chat/types";

type ReportListProps = {
  users: Record<string, User>;
  /** Channel names by id, for where a message was. */
  channels: Record<string, string>;
  /** `undefined` if they couldn't be loaded. */
  onLoad: () => Promise<ReportsPage | undefined>;
  /** Close a report, removing the message or leaving it up. Resolves to an error message. */
  onResolve: (id: string, remove: boolean) => Promise<string | undefined>;
};

/** Moderators and up: messages members flagged, to remove or dismiss (a group settings section). */
export function ReportList({ users, channels, onLoad, onResolve }: ReportListProps) {
  /** `undefined` while loading, `null` if they couldn't be loaded. */
  const [reports, setReports] = useState<MessageReport[] | null>();
  const [known, setKnown] = useState<Record<string, User>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  // Mounted when the dialog opens, so this loads fresh each time.
  useEffect(() => {
    let active = true;
    void onLoad().then((page) => {
      if (!active) return;
      if (page) setKnown(Object.fromEntries(page.users.map((u) => [u.id, u])));
      setReports(page?.reports ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoad]);

  async function resolve(report: MessageReport, remove: boolean) {
    setPending(report.id);
    setError(undefined);
    const failure = await onResolve(report.id, remove);
    setPending(null);
    if (failure) return setError(failure);
    // Handling one settles every report about the same message.
    setReports((list) => list?.filter((r) => r.messageId !== report.messageId));
  }

  if (reports === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (reports === null) return <p className="text-sm text-muted">Couldn&apos;t load the reports. Try again.</p>;

  const nameOf = (id: string | undefined) => (id ? authorName(users[id] ?? known[id], id) : "Unknown user");

  return (
    <div className="space-y-3">
      {reports.length === 0 ? (
        <p className="text-sm text-muted">No open reports. Nice.</p>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {reports.map((report) => {
            const channel = channels[report.message.subgroupId];
            return (
              <li key={report.id} className="rounded-lg border border-border p-3">
                <p className="text-sm">
                  <span className="font-medium">{nameOf(report.reporterId)}</span> reported a message by{" "}
                  <span className="font-medium">{nameOf(report.authorId)}</span>
                  {channel && <> in #{channel}</>}{" "}
                  <time
                    dateTime={new Date(report.at).toISOString()}
                    title={formatDateTime(report.at)}
                    className="text-xs text-muted"
                  >
                    {formatRelative(report.at)}
                  </time>
                </p>
                {report.reason && <p className="mt-1 text-sm wrap-break-word">&ldquo;{report.reason}&rdquo;</p>}
                <blockquote className="mt-2 rounded-lg border-l-2 border-border bg-surface-2 px-3 py-2 text-xs">
                  <p className="mb-0.5 text-muted">
                    {nameOf(report.message.authorId)} · {formatDateTime(report.message.createdAt)}
                    {report.message.threadId && " · in a thread"}
                  </p>
                  <p className="whitespace-pre-line wrap-break-word">
                    {summarize(report.message) || <span className="text-muted italic">No text</span>}
                  </p>
                </blockquote>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void resolve(report, false)}
                    className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void resolve(report, true)}
                    className="h-8 rounded-lg bg-danger-strong px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {pending === report.id ? "Working…" : "Remove message"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">
        Removing or dismissing is recorded in the moderation log. Reporters stay anonymous to the person they reported.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
