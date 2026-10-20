"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkX, MessagesSquare, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { authorName, formatPreviewTime, summarize } from "@/lib/chat/format";
import { dmName, isDm, type Message, type SavedPage } from "@/lib/chat/types";

type SavedProps = {
  /** Go to a message: its thread, or its place in its channel. */
  onOpen: (message: Message) => void;
  onClose: () => void;
};

/** Side panel with the messages you saved for later, across all your chats, most recently saved first. */
export default function Saved({ onOpen, onClose }: SavedProps) {
  const { state, loadSaved, setSaved } = useChatContext();
  const { groups, users, selfId } = state;
  const connected = state.status === "ready";
  const [page, setPage] = useState<SavedPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  // Reload when something new is saved (un-saving just hides it, below).
  const newest = state.saved[0];

  useEffect(() => {
    if (!connected) return;
    let live = true;
    void loadSaved().then((result) => {
      if (!live) return;
      if (result) {
        setPage(result);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [connected, newest, loadSaved]);

  async function loadMore() {
    if (!page) return;
    setLoadingMore(true);
    const more = await loadSaved(page.messages.at(-1)?.id);
    setLoadingMore(false);
    if (more) {
      setPage({ messages: [...page.messages, ...more.messages], users: [...page.users, ...more.users], hasMore: more.hasMore });
    }
  }

  async function unsave(message: Message) {
    setError(await setSaved(message.id, false));
  }

  const saved = new Set(state.saved);
  const messages = page?.messages.filter((m) => saved.has(m.id)) ?? [];
  const everyone = { ...Object.fromEntries((page?.users ?? []).map((u) => [u.id, u])), ...users };

  /** Where a message is: "#channel · Group", or the DM's name. */
  function location(message: Message) {
    const home = groups.find((g) => g.subgroups.some((s) => s.id === message.subgroupId));
    if (!home) return "";
    if (isDm(home)) return dmName(home, users, selfId);
    return `#${home.subgroups.find((s) => s.id === message.subgroupId)?.name ?? "channel"} · ${home.name}`;
  }

  return (
    <aside
      aria-label="Saved messages"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-border lg:bg-surface"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="flex-1 leading-tight font-semibold">Saved messages</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close saved messages"
          title="Close"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
        {error && (
          <p role="alert" className="px-2 pb-2 text-xs text-danger">
            {error}
          </p>
        )}
        {failed && !page ? (
          <p role="alert" className="px-2 py-8 text-center text-sm text-danger">
            Couldn&apos;t load your saved messages. Try again.
          </p>
        ) : !page ? (
          <div className="space-y-2 p-1" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
            <span className="sr-only">Loading saved messages</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            <Bookmark aria-hidden className="mx-auto mb-2 size-6" />
            <p className="font-medium text-foreground">Nothing saved yet</p>
            <p className="mt-1">Save a message for later from its actions. Only you see what you save.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {messages.map((message) => {
              const author = everyone[message.authorId];
              const name = authorName(author, message.authorId);
              return (
                <li key={message.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpen(message)}
                    className="w-full rounded-lg px-2 py-2 pr-9 text-left hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="xs" className="size-5" />
                      <span className="truncate font-semibold">{name}</span>
                      <span className="min-w-0 truncate text-[11px] text-muted">{location(message)}</span>
                      {message.threadId && <MessagesSquare aria-label="In a thread" className="size-3 shrink-0 text-muted" />}
                      <time dateTime={new Date(message.createdAt).toISOString()} className="ml-auto shrink-0 text-[11px] text-muted">
                        {formatPreviewTime(message.createdAt)}
                      </time>
                    </span>
                    <span className="mt-1 line-clamp-3 text-sm wrap-break-word whitespace-pre-line">{summarize(message)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void unsave(message)}
                    aria-label={`Remove ${name}'s message from saved`}
                    title="Remove from saved"
                    className="absolute top-1.5 right-1.5 rounded-md p-1.5 text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface hover:text-foreground pointer-coarse:opacity-100"
                  >
                    <BookmarkX className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {page?.hasMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="mx-auto mt-2 block h-8 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Show earlier saves"}
          </button>
        )}
      </div>
    </aside>
  );
}
