"use client";

import { useEffect, useState } from "react";
import { Ellipsis, MessageCircle, Search, UserRound } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { CustomStatus, STATUS_LABELS } from "@/components/chat/Status";
import { UserMenu } from "@/components/chat/UserMenu";
import type { User } from "@/lib/chat/types";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useT } from "@/lib/i18n";

/** People found so far for one search; `null` when loading it failed. */
type Found = { query: string; ids: string[]; hasMore: boolean } | null;

const isGuest = (id: string) => id.startsWith("guest-");

/**
 * Discover's People tab: everyone signed in who lets themselves be found
 * (see "people:list"), most recently around first, to message or call.
 */
export default function People({ onOpenChat }: { onOpenChat: (subgroupId: string) => void }) {
  const { state, findPeople, openDm } = useChatContext();
  const t = useT();
  const connected = state.status === "ready";
  const [query, setQuery] = useState("");
  const search = useDebounce(query.trim(), 300);
  const [found, setFound] = useState<Found>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState<string>();
  // Guests have no account to message from: they can look, not start conversations.
  const canMessage = !isGuest(state.selfId);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void findPeople(search).then((page) => {
      if (!active) return;
      setFound(page ? { query: search, ids: page.users.map((u) => u.id), hasMore: page.hasMore } : null);
    });
    return () => {
      active = false;
    };
  }, [search, connected, findPeople]);

  // Results for an older search don't show under a newer one.
  const current = found && found.query === search ? found : found === null ? null : undefined;

  async function loadMore() {
    if (!current) return;
    setLoadingMore(true);
    const page = await findPeople(search, current.ids.length);
    setLoadingMore(false);
    if (page) {
      setFound({
        query: search,
        ids: [...new Set([...current.ids, ...page.users.map((u) => u.id)])],
        hasMore: page.hasMore,
      });
    }
  }

  async function message(user: User) {
    setOpening(user.id);
    setError(undefined);
    const result = await openDm([user.id]);
    setOpening(undefined);
    if (result.ok) onOpenChat(result.subgroupId);
    else setError(result.error);
  }

  // Live records (presence, status) for the people found.
  const people = (current?.ids ?? []).flatMap((id) => (state.users[id] ? [state.users[id]] : []));

  return (
    <section aria-labelledby="discover-people" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="discover-people" className="text-sm font-semibold">
          {t("people.title")}
        </h2>
        <p className="text-xs text-muted">
          {t("people.intro")}
        </p>
      </div>

      <label className="relative block">
        <span className="sr-only">{t("people.find")}</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("people.find")}
          className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </label>

      {!canMessage && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t("people.guestNote")}</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {current === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
          <span className="sr-only">{t("people.loading")}</span>
        </div>
      ) : current === null ? (
        <p role="alert" className="py-8 text-center text-sm text-danger">
          {t("people.failed")}
        </p>
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center text-sm text-muted">
          <UserRound aria-hidden className="mb-2 size-6" />
          {search ? t("people.noneMatching", { query: search }) : t("people.none")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((user) => (
            <li key={user.id}>
              <PersonCard
                user={user}
                canMessage={canMessage}
                opening={opening === user.id}
                onMessage={() => void message(user)}
              />
            </li>
          ))}
        </ul>
      )}

      {current?.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore || !connected}
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
          >
            {loadingMore ? t("people.loadingMore") : t("people.more")}
          </button>
        </div>
      )}
    </section>
  );
}

function PersonCard({
  user,
  canMessage,
  opening,
  onMessage,
}: {
  user: User;
  canMessage: boolean;
  opening: boolean;
  onMessage: () => void;
}) {
  const t = useT();
  return (
    <article aria-label={user.name} className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="lg" status={user.status} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{user.name}</h3>
          <p className="truncate text-xs text-muted">
            {user.statusEmoji || user.statusText ? <CustomStatus user={user} /> : STATUS_LABELS[user.status]}
          </p>
        </div>
        <UserMenu userId={user.id}>
          {(props) =>
            props && (
              <button
                type="button"
                {...props}
                aria-label={t("people.moreFor", { name: user.name })}
                title={t("people.moreTitle")}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2"
              >
                <Ellipsis className="size-4" />
              </button>
            )
          }
        </UserMenu>
      </div>
      {user.bio && <p className="line-clamp-3 text-sm wrap-break-word">{user.bio}</p>}
      {canMessage && (
        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={onMessage}
            disabled={opening}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            <MessageCircle aria-hidden className="size-4" />
            {opening ? t("people.opening") : t("people.message")}
          </button>
        </div>
      )}
    </article>
  );
}
