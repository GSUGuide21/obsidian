import { ChevronDown, ChevronRight, Lock, Plus, Settings, X } from "lucide-react";
import type { ManageTarget } from "@/components/chat/Manage";
import { formatPreviewTime } from "@/lib/chat/format";
import { sections } from "@/lib/chat/order";
import {
  notificationLevel,
  type Group as GroupType,
  type Message,
  type NotificationLevel,
  type Subgroup as SubgroupType,
  type User,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { DropIndicator, useCanArrange, useDraggable, useDropTarget, type DropPosition } from "../dnd";
import Avatar from "./Avatar";
import Preview from "./Preview";
import Subgroup from "./Subgroup";
import UnreadBadge from "./UnreadBadge";

type GroupProps = {
  group: GroupType;
  expanded: boolean;
  /** Collapsed sections, as "groupId/category". */
  collapsedCategories: ReadonlySet<string>;
  activeId: string | null;
  latest?: Message;
  latestAuthor?: User;
  /** "Find a chat" text (lowercased): only matching channels show, unless the group's name matches. */
  filter?: string;
  /** It can be dragged into your own order (off while the list is sorted by activity). */
  reorderable: boolean;
  selfId: string;
  unread: Record<string, number>;
  /** Unread messages addressed to you, per channel. */
  mentions: Record<string, number>;
  /** Your notification settings (channels set to "none" don't count as unread). */
  notifications: Record<string, NotificationLevel>;
  /** Show or hide its channels. */
  onToggle: () => void;
  onToggleCategory: (category: string) => void;
  onSelect: (subgroupId: string) => void;
  /** Open the group's main channel. */
  onOpen: () => void;
  /** Those who manage the group: settings buttons and "Add channel". */
  onManage?: (target: NonNullable<ManageTarget>) => void;
  /** Join or decline a group you were invited to. */
  onJoin: () => void;
  onDecline: () => void;
  /** A dragged group dropped before or after this one. */
  onDropGroup: (dragId: string, position: DropPosition) => void;
  /** A dragged channel dropped into this group's `category` section, before `beforeId` (null: its end). */
  onDropChannel: (dragId: string, category: string | undefined, beforeId: string | null) => void;
};

export default function Group({
  group,
  expanded,
  collapsedCategories,
  activeId,
  latest,
  latestAuthor,
  filter = "",
  reorderable,
  selfId,
  unread,
  mentions,
  notifications,
  onToggle,
  onToggleCategory,
  onSelect,
  onOpen,
  onManage,
  onJoin,
  onDecline,
  onDropGroup,
  onDropChannel,
}: GroupProps) {
  const draggable = useDraggable({ kind: "group", id: group.id });
  const dragGroup = reorderable ? draggable : {};
  const arrangeable = useCanArrange(group.id);
  // Your groups land above or below this one; channels dropped on the header
  // join the group (uncategorized) if you manage it. Invites aren't in your order.
  const header = useDropTarget(
    `group:${group.id}`,
    (item) => (item.kind === "group" ? !group.invited : arrangeable && !group.invited),
    (item, position) => {
      if (item.kind === "group") onDropGroup(item.id, position);
      else onDropChannel(item.id, undefined, null);
    },
    (item) => item.kind === "group",
  );

  // An invite to a private group: no channels until you join.
  if (group.invited) {
    return (
      <section className="relative mb-1" {...header.props}>
        <DropIndicator position={header.position} />
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={group.name} color={group.color} />
          <div className="min-w-0 flex-1">
            <GroupName group={group} bold />
            <p className="text-xs text-muted">You&apos;re invited</p>
          </div>
          <button
            type="button"
            onClick={onDecline}
            aria-label={`Decline the invite to ${group.name}`}
            title="Decline"
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={onJoin}
            className="h-7 shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground hover:opacity-90"
          >
            Join
          </button>
        </div>
      </section>
    );
  }

  const muted = (s: SubgroupType) => notificationLevel(notifications, group, s.id) === "none";
  const unreadIn = (list: SubgroupType[]) =>
    list.reduce((sum, s) => sum + (s.id === activeId || muted(s) ? 0 : (unread[s.id] ?? 0)), 0);
  const mentionsIn = (list: SubgroupType[]) =>
    list.reduce((sum, s) => sum + (s.id === activeId ? 0 : (mentions[s.id] ?? 0)), 0);
  const totalUnread = unreadIn(group.subgroups);
  const totalMentions = mentionsIn(group.subgroups);
  const listId = `group-${group.id}-channels`;
  const { loose, categories } = sections(group.subgroups);
  const open = group.subgroups.some((s) => s.id === activeId);
  // Filtering shows the group's matching channels (all of them when its name matches), opened.
  const nameMatches = !filter || group.name.toLowerCase().includes(filter);
  const matching = (list: SubgroupType[]) => (nameMatches ? list : list.filter((s) => s.name.toLowerCase().includes(filter)));
  const showChannels = expanded || Boolean(filter);

  const renderChannels = (list: SubgroupType[]) =>
    list.map((subgroup, index) => (
      <ChannelRow
        key={subgroup.id}
        subgroup={subgroup}
        arrangeable={arrangeable}
        nextId={list[index + 1]?.id ?? null}
        active={subgroup.id === activeId}
        unread={unread[subgroup.id] ?? 0}
        mentions={mentions[subgroup.id] ?? 0}
        muted={muted(subgroup)}
        onSelect={() => onSelect(subgroup.id)}
        onSettings={onManage && (() => onManage({ kind: "channel", groupId: group.id, channel: subgroup }))}
        onDropChannel={onDropChannel}
      />
    ));

  return (
    <section className="group/row relative mb-1" {...header.props}>
      <DropIndicator position={header.position} />
      {onManage && (
        // Siblings of the header button (buttons can't nest), over its right end. Hover-only
        // with a mouse; always shown on touch screens.
        <div className="absolute top-1.5 right-1.5 z-10 flex gap-0.5 rounded-md bg-surface-2 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:bg-transparent pointer-coarse:opacity-100">
          <button
            type="button"
            onClick={() => onManage({ kind: "channel", groupId: group.id })}
            aria-label={`Add a channel to ${group.name}`}
            title="Add channel"
            className="rounded-md p-1.5 text-muted hover:text-foreground"
          >
            <Plus className="size-3.5 pointer-coarse:size-4" />
          </button>
          <button
            type="button"
            onClick={() => onManage({ kind: "settings", groupId: group.id, section: "overview" })}
            aria-label={`${group.name} settings`}
            title="Group settings"
            className="rounded-md p-1.5 text-muted hover:text-foreground"
          >
            <Settings className="size-3.5 pointer-coarse:size-4" />
          </button>
        </div>
      )}
      <button
        type="button"
        // Like a chat list: picking a group opens it (and shows its channels);
        // picking the open group again shows or hides its channels.
        onClick={() => {
          if (open) return onToggle();
          onOpen();
          if (!expanded) onToggle();
        }}
        aria-expanded={showChannels}
        aria-controls={listId}
        {...dragGroup}
        className={cn(
          "group/header flex w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-surface-2",
          // Collapsed it shows what was said last; open, its channels do.
          showChannels ? "py-1.5" : "py-2",
          open && !showChannels && "bg-surface-2",
          // Room for the always-visible buttons on touch screens.
          onManage && "pointer-coarse:pr-20",
        )}
      >
        <Avatar name={group.name} color={group.color} size={showChannels ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <GroupName group={group} bold={totalUnread + totalMentions > 0} />
            {latest && !showChannels && (
              <time
                dateTime={new Date(latest.createdAt).toISOString()}
                className="shrink-0 text-[11px] text-muted"
              >
                {formatPreviewTime(latest.createdAt)}
              </time>
            )}
          </div>
          {!showChannels && <Preview message={latest} author={latestAuthor} selfId={selfId} />}
        </div>
        {!showChannels && totalMentions > 0 ? (
          <UnreadBadge count={totalMentions} mention />
        ) : !showChannels && totalUnread > 0 ? (
          <UnreadBadge count={totalUnread} />
        ) : (
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted transition-transform",
              !showChannels && "-rotate-90",
            )}
          />
        )}
      </button>

      {showChannels && (
        <div id={listId} className="mt-0.5 mb-2 ml-5 border-l border-border pl-2">
          {matching(loose).length > 0 && <ul className="space-y-px">{renderChannels(matching(loose))}</ul>}
          {categories.map(([category, all]) => {
            const list = matching(all);
            if (list.length === 0) return null;
            // Filtering opens every section; otherwise a closed one still shows where you are and what's unread.
            const closed = !filter && collapsedCategories.has(`${group.id}/${category}`);
            const shown = closed
              ? list.filter((s) => s.id === activeId || (mentions[s.id] ?? 0) > 0 || (!muted(s) && (unread[s.id] ?? 0) > 0))
              : list;
            return (
              <CategorySection
                key={category}
                groupId={group.id}
                arrangeable={arrangeable}
                category={category}
                closed={closed}
                sectionId={`${listId}-${category.replace(/\W+/g, "-")}`}
                hiddenUnread={unreadIn(list) + mentionsIn(list) - unreadIn(shown) - mentionsIn(shown) > 0}
                onToggle={() => onToggleCategory(category)}
                onDropChannel={(dragId) => onDropChannel(dragId, category, null)}
              >
                {renderChannels(shown)}
              </CategorySection>
            );
          })}
          {group.subgroups.length === 0 &&
            (onManage ? (
              <button
                type="button"
                onClick={() => onManage({ kind: "channel", groupId: group.id })}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Plus aria-hidden className="size-4" />
                Add its first channel
              </button>
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted">No channels yet</p>
            ))}
        </div>
      )}
    </section>
  );
}

/** The group's name, with a lock when it's private. */
function GroupName({ group, bold }: { group: GroupType; bold: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-sm", bold ? "font-semibold" : "font-medium")}>
      <span className="truncate">{group.name}</span>
      {group.visibility === "private" && <Lock aria-label="Private" className="size-3 shrink-0 text-muted" />}
    </span>
  );
}

function CategorySection({
  groupId,
  arrangeable,
  category,
  closed,
  sectionId,
  hiddenUnread,
  onToggle,
  onDropChannel,
  children,
}: {
  groupId: string;
  /** Channels can be dropped here (you manage the group). */
  arrangeable: boolean;
  category: string;
  closed: boolean;
  sectionId: string;
  hiddenUnread: boolean;
  onToggle: () => void;
  /** A channel dropped on the header goes to the end of this section. */
  onDropChannel: (dragId: string) => void;
  children: React.ReactNode;
}) {
  const target = useDropTarget(
    `category:${groupId}/${category}`,
    (item) => arrangeable && item.kind === "channel",
    (item) => onDropChannel(item.id),
    () => false,
  );
  return (
    <div className="mt-2 first:mt-0">
      <div className="relative" {...target.props}>
        <DropIndicator position={target.position} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          aria-controls={sectionId}
          className="group/category flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[11px] font-semibold tracking-wide text-muted uppercase transition-colors hover:text-foreground"
        >
          <ChevronRight aria-hidden className={cn("size-3 shrink-0 transition-transform", !closed && "rotate-90")} />
          <span className="truncate">{category}</span>
          {hiddenUnread && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
        </button>
      </div>
      <ul id={sectionId} className="space-y-px">
        {children}
      </ul>
    </div>
  );
}

function ChannelRow({
  subgroup,
  arrangeable,
  nextId,
  active,
  unread,
  mentions,
  muted,
  onSelect,
  onSettings,
  onDropChannel,
}: {
  subgroup: SubgroupType;
  /** It can be dragged, and channels dropped by it (you manage the group). */
  arrangeable: boolean;
  /** The next channel in the same section, for drops on this row's lower half. */
  nextId: string | null;
  active: boolean;
  unread: number;
  mentions: number;
  muted: boolean;
  onSelect: () => void;
  onSettings?: () => void;
  onDropChannel: GroupProps["onDropChannel"];
}) {
  const drag = useDraggable({ kind: "channel", id: subgroup.id, groupId: subgroup.groupId });
  // Dropped channels join this row's section, above or below it.
  const target = useDropTarget(
    subgroup.id,
    (item) => arrangeable && item.kind === "channel",
    (item, position) => onDropChannel(item.id, subgroup.category, position === "after" ? nextId : subgroup.id),
  );
  return (
    <li className="relative" {...target.props}>
      <DropIndicator position={target.position} />
      <Subgroup
        subgroup={subgroup}
        active={active}
        unread={unread}
        mentions={mentions}
        muted={muted}
        onSelect={onSelect}
        onSettings={onSettings}
        dragProps={drag}
      />
    </li>
  );
}
