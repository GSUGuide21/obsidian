"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import Dialog from "@/components/Dialog";
import ChannelIcon from "@/components/chat/ChannelIcon";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import UnreadBadge from "@/components/chat/GroupList/Group/UnreadBadge";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { rank, type Searchable } from "@/lib/chat/switcher";
import { dmName, isDm, isOnline } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** "⌘" on Apple devices, "Ctrl" elsewhere: how the shortcut is written. */
export function modifierKey() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

/** Whether a key press is the quick switcher's shortcut (Ctrl+K, or ⌘K). */
export function isSwitcherShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}

type QuickSwitcherProps = {
  open: boolean;
  onClose: () => void;
  /** Open a channel (a group's, or a direct message's). */
  onSelect: (subgroupId: string) => void;
  /** Signed-in users: open (or start) the direct message with someone. Resolves to an error message. */
  onMessage?: (userId: string) => Promise<string | undefined>;
};

/**
 * Jump anywhere from the keyboard (Ctrl+K): type part of a channel, group,
 * direct message or person's name, pick with the arrow keys and Enter. With
 * nothing typed it lists what's unread first. Everything comes from what the
 * chat already has loaded.
 */
export default function QuickSwitcher({ open, onClose, ...props }: QuickSwitcherProps) {
  return (
    <Dialog open={open} title="Jump to" onClose={onClose}>
      {open && <Switcher onClose={onClose} {...props} />}
    </Dialog>
  );
}

type Item = Searchable & {
  key: string;
  icon: ReactNode;
  /** Under the name: its group, or what it is. */
  detail: string;
  unread: number;
  mention: boolean;
  /** Only listed once something's typed (there are too many otherwise). */
  searchOnly?: boolean;
  /** A channel to open, or someone to message. */
  target: { subgroupId: string } | { userId: string };
};

function Switcher({ onClose, onSelect, onMessage }: Omit<QuickSwitcherProps, "open">) {
  const { state } = useChatContext();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const listId = useId();

  const items = useMemo(() => {
    const list: Item[] = [];
    // Counted as in the sidebar: what's unread, or at least what's addressed to you.
    const countOf = (id: string) => Math.max(state.unread[id] ?? 0, state.mentions[id] ?? 0);
    const unreadOf = (id: string) => ({ unread: countOf(id), mention: (state.mentions[id] ?? 0) > 0 });
    // People you already have a one-on-one with are found by it.
    const oneOnOne = new Set<string>();
    for (const group of state.groups) {
      if (!group.role || group.invited) continue;
      if (isDm(group)) {
        const channel = group.subgroups[0];
        if (!channel) continue;
        const others = (group.members ?? []).filter((id) => id !== state.selfId);
        if (others.length === 1) oneOnOne.add(others[0]);
        const other = others.length === 1 ? state.users[others[0]] : undefined;
        list.push({
          key: `dm:${group.id}`,
          label: dmName(group, state.users, state.selfId),
          keywords: others.map((id) => state.users[id]?.name ?? ""),
          icon: other ? (
            <Avatar name={other.name} color={other.color} src={other.avatarUrl} size="xs" />
          ) : (
            <Avatar name={dmName(group, state.users, state.selfId)} color="#6b7280" size="xs" />
          ),
          detail: others.length === 1 ? "Direct message" : `Group message · ${others.length + 1} people`,
          ...unreadOf(channel.id),
          target: { subgroupId: channel.id },
        });
        continue;
      }
      const first = group.subgroups[0];
      if (first) {
        const unread = group.subgroups.reduce((sum, s) => sum + countOf(s.id), 0);
        list.push({
          key: `group:${group.id}`,
          label: group.name,
          icon: <Avatar name={group.name} color={group.color} shape="square" size="xs" />,
          detail: `Group · ${group.subgroups.length} ${group.subgroups.length === 1 ? "channel" : "channels"}`,
          unread,
          mention: group.subgroups.some((s) => (state.mentions[s.id] ?? 0) > 0),
          searchOnly: true,
          target: { subgroupId: first.id },
        });
      }
      for (const channel of group.subgroups) {
        list.push({
          key: `channel:${channel.id}`,
          label: channel.name,
          keywords: [group.name, ...(channel.category ? [channel.category] : [])],
          icon: <ChannelIcon type={channel.type} className="size-4 text-muted" />,
          detail: channel.category ? `${group.name} · ${channel.category}` : group.name,
          ...unreadOf(channel.id),
          target: { subgroupId: channel.id },
        });
      }
    }
    // Anyone else signed in, to start a conversation with.
    if (onMessage) {
      const people = Object.values(state.users)
        .filter((u) => u.id !== state.selfId && u.role !== "bot" && !u.id.startsWith("guest-") && !oneOnOne.has(u.id))
        .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.name.localeCompare(b.name));
      for (const user of people) {
        list.push({
          key: `person:${user.id}`,
          label: user.name,
          icon: <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="xs" status={user.status} />,
          detail: "Start a direct message",
          unread: 0,
          mention: false,
          searchOnly: true,
          target: { userId: user.id },
        });
      }
    }
    return list;
  }, [state.groups, state.users, state.selfId, state.unread, state.mentions, onMessage]);

  const results = useMemo(() => {
    if (query.trim()) return rank(items, query, 50);
    // Nothing typed: what's waiting for you (mentions first), then your chats; not the one you're in.
    const listed = items.filter((item) => !item.searchOnly && !("subgroupId" in item.target && item.target.subgroupId === state.activeId));
    const waiting = (item: Item) => (item.mention ? 2 : item.unread > 0 ? 1 : 0);
    return listed
      .map((item, index) => ({ item, index }))
      .sort((a, b) => waiting(b.item) - waiting(a.item) || a.index - b.index)
      .slice(0, 50)
      .map(({ item }) => item);
  }, [items, query, state.activeId]);

  const current = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (index: number) => `${listId}-${index}`;

  // Keep the highlighted one in view while arrowing through a long list.
  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  async function choose(item: Item | undefined) {
    if (!item || busy) return;
    if ("subgroupId" in item.target) {
      onSelect(item.target.subgroupId);
      onClose();
      return;
    }
    if (!onMessage) return;
    setBusy(true);
    setError(undefined);
    const failure = await onMessage(item.target.userId);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current + 1) % results.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current - 1 + results.length) % results.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(results.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        void choose(results[current]);
        break;
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Channel, group, conversation or person
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id={inputId}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? optionId(current) : undefined}
          placeholder={onMessage ? "Where to? A channel, group or person" : "Where to? A channel or group"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setError(undefined);
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-input bg-surface-2 pr-3 pl-9 text-sm placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {query.trim() ? `Nothing called “${query.trim()}”.` : "Nothing to jump to yet."}
        </p>
      ) : (
        <ul id={listId} role="listbox" aria-label="Places" className="-mx-1 max-h-80 overflow-y-auto">
          {results.map((item, index) => (
            <li
              key={item.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onPointerMove={() => index !== current && setActive(index)}
              onClick={() => void choose(item)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2",
                index === current ? "bg-accent/10 text-foreground" : "text-foreground/90",
                busy && "opacity-60",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", item.unread > 0 && "font-semibold")}>{item.label}</span>
                <span className="block truncate text-xs text-muted">{item.detail}</span>
              </span>
              {item.unread > 0 && <UnreadBadge count={item.unread} mention={item.mention} />}
            </li>
          ))}
        </ul>
      )}

      <p aria-hidden className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          <Key>↑</Key> <Key>↓</Key> to move
        </span>
        <span>
          <Key>Enter</Key> to open
        </span>
        <span>
          <Key>Esc</Key> to close
        </span>
        <span className="ml-auto">
          <Key>{modifierKey()}</Key> <Key>K</Key> anywhere
        </span>
      </p>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface px-1 font-sans text-[10px] font-medium text-foreground/80">
      {children}
    </kbd>
  );
}
