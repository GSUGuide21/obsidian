"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Compass, Menu, MessagesSquare, Search, Users as UsersIcon } from "lucide-react";
import Event from "@/components/chat/Container/Chat/Message/Attachment/Event";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { authorName, formatRelative } from "@/lib/chat/format";
import {
  eventEnd,
  isListedEvent,
  type DiscoverGroup,
  type DiscoverPage,
  type EventAttachment,
  type Group,
  type Message,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type DiscoverProps = {
  /** Open the group's first channel. */
  onOpenGroup: (groupId: string) => void;
  /** Go to the message an event was posted in. */
  onOpenEvent: (message: Message) => void;
  onOpenSidebar: () => void;
};

/** Public groups to browse and join, and what's coming up in them. */
export default function Discover({ onOpenGroup, onOpenEvent, onOpenSidebar }: DiscoverProps) {
  const { state, watchDiscover: onWatch, joinGroup: onJoin } = useChatContext();
  // `latest` is the latest message per channel, for when each group was last active.
  const { groups, latest, users } = state;
  const connected = state.status === "ready";
  // `null` when loading failed.
  const [page, setPage] = useState<DiscoverPage | null>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [joining, setJoining] = useState<string>();
  // Joined from this page and not yet in a page from the server (which reflects joins made before it was sent).
  const [joinedHere, setJoinedHere] = useState<ReadonlySet<string>>(new Set());
  const [joinError, setJoinError] = useState<{ groupId: string; error: string }>();

  // Watch while shown; the server's room is lost on reconnecting, so watch again then.
  useEffect(() => {
    if (!connected) return;
    return onWatch((loaded) => {
      setPage(loaded ?? null);
      if (loaded) setJoinedHere(new Set());
    });
  }, [connected, onWatch, attempt]);

  async function join(groupId: string) {
    setJoining(groupId);
    setJoinError(undefined);
    const error = await onJoin(groupId);
    setJoining(undefined);
    if (error) setJoinError({ groupId, error });
    else setJoinedHere((current) => new Set(current).add(groupId));
  }

  const stats = new Map(page?.groups.map((g) => [g.id, g]));
  const needle = query.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) =>
    !needle || texts.some((text) => text?.toLowerCase().includes(needle));
  const listed = groups
    .filter((g) => g.visibility !== "private" && !g.invited)
    .filter((g) => matches(g.name, g.description, ...g.subgroups.map((s) => s.name)))
    // Biggest first; groups the server hasn't counted yet go last.
    .sort((a, b) => (stats.get(b.id)?.memberCount ?? -1) - (stats.get(a.id)?.memberCount ?? -1));
  const groupOf = (message: Message) => groups.find((g) => g.subgroups.some((s) => s.id === message.subgroupId));
  const events = page?.events.filter((message) => {
    const group = groupOf(message);
    return group && matches(group.name, ...upcoming(message).map((e) => e.title));
  });
  const eventUsers = { ...Object.fromEntries(page?.users.map((u) => [u.id, u]) ?? []), ...users };

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open groups"
          className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Compass aria-hidden className="size-5 text-muted" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate leading-tight font-semibold">Discover</h1>
          <p className="truncate text-xs text-muted">Public groups and upcoming events</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
          <label className="relative block">
            <span className="sr-only">Search groups and events</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search groups, channels and events"
              className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </label>

          {page === null && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              Couldn&apos;t load group stats and events.{" "}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium underline">
                Try again
              </button>
            </p>
          )}

          <section aria-labelledby="discover-groups">
            <h2 id="discover-groups" className="mb-3 text-sm font-semibold">
              Groups
            </h2>
            {listed.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {needle ? "No groups match your search." : "There are no public groups yet."}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {listed.map((group) => (
                  <li key={group.id}>
                    <GroupCard
                      group={group}
                      stats={stats.get(group.id)}
                      joined={Boolean(stats.get(group.id)?.joined) || joinedHere.has(group.id)}
                      lastActiveAt={lastActive(group, latest)}
                      loading={page === undefined}
                      joining={joining === group.id}
                      error={joinError?.groupId === group.id ? joinError.error : undefined}
                      onJoin={() => void join(group.id)}
                      onOpen={() => onOpenGroup(group.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="discover-events">
            <h2 id="discover-events" className="mb-3 text-sm font-semibold">
              Upcoming events
            </h2>
            {page === undefined ? (
              <div className="space-y-2" aria-busy>
                {[0, 1].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />
                ))}
                <span className="sr-only">Loading</span>
              </div>
            ) : !events?.length ? (
              <p className="py-8 text-center text-sm text-muted">
                {needle ? "No events match your search." : "Nothing coming up in public groups."}
              </p>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {events.map((message) => {
                  const group = groupOf(message)!;
                  const channel = group.subgroups.find((s) => s.id === message.subgroupId)!;
                  const author = eventUsers[message.authorId];
                  const label = message.threadId ? "Open its thread" : `Go to #${channel.name}`;
                  return (
                    <li key={message.id}>
                      <div className="mb-1.5 flex items-center gap-2 text-xs">
                        <Avatar name={group.name} color={group.color} shape="square" size="xs" className="size-5 rounded-md" />
                        <span className="truncate font-semibold">{group.name}</span>
                        <span className="shrink-0 truncate text-[11px] text-muted">
                          #{channel.name} · {authorName(author, message.authorId)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenEvent(message)}
                          aria-label={label}
                          title={label}
                          className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                        >
                          {message.threadId ? <MessagesSquare className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {upcoming(message).map((event, index) => (
                          <Event key={index} attachment={event} />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/** The message's public events that haven't ended (others in it stay with the group). */
function upcoming(message: Message) {
  const now = Date.now();
  return (message.attachments ?? []).filter(
    (a): a is EventAttachment => a.type === "event" && isListedEvent(a) && eventEnd(a) >= now,
  );
}

/** When the newest channel message in the group was posted; undefined if there are none. */
function lastActive(group: Group, latest: Record<string, Message>) {
  const at = Math.max(0, ...group.subgroups.map((s) => latest[s.id]?.createdAt ?? 0));
  return at > 0 ? at : undefined;
}

function GroupCard({
  group,
  stats,
  joined,
  lastActiveAt,
  loading,
  joining,
  error,
  onJoin,
  onOpen,
}: {
  group: Group;
  stats?: DiscoverGroup;
  joined: boolean;
  lastActiveAt?: number;
  loading: boolean;
  joining: boolean;
  error?: string;
  onJoin: () => void;
  onOpen: () => void;
}) {
  const channels = group.subgroups.slice(0, 4);
  const more = group.subgroups.length - channels.length;
  return (
    <article
      aria-label={group.name}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <Avatar name={group.name} color={group.color} shape="square" size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{group.name}</h3>
          {loading ? (
            <span className="mt-1 block h-3 w-28 animate-pulse rounded bg-surface-2" />
          ) : (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {stats?.memberCount !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <UsersIcon aria-hidden className="size-3" />
                  {stats.memberCount} {stats.memberCount === 1 ? "member" : "members"}
                </span>
              )}
              {stats && stats.onlineCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="size-1.5 rounded-full bg-online" />
                  {stats.onlineCount} online
                </span>
              )}
              {lastActiveAt && <span>Active {formatRelative(lastActiveAt)}</span>}
            </p>
          )}
        </div>
      </div>

      {group.description && <p className="line-clamp-3 text-sm">{group.description}</p>}

      {channels.length > 0 && (
        <ul aria-label="Channels" className="flex flex-wrap gap-1.5 text-xs text-muted">
          {channels.map((channel) => (
            <li key={channel.id} title={channel.topic} className="rounded-md bg-surface-2 px-1.5 py-0.5">
              #{channel.name}
            </li>
          ))}
          {more > 0 && <li className="px-1 py-0.5">+{more} more</li>}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        {joined ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-online">
            <Check aria-hidden className="size-3.5" />
            Joined
          </span>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={joining || loading}
            className="h-8 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join"}
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          disabled={group.subgroups.length === 0}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-40",
            joined ? "ml-auto border border-border" : "text-muted hover:text-foreground",
          )}
        >
          {joined ? "Open" : "Preview"}
        </button>
      </div>
    </article>
  );
}
