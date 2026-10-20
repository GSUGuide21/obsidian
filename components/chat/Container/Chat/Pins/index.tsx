"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowRight, Pin, PinOff } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { authorName, formatPreviewTime, summarize } from "@/lib/chat/format";
import type { Message, User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import MarkdownText from "../Message/Markdown";

type PinsProps = {
  /** `undefined` until fetched. */
  pins?: Message[];
  users: Record<string, User>;
  selfId: string;
  connected: boolean;
  /** Absent for guests, who can't pin or unpin. */
  onUnpin?: (id: string) => Promise<string | undefined>;
  onLoad: () => void;
  /** Ids of messages rendered in the channel right now (the ones we can jump to). */
  loaded: ReadonlySet<string>;
  onJump: (id: string) => void;
};

/** Header button with a popover listing the channel's pinned messages. */
export default function Pins({ pins, users, selfId, connected, onUnpin, onLoad, loaded, onJump }: PinsProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const load = useEffectEvent(onLoad);
  const missing = pins === undefined;

  // Fetch when opened, and again if the list was dropped (a pin changed, or we reconnected).
  useEffect(() => {
    if (open && missing && connected) load();
  }, [open, missing, connected]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setError(undefined);
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-label="Pinned messages"
        title="Pinned messages"
        className={cn(
          "inline-flex rounded-md p-2 transition-colors hover:bg-surface-2",
          open ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
        )}
      >
        <Pin className="size-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pinned messages"
          className="absolute top-full right-0 z-30 mt-2 flex max-h-[min(70vh,32rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Pin aria-hidden className="size-4 text-warning" />
            <h2 className="text-sm font-semibold">Pinned messages</h2>
            {pins && pins.length > 0 && <span className="text-xs text-muted">{pins.length}</span>}
          </header>
          {error && (
            <p role="alert" className="border-b border-border px-4 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex-1 overflow-y-auto p-2">
            {!pins ? (
              <div className="space-y-2 p-2" aria-busy>
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
                ))}
                <span className="sr-only">Loading pinned messages</span>
              </div>
            ) : pins.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium">No pinned messages yet</p>
                <p className="mt-1 text-xs text-muted">
                  Pin a message from its hover menu to keep it handy for everyone.
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {pins.map((message) => {
                  const author = users[message.authorId];
                  const name = authorName(author, message.authorId);
                  return (
                    <li key={message.id} className="group/pin rounded-lg p-2.5 hover:bg-surface-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="xs" className="size-5" />
                        <span className="truncate text-sm font-semibold">{name}</span>
                        <time
                          dateTime={new Date(message.createdAt).toISOString()}
                          className="shrink-0 text-[11px] text-muted"
                        >
                          {formatPreviewTime(message.createdAt)}
                        </time>
                        <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-focus-within/pin:opacity-100 group-hover/pin:opacity-100 pointer-coarse:opacity-100">
                          {loaded.has(message.id) && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onJump(message.id);
                              }}
                              aria-label="Jump to message"
                              title="Jump to message"
                              className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
                            >
                              <ArrowRight className="size-3.5" />
                            </button>
                          )}
                          {onUnpin && (
                            <button
                              type="button"
                              onClick={async () => setError(await onUnpin(message.id))}
                              aria-label="Unpin"
                              title="Unpin"
                              className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
                            >
                              <PinOff className="size-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-4 text-sm wrap-break-word">
                        {message.text ? (
                          <MarkdownText text={message.text} mentions={[]} users={users} selfId={selfId} />
                        ) : (
                          <p className="text-muted italic">{summarize(message)}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
