"use client";

import { Fragment, useEffect, useState } from "react";
import { MessagesSquare, Search as SearchIcon, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Radio from "@/components/form/Radio";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { authorName, formatPreviewTime } from "@/lib/chat/format";
import {
  dmName,
  isDm,
  MIN_SEARCH_LENGTH,
  type Group,
  type Message,
  type Subgroup,
  type User,
} from "@/lib/chat/types";

type Scope = "channel" | "group" | "all";

type SearchProps = {
  /** Where you are: the default scope. */
  group: Group;
  subgroup: Subgroup;
  /** Go to a message: its thread, or its place in its channel. */
  onOpen: (message: Message) => void;
  onClose: () => void;
};

type Results = { key: string; messages: Message[]; users: User[]; hasMore: boolean };

/** Side panel searching messages in this channel, this group, or all your chats. */
export default function Search({ group, subgroup, onOpen, onClose }: SearchProps) {
  const { state, search: onSearch } = useChatContext();
  // `groups` is everything you can read, to say where each result is.
  const { groups, users, selfId } = state;
  const connected = state.status === "ready";
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>(isDm(group) ? "channel" : "group");
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const trimmed = query.trim();
  const where = scope === "channel" ? { subgroupId: subgroup.id } : scope === "group" ? { groupId: group.id } : {};
  // Identifies one search: results for another one are stale.
  const key = `${scope}:${scope === "channel" ? subgroup.id : scope === "group" ? group.id : ""}:${trimmed}`;
  const ready = trimmed.length >= MIN_SEARCH_LENGTH;

  // Search a moment after typing stops.
  useEffect(() => {
    if (!ready || !connected) return;
    let live = true;
    const timer = setTimeout(() => {
      void onSearch({ query: trimmed, ...where }).then((page) => {
        if (!live) return;
        if (page) setResults({ key, ...page });
        else setFailed(key);
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `where` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, connected, onSearch]);

  async function loadMore() {
    if (!results) return;
    setLoadingMore(true);
    const page = await onSearch({ query: trimmed, ...where, before: results.messages.at(-1)?.id });
    setLoadingMore(false);
    if (page && results.key === key) {
      setResults({ ...results, messages: [...results.messages, ...page.messages], users: [...results.users, ...page.users], hasMore: page.hasMore });
    }
  }

  const current = results?.key === key ? results : null;
  const everyone = { ...Object.fromEntries((current?.users ?? []).map((u) => [u.id, u])), ...users };
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const scopes: { scope: Scope; label: string }[] = isDm(group)
    ? [
        { scope: "channel", label: "This conversation" },
        { scope: "all", label: "All chats" },
      ]
    : [
        { scope: "channel", label: `#${subgroup.name}` },
        { scope: "group", label: group.name },
        { scope: "all", label: "All chats" },
      ];

  /** Where a result is: "#channel" (and its group when searching everywhere), or the DM's name. */
  function location(message: Message) {
    const home = groups.find((g) => g.subgroups.some((s) => s.id === message.subgroupId));
    if (!home) return "";
    if (isDm(home)) return dmName(home, users, selfId);
    const channel = `#${home.subgroups.find((s) => s.id === message.subgroupId)?.name ?? "channel"}`;
    return scope === "all" ? `${channel} · ${home.name}` : channel;
  }

  return (
    <aside
      aria-label="Search"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-border lg:bg-surface"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="flex-1 leading-tight font-semibold">Search</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          title="Close"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <label className="relative block">
          <span className="sr-only">Search messages</span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages"
            className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
        <Radio.Group type="segment" value={scope} onChange={setScope} aria-label="Search in" className="w-full">
          {scopes.map((option) => (
            <Radio key={option.scope} value={option.scope} className="px-2.5 py-1 text-xs">
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </div>

      <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
        {!ready ? (
          <p className="px-2 py-8 text-center text-sm text-muted">Type at least {MIN_SEARCH_LENGTH} characters.</p>
        ) : failed === key && !current ? (
          <p role="alert" className="px-2 py-8 text-center text-sm text-danger">
            Couldn&apos;t search right now. Try again.
          </p>
        ) : !current ? (
          <div className="space-y-2 p-1" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
            <span className="sr-only">Searching</span>
          </div>
        ) : current.messages.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">No messages match.</p>
        ) : (
          <ul className="space-y-1">
            {current.messages.map((message) => {
              const author = everyone[message.authorId];
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(message)}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <Avatar name={authorName(author, message.authorId)} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="xs" className="size-5" />
                      <span className="truncate font-semibold">{authorName(author, message.authorId)}</span>
                      <span className="min-w-0 truncate text-[11px] text-muted">{location(message)}</span>
                      {message.threadId && <MessagesSquare aria-label="In a thread" className="size-3 shrink-0 text-muted" />}
                      <time dateTime={new Date(message.createdAt).toISOString()} className="ml-auto shrink-0 text-[11px] text-muted">
                        {formatPreviewTime(message.createdAt)}
                      </time>
                    </span>
                    <span className="mt-1 line-clamp-3 text-sm wrap-break-word whitespace-pre-line">
                      <Highlight text={message.text} words={words} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {current?.hasMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="mx-auto mt-2 block h-8 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Show older results"}
          </button>
        )}
      </div>
    </aside>
  );
}

/** The text with each of `words` marked, case-insensitively. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-sm bg-warning/30 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
