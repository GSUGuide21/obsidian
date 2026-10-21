"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Search as SearchIcon, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Radio from "@/components/form/Radio";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { authorName, formatPreviewTime } from "@/lib/chat/format";
import { useT } from "@/lib/i18n";
import { hasSearchTerms, parseSearch, resolveAuthors, resolveChannel, SEARCH_FILTERS } from "@/lib/chat/searchQuery";
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
  const t = useT();
  // `groups` is everything you can read, to say where each result is.
  const { groups, users, selfId } = state;
  const connected = state.status === "ready";
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>(isDm(group) ? "channel" : "group");
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  // Filters (from:, in:, has:, before:, after:, on:) resolved against who and what you know.
  const parsed = useMemo(() => parseSearch(trimmed), [trimmed]);
  const authors = resolveAuthors(parsed.from, users, selfId);
  // in: picks a channel among the ones being searched (this group, unless searching everywhere).
  const inGroups = scope === "all" ? groups.filter((g) => g.role) : [group];
  const inChannel = parsed.in === undefined ? undefined : resolveChannel(parsed.in, inGroups);
  const notes = [
    ...parsed.invalid.map((token) => t("search.badFilter", { token })),
    ...authors.unknown.map((name) => t("search.nobody", { name })),
    ...(parsed.in !== undefined && !inChannel ? [t("search.noChannel", { name: parsed.in })] : []),
  ];
  // A from: or in: that matched nothing would otherwise search without it.
  const unresolved = (parsed.from.length > 0 && authors.ids.length === 0) || (parsed.in !== undefined && !inChannel);
  const where = inChannel
    ? { subgroupId: inChannel.id }
    : scope === "channel"
      ? { subgroupId: subgroup.id }
      : scope === "group"
        ? { groupId: group.id }
        : {};
  const filters = {
    ...(authors.ids.length > 0 && { authorIds: authors.ids }),
    ...(parsed.has.length > 0 && { has: parsed.has }),
    ...(parsed.since !== undefined && { since: parsed.since }),
    ...(parsed.until !== undefined && { until: parsed.until }),
  };
  // Identifies one search: results for another one are stale.
  const key = JSON.stringify({ where, text: parsed.text, filters });
  const ready = hasSearchTerms(parsed, MIN_SEARCH_LENGTH) && !unresolved;

  /** Put a filter's key at the end of the query, ready for its value. */
  function addFilter(filter: string) {
    setQuery((current) => `${current.trimEnd()}${current.trim() ? " " : ""}${filter}:`);
    inputRef.current?.focus();
  }

  // Search a moment after typing stops.
  useEffect(() => {
    if (!ready || !connected) return;
    let live = true;
    const timer = setTimeout(() => {
      void onSearch({ query: parsed.text, ...where, ...filters }).then((page) => {
        if (!live) return;
        if (page) setResults({ key, ...page });
        else setFailed(key);
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `where` and the filters are what `key` is made of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, connected, onSearch]);

  async function loadMore() {
    if (!results) return;
    setLoadingMore(true);
    const page = await onSearch({ query: parsed.text, ...where, ...filters, before: results.messages.at(-1)?.id });
    setLoadingMore(false);
    if (page && results.key === key) {
      setResults({ ...results, messages: [...results.messages, ...page.messages], users: [...results.users, ...page.users], hasMore: page.hasMore });
    }
  }

  const current = results?.key === key ? results : null;
  const everyone = { ...Object.fromEntries((current?.users ?? []).map((u) => [u.id, u])), ...users };
  const words = parsed.text.toLowerCase().split(/\s+/).filter(Boolean);
  const scopes: { scope: Scope; label: string }[] = isDm(group)
    ? [
        { scope: "channel", label: t("search.thisConversation") },
        { scope: "all", label: t("search.allChats") },
      ]
    : [
        { scope: "channel", label: `#${subgroup.name}` },
        { scope: "group", label: group.name },
        { scope: "all", label: t("search.allChats") },
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
      aria-label={t("search.title")}
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-border lg:bg-surface"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="flex-1 leading-tight font-semibold">{t("search.title")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("search.close")}
          title={t("search.close")}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <label className="relative block">
          <span className="sr-only">{t("chat.search")}</span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
        <Radio.Group type="segment" value={scope} onChange={setScope} aria-label={t("search.in")} className="w-full">
          {scopes.map((option) => (
            <Radio key={option.scope} value={option.scope} className="px-2.5 py-1 text-xs">
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
        <div role="group" aria-label={t("search.addFilter")} className="flex flex-wrap gap-1">
          {SEARCH_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => addFilter(filter.key)}
              title={`${t(`search.filter.${filter.key}`)}: ${filter.example}`}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {filter.key}:
            </button>
          ))}
        </div>
        {notes.length > 0 && (
          <ul role="status" className="space-y-0.5 text-xs text-warning">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
        {!ready ? (
          <div className="px-2 py-6 text-sm text-muted">
            <p className="text-center">{t("search.prompt", { count: MIN_SEARCH_LENGTH })}</p>
            <dl className="mx-auto mt-4 max-w-xs space-y-1.5 text-xs">
              {SEARCH_FILTERS.map((filter) => (
                <div key={filter.key} className="flex gap-3">
                  <dt className="w-32 shrink-0 font-mono text-foreground">{filter.example}</dt>
                  <dd>{t(`search.filter.${filter.key}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : failed === key && !current ? (
          <p role="alert" className="px-2 py-8 text-center text-sm text-danger">
            {t("search.failed")}
          </p>
        ) : !current ? (
          <div className="space-y-2 p-1" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
            <span className="sr-only">{t("search.searching")}</span>
          </div>
        ) : current.messages.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">{t("search.none")}</p>
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
                      {message.threadId && <MessagesSquare aria-label={t("search.inThread")} className="size-3 shrink-0 text-muted" />}
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
            {loadingMore ? t("search.loading") : t("search.older")}
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
