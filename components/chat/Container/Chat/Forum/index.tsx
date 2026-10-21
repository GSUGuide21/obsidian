"use client";

import { useEffect, useEffectEvent, useId, useMemo, useState, type ReactNode } from "react";
import { MessageSquare, MessagesSquare, Pin, Plus, RotateCw, Search as SearchIcon, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Input from "@/components/form/Input";
import { authorName, formatRelative, postTitle, summarize } from "@/lib/chat/format";
import { listPosts } from "@/lib/chat/forum";
import {
  cleanTitle,
  MAX_POST_TAGS,
  MAX_TITLE_LENGTH,
  type Attachment,
  type ForumPage,
  type ForumQuery,
  type ForumSort,
  type ForumTag,
  type Message,
  type Subgroup,
  type User,
} from "@/lib/chat/types";
import type { ChatMessage } from "@/lib/chat/useChat";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { cn } from "@/lib/utils";

/**
 * How far the pages loaded for one query reach: `key` names the query,
 * `cursor` fetches the next page and `boundary` is where they end (see ForumPage).
 */
type Loaded = { key: string; cursor?: string; boundary?: number; hasMore: boolean };

type ForumProps = {
  subgroup: Subgroup;
  /** The channel's loaded posts (any order); `undefined` before the first page. */
  posts?: ChatMessage[];
  users: Record<string, User>;
  connected: boolean;
  /** The post whose thread is open beside the forum. */
  openThreadId?: string;
  /** Why you can't start a post (e.g. muted), shown instead of the button; absent when you can. */
  readOnly?: ReactNode;
  onOpen: (post: Message) => void;
  /** Load a page of posts for `query` (the first, or the one after `cursor`). */
  onLoad: (query: ForumQuery, cursor?: string) => Promise<ForumPage | undefined>;
  onRetry: (message: ChatMessage) => void;
  /**
   * The new post's body: a composer that sends with `title` and `tags` (an
   * empty title holds sending). `onSent` closes the form.
   */
  renderComposer: (post: { title: string; tags: string[] }, onSent: () => void) => ReactNode;
};

/** A forum channel: its posts as cards, by latest activity, with search, tags and a form to start one. Replies happen in each post's thread. */
export default function Forum({
  subgroup,
  posts,
  users,
  connected,
  openThreadId,
  readOnly,
  onOpen,
  onLoad,
  onRetry,
  renderComposer,
}: ForumProps) {
  const [sort, setSort] = useState<ForumSort>("activity");
  const [text, setText] = useState("");
  const [tag, setTag] = useState<string>();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const tags = useMemo(() => subgroup.tags ?? [], [subgroup.tags]);
  // A tag that was removed from the forum can't filter it anymore.
  const activeTag = tag && tags.some((t) => t.id === tag) ? tag : undefined;
  const search = useDebounce(text.trim(), 300);
  const query = useMemo<ForumQuery>(
    () => ({ sort, ...(search && { query: search }), ...(activeTag && { tag: activeTag }) }),
    [sort, search, activeTag],
  );
  const key = JSON.stringify(query);
  const current = loaded?.key === key ? loaded : null;

  // The first page, whenever the query changes, and again after reconnecting (posts may have changed).
  const showFirst = (page: ForumPage | undefined) => {
    setFailed(!page);
    if (page) setLoaded({ key, cursor: page.cursor, boundary: page.hasMore ? page.boundary : undefined, hasMore: page.hasMore });
  };
  const fetchFirst = useEffectEvent(() => onLoad(query));
  const onFirst = useEffectEvent(showFirst);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    void fetchFirst().then((page) => {
      if (active) onFirst(page);
    });
    return () => {
      active = false;
    };
  }, [key, connected]);
  const loadFirst = async () => showFirst(await onLoad(query));

  async function loadMore() {
    if (!current?.cursor || loadingMore) return;
    setLoadingMore(true);
    const page = await onLoad(query, current.cursor);
    setLoadingMore(false);
    if (!page) return setFailed(true);
    setLoaded((previous) =>
      previous?.key === key
        ? { key, cursor: page.cursor, boundary: page.hasMore ? page.boundary : undefined, hasMore: page.hasMore }
        : previous,
    );
  }

  const shown = useMemo(
    () => (current ? listPosts(posts ?? [], query, current.boundary) : []),
    [posts, query, current],
  );

  function closeForm() {
    setWriting(false);
    setTitle("");
    setNewTags([]);
  }

  const filtering = Boolean(search || activeTag);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              size="sm"
              type="search"
              aria-label={`Search posts in #${subgroup.name}`}
              placeholder="Search posts"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pl-8"
            />
          </div>
          <div role="radiogroup" aria-label="Sort posts" className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
            {(
              [
                ["activity", "Recent activity"],
                ["newest", "Newest"],
              ] as const
            ).map(([option, label]) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={sort === option}
                onClick={() => setSort(option)}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  sort === option ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {!readOnly && !writing && (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus aria-hidden className="size-4" />
              New post
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} pressed={activeTag === t.id} onToggle={() => setTag(activeTag === t.id ? undefined : t.id)} />
            ))}
          </div>
        )}
      </div>

      {readOnly && <div className="shrink-0 px-4 pt-3">{readOnly}</div>}

      {writing && !readOnly && (
        <section aria-label="New post" className="shrink-0 border-b border-border bg-surface px-4 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor={titleId} className="sr-only">
              Title
            </label>
            <Input
              id={titleId}
              autoFocus
              maxLength={MAX_TITLE_LENGTH}
              placeholder="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeForm();
              }}
              className="flex-1 text-base font-semibold"
            />
            <button
              type="button"
              onClick={closeForm}
              aria-label="Discard post"
              title="Discard post"
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          {tags.length > 0 && <TagPicker tags={tags} value={newTags} onChange={setNewTags} className="mb-2" />}
          {renderComposer({ title: cleanTitle(title), tags: newTags }, closeForm)}
        </section>
      )}

      <div role="feed" aria-busy={!current} aria-label={`Posts in #${subgroup.name}`} className="flex-1 overflow-y-auto px-4 py-3">
        {!current ? (
          failed ? (
            <div className="py-10 text-center text-sm text-muted">
              <p>Couldn&apos;t load the posts.</p>
              <button
                type="button"
                onClick={() => void loadFirst()}
                disabled={!connected}
                className="mt-2 font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-40"
              >
                Try again
              </button>
            </div>
          ) : (
            <PostsSkeleton />
          )
        ) : shown.length === 0 ? (
          filtering ? (
            <p className="py-10 text-center text-sm text-muted">No posts match.</p>
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2">
                <MessagesSquare aria-hidden className="size-6 text-muted" />
              </div>
              <h2 className="font-semibold">No posts in #{subgroup.name} yet</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {subgroup.topic ? `${subgroup.topic}. ` : ""}
                Each post gets its own thread, so conversations stay together.
              </p>
              {!readOnly && !writing && (
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className="mt-4 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  Start a post
                </button>
              )}
            </div>
          )
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {shown.map((post, index) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  users={users}
                  tags={tags}
                  activeTag={activeTag}
                  open={openThreadId === post.id}
                  position={index + 1}
                  total={shown.length}
                  onOpen={() => onOpen(post)}
                  onRetry={() => onRetry(post)}
                  onTag={(id) => setTag(id)}
                />
              </li>
            ))}
          </ul>
        )}
        {current?.hasMore && (
          <div className="mx-auto mt-3 flex max-w-3xl justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={!connected || loadingMore}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              {loadingMore ? "Loading…" : "Load more posts"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A tag as a toggle button (filtering, picking a post's tags). */
export function TagChip({
  tag,
  pressed,
  disabled,
  onToggle,
}: {
  tag: ForumTag;
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-40",
        pressed
          ? "border-accent bg-accent/15 text-foreground"
          : "border-border text-muted hover:border-muted/50 hover:text-foreground",
      )}
    >
      {tag.name}
    </button>
  );
}

/** Pick up to MAX_POST_TAGS of a forum's tags for a post. */
export function TagPicker({
  tags,
  value,
  onChange,
  className,
}: {
  tags: ForumTag[];
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}) {
  const full = value.length >= MAX_POST_TAGS;
  return (
    <div role="group" aria-label={`Tags (up to ${MAX_POST_TAGS})`} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-xs text-muted">Tags</span>
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <TagChip
            key={t.id}
            tag={t}
            pressed={on}
            disabled={!on && full}
            onToggle={() => onChange(on ? value.filter((id) => id !== t.id) : [...value, t.id])}
          />
        );
      })}
    </div>
  );
}

function PostCard({
  post,
  users,
  tags,
  activeTag,
  open,
  position,
  total,
  onOpen,
  onRetry,
  onTag,
}: {
  post: ChatMessage;
  users: Record<string, User>;
  tags: ForumTag[];
  activeTag?: string;
  open: boolean;
  position: number;
  total: number;
  onOpen: () => void;
  onRetry: () => void;
  onTag: (id: string) => void;
}) {
  const author = users[post.authorId];
  const name = authorName(author, post.authorId);
  const excerpt = post.deleted ? "This post was deleted." : post.title ? summarize(post) : "";
  const replies = post.thread?.count ?? 0;
  const sent = !post.status;
  const media = post.attachments?.find((a): a is Extract<Attachment, { type: "image" }> => a.type === "image");
  const postTags = tags.filter((t) => post.tags?.includes(t.id));

  return (
    <article
      // jumpTo (pins, search) finds posts by this id and flashes them.
      id={`message-${post.id}`}
      tabIndex={-1}
      aria-posinset={position}
      aria-setsize={total}
      className={cn(
        "group/post relative flex gap-3 rounded-xl border bg-surface p-3 transition-colors outline-none",
        open ? "border-accent/60 bg-accent/5" : "border-border hover:border-muted/40 hover:bg-surface-2/60",
        post.status === "sending" && "opacity-60",
      )}
    >
      <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="md" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 leading-snug font-semibold">
          {post.pinned && <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-accent-bright" />}
          {sent ? (
            // The whole card opens the post: the title's button stretches over it.
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                "min-w-0 truncate text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent",
                post.deleted && "text-muted italic",
              )}
            >
              {postTitle(post)}
            </button>
          ) : (
            <span className="min-w-0 truncate">{postTitle(post)}</span>
          )}
        </h3>
        {postTags.length > 0 && (
          // Above the card's stretched button, so a tag filters by it instead of opening the post.
          <div className="relative z-10 mt-1 flex flex-wrap gap-1">
            {postTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTag(t.id)}
                aria-label={`Show posts tagged ${t.name}`}
                className={cn(
                  "rounded-full px-2 py-px text-[11px] font-medium transition-colors",
                  activeTag === t.id ? "bg-accent/20 text-foreground" : "bg-surface-2 text-muted hover:text-foreground",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {excerpt && <p className="mt-1 line-clamp-2 text-sm wrap-break-word text-muted">{excerpt}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            <span className="font-medium text-foreground">{name}</span> · {formatRelative(post.createdAt)}
          </span>
          {post.status === "sending" && <span>Posting…</span>}
          {post.status === "failed" && (
            <span className="relative z-10 inline-flex items-center gap-2 text-danger">
              {post.error ?? "Couldn't post."}
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                <RotateCw aria-hidden className="size-3" />
                Retry
              </button>
            </span>
          )}
          {sent && (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare aria-hidden className="size-3.5" />
              {replies === 0 ? "No replies yet" : `${replies} ${replies === 1 ? "reply" : "replies"}`}
              {post.thread && <span>· last {formatRelative(post.thread.lastAt)}</span>}
            </span>
          )}
          {post.thread && post.thread.participants.length > 0 && (
            <span aria-hidden className="ml-auto flex -space-x-1.5">
              {post.thread.participants.map((id) => {
                const user = users[id];
                return (
                  <Avatar
                    key={id}
                    name={authorName(user, id)}
                    color={user?.color ?? "#6b7280"}
                    src={user?.avatarUrl}
                    size="xs"
                    className="size-5 rounded-md ring-2 ring-surface"
                  />
                );
              })}
            </span>
          )}
        </p>
      </div>
      {media && !post.deleted && (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads and GIFs from any host
        <img src={media.src} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover max-sm:hidden" />
      )}
    </article>
  );
}

function PostsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-2" aria-hidden>
      {[60, 40, 52].map((width, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-border p-3">
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${width}%` }} />
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading posts…</span>
    </div>
  );
}
