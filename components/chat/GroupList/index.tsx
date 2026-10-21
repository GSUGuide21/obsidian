"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCheck,
  ChevronsUpDown,
  Compass,
  Gem,
  LogOut,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Search,
  Smile,
  SquarePen,
  Users,
  X,
} from "lucide-react";
import Menu from "@/components/Menu";
import Input from "@/components/form/Input";
import type { ManageTarget } from "@/components/chat/Manage";
import { modifierKey } from "@/components/chat/QuickSwitcher";
import { CustomStatus, PRESENCE_LABELS } from "@/components/chat/Status";
import { mainChannel, moveChannel, moveGroup } from "@/lib/chat/order";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { formatPreviewTime } from "@/lib/chat/format";
import { COLLAPSED_SECTIONS, usePersistentSet } from "@/lib/chat/prefs";
import { useT } from "@/lib/i18n";
import {
  canManageGroup,
  dmName,
  isDm,
  isMine,
  notificationLevel,
  PRESENCES,
  type Group as GroupType,
  type Message,
  type UserStatus,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { SidebarDnd, type DragItem, type DropPosition } from "./dnd";
import Group from "./Group";
import Avatar from "./Group/Avatar";
import Preview from "./Group/Preview";
import UnreadBadge from "./Group/UnreadBadge";

type GroupListProps = {
  /** Mobile drawer visibility. Always visible from the md breakpoint up. */
  open: boolean;
  onClose: () => void;
  onSelect: (subgroupId: string) => void;
  onSignOut: () => void;
  onEditProfile: () => void;
  /** Open the create/edit dialog for a group or channel (offered where you may). */
  onManage: (target: NonNullable<ManageTarget>) => void;
  /** Signed-in users: offer "Create group". */
  canCreateGroup: boolean;
  /** App-wide admins only: open the instance admin dialog. */
  onOpenAdmin?: () => void;
  /** The discover page is showing instead of a channel. */
  discovering: boolean;
  onDiscover: () => void;
  /** Signed-in users: start a direct message. */
  onNewDm?: () => void;
  /** Open the dialog for your presence and custom status. */
  onSetStatus: () => void;
  onOpenSettings: () => void;
  /** Open the quick switcher (also Ctrl+K anywhere). */
  onQuickSwitch: () => void;
};

export default function GroupList({
  open,
  onClose,
  onSelect,
  onSignOut,
  onEditProfile,
  onManage,
  canCreateGroup,
  onOpenAdmin,
  discovering,
  onDiscover,
  onNewDm,
  onSetStatus,
  onOpenSettings,
  onQuickSwitch,
}: GroupListProps) {
  const t = useT();
  const {
    state,
    setStatus,
    // Rearranging by drag and drop: your own groups (your order), and the channels
    // of groups you manage (everyone's order). Each resolves to an error message.
    reorderGroups: onReorderGroups,
    moveChannel: onMoveChannel,
    moveCategory: onMoveCategory,
    // Join or decline a group you were invited to.
    joinGroup: onJoinGroup,
    declineInvite: onDeclineInvite,
    markAllRead,
  } = useChatContext();
  // Group ids, and "groupId/category" for category sections.
  const [collapsed, toggle] = usePersistentSet(COLLAPSED_SECTIONS);
  // Holds "custom" when you'd rather see your groups in your own (dragged) order.
  const [sortPrefs, toggleSort] = usePersistentSet("obsidian-chat:sort");
  const recent = !sortPrefs.has("custom");
  const self = state.users[state.selfId];
  const connected = state.status === "ready";
  const { groups } = state;
  // The sidebar lists your groups (in your order, as the server sends them), invites
  // and direct messages.
  const listed = groups.filter((g) => isMine(g) && !isDm(g));
  const joined = listed.filter((g) => g.role);
  /** The newest message across the group's channels. */
  const latestIn = (group: GroupType) => {
    let latest: Message | undefined;
    for (const subgroup of group.subgroups) {
      const candidate = state.latest[subgroup.id];
      if (candidate && (!latest || candidate.createdAt > latest.createdAt)) latest = candidate;
    }
    return latest;
  };
  const lastActivity = (group: GroupType) => latestIn(group)?.createdAt ?? 0;
  const dms = groups.filter((g) => isDm(g) && g.role).sort((a, b) => lastActivity(b) - lastActivity(a));
  // Sorted by activity, like a chat app: invites first, then groups and direct messages together, newest first.
  const chats = recent
    ? [
        ...listed.filter((g) => g.invited),
        ...[...joined, ...dms].sort((a, b) => lastActivity(b) - lastActivity(a)),
      ]
    : listed;
  // "Find a chat": groups and channels by name, and direct messages by who's in them.
  const [query, setQuery] = useState("");
  const filter = query.trim().toLowerCase();
  const matchesFilter = (group: GroupType) =>
    !filter ||
    (isDm(group)
      ? dmName(group, state.users, state.selfId).toLowerCase().includes(filter)
      : group.name.toLowerCase().includes(filter) || group.subgroups.some((s) => s.name.toLowerCase().includes(filter)));
  const shownChats = chats.filter(matchesFilter);
  const shownDms = dms.filter(matchesFilter);
  // You see yourself as you chose (others see "invisible" as offline).
  const selfStatus: UserStatus = !connected ? "offline" : state.presence === "invisible" ? "offline" : (self?.status ?? "online");

  const [drag, setDrag] = useState<DragItem | null>(null);
  const [over, setOver] = useState<{ key: string; position: DropPosition } | null>(null);
  const [moveError, setMoveError] = useState<string>();
  const dnd = useMemo(
    () => ({
      drag,
      setDrag,
      over,
      setOver,
      canArrange: (groupId: string) => {
        const group = groups.find((g) => g.id === groupId);
        return Boolean(group && canManageGroup(group, self));
      },
    }),
    [drag, over, groups, self],
  );

  async function run(action: Promise<string | undefined> | undefined) {
    setMoveError(undefined);
    setMoveError(await action);
  }

  /** One of your groups dropped before or after another (`targetId`). */
  function dropGroup(dragId: string, targetId: string, position: DropPosition) {
    const others = joined.filter((g) => g.id !== dragId);
    const at = others.findIndex((g) => g.id === targetId);
    const before = position === "after" ? (others[at + 1]?.id ?? null) : targetId;
    const order = moveGroup(joined, dragId, before);
    if (order.join() !== joined.map((g) => g.id).join()) void run(onReorderGroups(order));
  }

  /** A channel dropped into `groupId`'s `category` section, before `beforeId` (null: its end). */
  function dropChannel(dragId: string, groupId: string, category: string | undefined, beforeId: string | null) {
    const move = moveChannel(groups, dragId, groupId, category, beforeId);
    const current = groups.find((g) => g.id === groupId);
    const channel = current?.subgroups.find((s) => s.id === dragId);
    const unchanged =
      channel && channel.category === category &&
      move?.order.join() === current?.subgroups.map((s) => s.id).join();
    if (move && !unchanged) void run(onMoveChannel(move));
  }

  /** A direct message's row: shaped like a group's, so they read as one list. */
  function renderDm(dm: GroupType) {
    const channelId = dm.subgroups[0]?.id;
    if (!channelId) return null;
    const others = (dm.members ?? []).filter((id) => id !== state.selfId);
    const other = others.length === 1 ? state.users[others[0]] : undefined;
    const name = dmName(dm, state.users, state.selfId);
    const active = !discovering && state.activeId === channelId;
    const muted = notificationLevel(state.notifications, dm, channelId) === "none";
    const mentions = active ? 0 : (state.mentions[channelId] ?? 0);
    const unread = active || muted ? 0 : (state.unread[channelId] ?? 0);
    const latest = state.latest[channelId];
    return (
      <button
        key={dm.id}
        type="button"
        onClick={() => onSelect(channelId)}
        aria-current={active ? "page" : undefined}
        data-channel={channelId}
        className={cn(
          "mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
          active ? "bg-accent/15" : "hover:bg-surface-2",
        )}
      >
        <Avatar name={name} color={other?.color ?? dm.color} src={other?.avatarUrl} status={other?.status} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", mentions + unread > 0 ? "font-semibold" : "font-medium")}>
              {name}
              {others.length > 1 && <span className="ml-1 text-xs font-normal text-muted">{others.length + 1}</span>}
            </span>
            {latest && (
              <time dateTime={new Date(latest.createdAt).toISOString()} className="shrink-0 text-[11px] text-muted">
                {formatPreviewTime(latest.createdAt)}
              </time>
            )}
          </span>
          {other && (other.statusEmoji || other.statusText) && !latest ? (
            <CustomStatus user={other} className="text-xs text-muted" />
          ) : (
            <Preview message={latest} author={latest && state.users[latest.authorId]} selfId={state.selfId} />
          )}
        </span>
        {(mentions > 0 || unread > 0) && <UnreadBadge count={Math.max(mentions, unread)} mention />}
      </button>
    );
  }

  return (
    <SidebarDnd.Provider value={dnd}>
      {open && (
        <div aria-hidden className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside
        aria-label={t("sidebar.groups")}
        className={cn(
          // A frosted drawer over the chat on small screens.
          "fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border bg-surface transition-[translate,visibility] duration-200 md:static md:translate-x-0",
          !open && "max-md:invisible max-md:-translate-x-full",
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-2 pl-4">
          <Gem aria-hidden className="size-5 shrink-0 text-accent-bright" />
          <span className="min-w-0 truncate font-semibold tracking-tight">{state.settings.name}</span>
          {/* A dot while connected; words only when it isn't. */}
          <span role="status" className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", connected ? "bg-online" : "animate-pulse bg-warning")}
            />
            <span className={cn(connected && "sr-only")}>{connected ? t("sidebar.connected") : t("sidebar.reconnecting")}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center">
            {(canCreateGroup || onNewDm) && (
              <Menu
                label={t("sidebar.start")}
                align="end"
                className="w-56"
                items={[
                  ...(onNewDm ? [{ label: t("sidebar.newMessage"), icon: <SquarePen className="size-4" />, onSelect: onNewDm }] : []),
                  ...(canCreateGroup
                    ? [{ label: t("sidebar.createGroup"), icon: <Users className="size-4" />, onSelect: () => onManage({ kind: "group" }) }]
                    : []),
                ]}
                trigger={(props) => (
                  <button
                    type="button"
                    {...props}
                    aria-label={t("sidebar.start")}
                    title={t("sidebar.startTitle")}
                    className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2 aria-expanded:text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("sidebar.close")}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
            >
              <X className="size-4" />
            </button>
          </span>
        </header>

        <div className="shrink-0 space-y-2 p-2 pb-1">
          <button
            type="button"
            onClick={onDiscover}
            aria-current={discovering ? "page" : undefined}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm font-medium transition-colors",
              discovering ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-accent/15 text-accent-bright">
              <Compass aria-hidden className="size-3.5" />
            </span>
            Discover
          </button>
          <div className="relative">
            <label htmlFor="sidebar-find" className="sr-only">
              {t("sidebar.find")}
            </label>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="sidebar-find"
              size="sm"
              type="search"
              value={query}
              placeholder={t("sidebar.find")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              className="pl-8 md:pr-16"
            />
            {/* Keyboard users jump anywhere with the quick switcher; this says how (and opens it). */}
            {!query && (
              <button
                type="button"
                onClick={onQuickSwitch}
                title={t("sidebar.jump")}
                className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center gap-0.5 rounded-md px-1 py-0.5 text-muted hover:bg-surface hover:text-foreground md:flex"
              >
                <span className="sr-only">{t("sidebar.jump")}</span>
                <kbd aria-hidden className="rounded border border-border bg-surface px-1 font-sans text-[10px] font-medium">
                  {modifierKey()}
                </kbd>
                <kbd aria-hidden className="rounded border border-border bg-surface px-1 font-sans text-[10px] font-medium">
                  K
                </kbd>
              </button>
            )}
          </div>
        </div>

        <nav aria-label={t("sidebar.chats")} className="flex-1 overflow-y-auto p-2 pt-1">
          <div className="flex h-8 items-center gap-1 px-2">
            <h2 className="flex-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t("sidebar.chats")}</h2>
            <Menu
              label={t("sidebar.listOptions")}
              className="w-56"
              items={[
                { kind: "label", label: t("sidebar.sortBy") },
                { label: t("sidebar.sortRecent"), checked: recent, onSelect: () => !recent && toggleSort("custom") },
                { label: t("sidebar.sortCustom"), checked: !recent, onSelect: () => recent && toggleSort("custom") },
                { kind: "separator" },
                {
                  label: t("sidebar.markAllRead"),
                  icon: <CheckCheck className="size-4" />,
                  disabled: !connected,
                  onSelect: () => void run(markAllRead()),
                },
              ]}
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  aria-label={t("sidebar.listOptions")}
                  title={t("sidebar.listOptionsTitle")}
                  className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2"
                >
                  <ArrowDownUp className="size-4" />
                </button>
              )}
            />
          </div>
          {chats.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted">
              You&apos;re not in any groups yet. Find some in Discover{canCreateGroup && ", or create your own"}.
            </p>
          )}
          {chats.length > 0 && filter && shownChats.length === 0 && (!recent ? shownDms.length === 0 : true) && (
            <p className="px-2 py-3 text-xs text-muted">No chats match “{query.trim()}”.</p>
          )}
          {shownChats.map((group) => {
            if (isDm(group)) return renderDm(group);
            const latest = latestIn(group);
            return (
              <Group
                key={group.id}
                group={group}
                expanded={!collapsed.has(group.id)}
                collapsedCategories={collapsed}
                activeId={discovering ? null : state.activeId}
                latest={latest}
                latestAuthor={latest && state.users[latest.authorId]}
                filter={filter}
                reorderable={!recent}
                selfId={state.selfId}
                unread={state.unread}
                mentions={state.mentions}
                notifications={state.notifications}
                onToggle={() => toggle(group.id)}
                onToggleCategory={(category) => toggle(`${group.id}/${category}`)}
                onSelect={onSelect}
                onOpen={() => {
                  const main = mainChannel(group);
                  if (main) onSelect(main.id);
                }}
                onManage={canManageGroup(group, self) ? onManage : undefined}
                onJoin={() => void run(onJoinGroup(group.id))}
                onDecline={() => void run(onDeclineInvite(group.id))}
                onDropGroup={(dragId, position) => dropGroup(dragId, group.id, position)}
                onDropChannel={(dragId, category, beforeId) => dropChannel(dragId, group.id, category, beforeId)}
                onMoveCategory={(name, before) => void run(onMoveCategory(group.id, name, before))}
              />
            );
          })}
          {moveError && (
            <p role="alert" className="mx-2 mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {moveError}
            </p>
          )}

          {/* In your own order, direct messages keep a section of their own, newest first. */}
          {!recent && shownDms.length > 0 && (
            <section aria-labelledby="sidebar-dms" className="mt-4">
              <h2 id="sidebar-dms" className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                Direct messages
              </h2>
              {shownDms.map(renderDm)}
            </section>
          )}
        </nav>

        {self && (
          <footer className="flex shrink-0 items-center gap-1 border-t border-border p-2">
            <Menu
              label={t("sidebar.account")}
              side="top"
              className="w-64"
              header={
                <span className="flex items-center gap-2.5">
                  <Avatar name={self.name} color={self.color} src={self.avatarUrl} size="md" status={selfStatus} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{self.name}</span>
                    {(self.statusEmoji || self.statusText) && <CustomStatus user={self} className="text-xs text-muted" />}
                  </span>
                </span>
              }
              items={[
                { kind: "label", label: t("sidebar.presence") },
                ...PRESENCES.map((presence) => ({
                  label: PRESENCE_LABELS[presence].label,
                  checked: state.presence === presence,
                  disabled: !connected,
                  onSelect: () => void setStatus({ presence }),
                })),
                { label: t("sidebar.customStatus"), icon: <Smile className="size-4" />, onSelect: onSetStatus },
                { kind: "separator" },
                { label: t("sidebar.editProfile"), icon: <Pencil className="size-4" />, onSelect: onEditProfile },
                { label: t("sidebar.settings"), icon: <Settings className="size-4" />, onSelect: onOpenSettings },
                ...(onOpenAdmin
                  ? [{ label: t("sidebar.admin"), icon: <ShieldCheck className="size-4" />, onSelect: onOpenAdmin }]
                  : []),
                { kind: "separator" },
                { label: t("sidebar.signOut"), icon: <LogOut className="size-4" />, danger: true, onSelect: onSignOut },
              ]}
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  aria-label={`${self.name}: account menu`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left hover:bg-surface-2 aria-expanded:bg-surface-2"
                >
                  <Avatar name={self.name} color={self.color} src={self.avatarUrl} size="sm" status={selfStatus} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{self.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {!connected ? (
                        t("sidebar.offline")
                      ) : self.statusEmoji || self.statusText ? (
                        <CustomStatus user={self} />
                      ) : (
                        PRESENCE_LABELS[state.presence].label
                      )}
                    </span>
                  </span>
                  <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted" />
                </button>
              )}
            />
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t("sidebar.settings")}
              title={t("sidebar.settings")}
              className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Settings className="size-4" />
            </button>
          </footer>
        )}
      </aside>
    </SidebarDnd.Provider>
  );
}
