"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Ban,
  Bot,
  CalendarDays,
  Crown,
  Flag,
  FolderInput,
  FolderMinus,
  FolderPen,
  FolderPlus,
  Hash,
  Link,
  Link2Off,
  Pencil,
  Pin,
  PinOff,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Sticker,
  Tag,
  Tags,
  Trash,
  Trash2,
  UserMinus,
  UserPlus,
  UserX,
  Volume2,
  VolumeOff,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { channelTypeLabel } from "@/components/chat/ChannelIcon";
import { authorName, formatDateTime, formatDisappear, formatEventWhen, formatRelative, summarize } from "@/lib/chat/format";
import { formatSlowMode } from "@/lib/chat/safety";
import {
  ROLE_PERMISSION_LABELS,
  type ChannelSnapshot,
  type EventAttachment,
  type GroupRole,
  type GroupSnapshot,
  type MessageSnapshot,
  type ModerationAction,
  type ModerationEntry,
  type ModerationLogPage,
  type RolePermission,
  type User,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "../MemberDialog";

type LogListProps = {
  /** Everyone known (the log's own page adds anyone missing). */
  users: Record<string, User>;
  /** Channel names by id, for where a message was. */
  channels: Record<string, string>;
  /** A page, newest first; `before` continues past an entry. `undefined` if it couldn't be loaded. */
  onLoad: (before?: string) => Promise<ModerationLogPage | undefined>;
};

const ICONS: Record<ModerationAction, LucideIcon> = {
  message_remove: Trash,
  event_update: CalendarDays,
  message_pin: Pin,
  message_unpin: PinOff,
  member_mute: VolumeOff,
  member_unmute: Volume2,
  member_kick: UserMinus,
  member_ban: Ban,
  member_unban: ShieldCheck,
  member_role: Shield,
  owner_transfer: Crown,
  member_invite: UserPlus,
  invite_revoke: UserX,
  channel_create: Hash,
  channel_update: Pencil,
  channel_delete: Trash2,
  channel_move: FolderInput,
  category_create: FolderPlus,
  category_rename: FolderPen,
  category_delete: FolderMinus,
  group_update: Settings,
  invite_link_create: Link,
  invite_link_revoke: Link2Off,
  report_dismiss: Flag,
  webhook_create: Webhook,
  webhook_delete: Webhook,
  bot_add: Bot,
  bot_remove: Bot,
  emoji_add: Smile,
  emoji_remove: Smile,
  sticker_add: Sticker,
  sticker_remove: Sticker,
  role_create: Tag,
  role_update: Tag,
  role_delete: Tag,
  member_roles: Tags,
};

const DANGER = new Set<ModerationAction>(["message_remove", "member_kick", "member_ban", "member_mute", "channel_delete"]);

/** Admins and up: who moderated what in the group, with snapshots of what changed (a group settings section). */
export function LogList({ users, channels, onLoad }: LogListProps) {
  /** `undefined` while loading, `null` if it couldn't be loaded. */
  const [entries, setEntries] = useState<ModerationEntry[] | null>();
  const [known, setKnown] = useState<Record<string, User>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  function add(page: ModerationLogPage) {
    setKnown((prev) => ({ ...prev, ...Object.fromEntries(page.users.map((u) => [u.id, u])) }));
    setHasMore(page.hasMore);
  }

  // Mounted when the dialog opens, so this loads fresh each time.
  useEffect(() => {
    let active = true;
    void onLoad().then((page) => {
      if (!active) return;
      if (page) add(page);
      setEntries(page?.entries ?? null);
    });
    return () => {
      active = false;
    };
  }, [onLoad]);

  async function loadMore() {
    const last = entries?.at(-1);
    if (!last) return;
    setLoadingMore(true);
    setError(undefined);
    const page = await onLoad(last.id);
    setLoadingMore(false);
    if (!page) return setError("Couldn't load older entries. Try again.");
    add(page);
    setEntries((list) => [...(list ?? []), ...page.entries]);
  }

  if (entries === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (entries === null) return <p className="text-sm text-muted">Couldn&apos;t load the moderation log. Try again.</p>;

  // Live records first (current names), then whoever the log page brought.
  const nameOf = (id: string | undefined) => (id ? authorName(users[id] ?? known[id], id) : "Unknown user");

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nothing has been moderated or changed in this group yet.</p>
      ) : (
        <ol className="max-h-[60vh] space-y-1 overflow-y-auto">
          {entries.map((entry) => {
            const Icon = ICONS[entry.action];
            return (
              <li key={entry.id} className="flex gap-3 rounded-lg px-2 py-2">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2",
                    DANGER.has(entry.action) ? "text-danger" : "text-muted",
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm wrap-break-word">
                    {sentence(entry, nameOf, channels)}{" "}
                    <time
                      dateTime={new Date(entry.at).toISOString()}
                      title={formatDateTime(entry.at)}
                      className="text-xs text-muted"
                    >
                      {formatRelative(entry.at)}
                    </time>
                  </p>
                  <Details entry={entry} nameOf={nameOf} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="h-8 w-full rounded-lg border border-border text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load older entries"}
        </button>
      )}
      <p className="text-xs text-muted">
        Removed messages keep a copy here so moderation can be reviewed. Only the group&apos;s owner and admins see this log.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Name({ children }: { children: ReactNode }) {
  return <span className="font-medium">{children}</span>;
}

/** "Ana muted Ben until …" */
function sentence(entry: ModerationEntry, nameOf: (id: string | undefined) => string, channels: Record<string, string>) {
  const actor = <Name>{nameOf(entry.actorId)}</Name>;
  const target = <Name>{nameOf(entry.targetId)}</Name>;
  const where = (subgroupId: string) => (channels[subgroupId] ? ` in #${channels[subgroupId]}` : "");
  switch (entry.action) {
    case "message_remove":
      return entry.message.system ? (
        <>{actor} removed a notice{where(entry.message.subgroupId)}</>
      ) : (
        <>{actor} removed a message by {target}{where(entry.message.subgroupId)}</>
      );
    case "event_update":
      return (
        <>
          {actor} {eventVerb(entry.before, entry.after)} an event by {target}
          {where(entry.subgroupId)}
        </>
      );
    case "message_pin":
      return <>{actor} pinned a message by {target}{where(entry.message.subgroupId)}</>;
    case "message_unpin":
      return <>{actor} unpinned a message by {target}{where(entry.message.subgroupId)}</>;
    case "member_mute":
      return <>{actor} muted {target} until {formatDateTime(entry.until)}</>;
    case "member_unmute":
      return <>{actor} unmuted {target}</>;
    case "member_kick":
      return <>{actor} removed {target} from the group</>;
    case "member_ban":
      return (
        <>
          {actor} banned {target} {entry.until ? `until ${formatDateTime(entry.until)}` : "permanently"}
        </>
      );
    case "member_unban":
      return <>{actor} lifted {target}&apos;s ban</>;
    case "member_role":
      return (
        <>
          {actor} changed {target}&apos;s role from {ROLE_LABELS[entry.from]} to {ROLE_LABELS[entry.to]}
        </>
      );
    case "owner_transfer":
      return <>{actor} made {target} the owner</>;
    case "member_invite":
      return <>{actor} invited {target}</>;
    case "invite_revoke":
      return <>{actor} withdrew {target}&apos;s invite</>;
    case "channel_create":
      return <>{actor} created <Name>#{entry.channel.name}</Name></>;
    case "channel_update":
      return <>{actor} edited <Name>#{entry.after.name}</Name></>;
    case "channel_delete":
      return <>{actor} deleted <Name>#{entry.channel.name}</Name></>;
    case "channel_move": {
      const channel = <Name>#{entry.channel.name}</Name>;
      if (entry.from.groupId !== entry.to.groupId) {
        // Both groups log the move: say it from this group's side.
        return entry.groupId === entry.to.groupId ? (
          <>{actor} moved {channel} here from <Name>{entry.from.groupName}</Name></>
        ) : (
          <>{actor} moved {channel} to <Name>{entry.to.groupName}</Name></>
        );
      }
      return <>{actor} moved {channel} to {entry.to.category ? <Name>{entry.to.category}</Name> : "no category"}</>;
    }
    case "category_create":
      return <>{actor} made the category <Name>{entry.name}</Name></>;
    case "category_rename":
      return <>{actor} renamed the category <Name>{entry.from}</Name> to <Name>{entry.to}</Name></>;
    case "category_delete":
      return <>{actor} deleted the category <Name>{entry.name}</Name></>;
    case "group_update":
      return <>{actor} changed the group&apos;s settings</>;
    case "invite_link_create":
      return <>{actor} made an invite link</>;
    case "invite_link_revoke":
      return <>{actor} revoked an invite link</>;
    case "report_dismiss":
      return <>{actor} dismissed a report about a message by {target}</>;
    case "webhook_create":
      return <>{actor} made the webhook <Name>{entry.name}</Name>{where(entry.subgroupId)}</>;
    case "webhook_delete":
      return <>{actor} deleted the webhook <Name>{entry.name}</Name>{where(entry.subgroupId)}</>;
    case "bot_add":
      return <>{actor} added the bot <Name>{entry.name}</Name> ({entry.url})</>;
    case "bot_remove":
      return <>{actor} removed the bot <Name>{entry.name}</Name></>;
    case "emoji_add":
    case "emoji_remove":
      return (
        <>
          {actor} {entry.action === "emoji_add" ? "added" : "removed"} the emoji{" "}
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded emoji */}
          <img src={entry.url} alt="" className="inline size-4 align-text-bottom" /> <Name>:{entry.name}:</Name>
        </>
      );
    case "sticker_add":
    case "sticker_remove":
      return (
        <>
          {actor} {entry.action === "sticker_add" ? "added" : "removed"} the sticker{" "}
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded sticker */}
          <img src={entry.url} alt="" className="inline size-6 align-text-bottom" /> <Name>{entry.name}</Name>
        </>
      );
    case "role_create":
      return <>{actor} made the role <RoleName role={entry.role} /></>;
    case "role_update":
      return <>{actor} changed the role <RoleName role={entry.after} /></>;
    case "role_delete":
      return <>{actor} deleted the role <RoleName role={entry.role} /></>;
    case "member_roles":
      return <>{actor} changed {target}&apos;s roles</>;
  }
}

/** "Field: before → after" for each field that changed. */
function Changes({ rows }: { rows: { label: string; before?: ReactNode; after?: ReactNode; same: boolean }[] }) {
  const changes = rows.filter((row) => !row.same);
  if (changes.length === 0) return null;
  const none = <span className="text-muted italic">none</span>;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs">
      {changes.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted">{row.label}</dt>
          <dd className="min-w-0 wrap-break-word">
            {row.before ?? none} → {row.after ?? none}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function channelChanges(before: ChannelSnapshot, after: ChannelSnapshot) {
  return [
    { label: "Name", before: `#${before.name}`, after: `#${after.name}`, same: before.name === after.name },
    { label: "Topic", before: before.topic, after: after.topic, same: before.topic === after.topic },
    {
      label: "Type",
      before: channelTypeLabel[before.type],
      after: channelTypeLabel[after.type],
      same: before.type === after.type,
    },
    { label: "Category", before: before.category, after: after.category, same: before.category === after.category },
    {
      label: "Slow mode",
      before: before.slowMode ? formatSlowMode(before.slowMode) : "Off",
      after: after.slowMode ? formatSlowMode(after.slowMode) : "Off",
      same: (before.slowMode ?? 0) === (after.slowMode ?? 0),
    },
    {
      label: "Disappearing messages",
      before: before.disappearAfter ? `After ${formatDisappear(before.disappearAfter)}` : "Off",
      after: after.disappearAfter ? `After ${formatDisappear(after.disappearAfter)}` : "Off",
      same: (before.disappearAfter ?? 0) === (after.disappearAfter ?? 0),
    },
    {
      label: "Tags",
      before: before.tags?.join(", "),
      after: after.tags?.join(", "),
      same: (before.tags ?? []).join("\n") === (after.tags ?? []).join("\n"),
    },
  ];
}

function Swatch({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="inline-block size-3 rounded-sm align-middle" style={{ backgroundColor: color }} />
      {color}
    </span>
  );
}

function groupChanges(before: GroupSnapshot, after: GroupSnapshot) {
  const visibility = (v: GroupSnapshot["visibility"]) => (v === "private" ? "Private" : "Public");
  return [
    { label: "Name", before: before.name, after: after.name, same: before.name === after.name },
    {
      label: "Color",
      before: <Swatch color={before.color} />,
      after: <Swatch color={after.color} />,
      same: before.color === after.color,
    },
    {
      label: "Visibility",
      before: visibility(before.visibility),
      after: visibility(after.visibility),
      same: visibility(before.visibility) === visibility(after.visibility),
    },
    {
      label: "Description",
      before: before.description,
      after: after.description,
      same: before.description === after.description,
    },
    {
      label: "Blocked words",
      before: before.blockedWords?.join(", "),
      after: after.blockedWords?.join(", "),
      same: (before.blockedWords ?? []).join("\n") === (after.blockedWords ?? []).join("\n"),
    },
  ];
}

/** A channel's type, category, topic and settings, as it was. */
function ChannelFacts({ channel, extra }: { channel: ChannelSnapshot; extra?: string }) {
  const facts = [
    channelTypeLabel[channel.type],
    channel.category && `in ${channel.category}`,
    channel.topic && `Topic: ${channel.topic}`,
    channel.disappearAfter && `Messages disappear after ${formatDisappear(channel.disappearAfter)}`,
    channel.tags?.length && `Tags: ${channel.tags.join(", ")}`,
    extra,
  ].filter(Boolean);
  return <p className="mt-0.5 text-xs wrap-break-word text-muted">{facts.join(" · ")}</p>;
}

function eventVerb(before: EventAttachment, after: EventAttachment) {
  if (!before.cancelled && after.cancelled) return "cancelled";
  if (before.cancelled && !after.cancelled) return "restored";
  return "edited";
}

/** The snapshot: what was removed or changed. */
function Details({ entry, nameOf }: { entry: ModerationEntry; nameOf: (id: string | undefined) => string }) {
  switch (entry.action) {
    case "message_remove":
    case "message_pin":
    case "message_unpin":
      return <Quote message={entry.message} nameOf={nameOf} />;
    case "event_update":
      return (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <dt className="text-muted">Before</dt>
          <dd className="min-w-0 wrap-break-word">{describeEvent(entry.before)}</dd>
          <dt className="text-muted">After</dt>
          <dd className="min-w-0 wrap-break-word">{describeEvent(entry.after)}</dd>
        </dl>
      );
    case "member_mute":
      return entry.previousUntil ? (
        <p className="mt-0.5 text-xs text-muted">Was muted until {formatDateTime(entry.previousUntil)}</p>
      ) : null;
    case "member_unmute":
      return entry.previousUntil ? (
        <p className="mt-0.5 text-xs text-muted">Was muted until {formatDateTime(entry.previousUntil)}</p>
      ) : null;
    case "member_kick":
      return <p className="mt-0.5 text-xs text-muted">Was a {ROLE_LABELS[entry.role].toLowerCase()}</p>;
    case "member_ban":
    case "member_unban":
      return entry.reason || ("role" in entry && entry.role) || ("bannedAt" in entry && entry.bannedAt) ? (
        <p className="mt-0.5 text-xs text-muted">
          {[
            entry.reason && `Reason: ${entry.reason}`,
            "role" in entry && entry.role && `Was a ${ROLE_LABELS[entry.role].toLowerCase()}`,
            "bannedAt" in entry && entry.bannedAt && `Banned ${formatDateTime(entry.bannedAt)}`,
            entry.action === "member_unban" && (entry.until ? `would have ended ${formatDateTime(entry.until)}` : "was permanent"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null;
    case "channel_create":
      return <ChannelFacts channel={entry.channel} />;
    case "channel_update":
      return <Changes rows={channelChanges(entry.before, entry.after)} />;
    case "channel_delete":
      return (
        <ChannelFacts
          channel={entry.channel}
          extra={
            entry.messageCount === undefined
              ? undefined
              : `${entry.messageCount} ${entry.messageCount === 1 ? "message" : "messages"} deleted with it`
          }
        />
      );
    case "channel_move":
      return entry.from.groupId === entry.to.groupId ? (
        <p className="mt-0.5 text-xs text-muted">Was in {entry.from.category ?? "no category"}</p>
      ) : (
        <p className="mt-0.5 text-xs text-muted">
          {entry.from.groupName}
          {entry.from.category && ` (${entry.from.category})`} → {entry.to.groupName}
          {entry.to.category && ` (${entry.to.category})`}
        </p>
      );
    case "category_delete":
      return entry.channelCount > 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          Its {entry.channelCount} {entry.channelCount === 1 ? "channel" : "channels"} moved to no category
        </p>
      ) : null;
    case "group_update":
      return <Changes rows={groupChanges(entry.before, entry.after)} />;
    case "invite_link_create":
      return (
        <p className="mt-0.5 text-xs text-muted">
          {entry.expiresAt ? `Expires ${formatDateTime(entry.expiresAt)}` : "Never expires"} ·{" "}
          {entry.maxUses ? `${entry.maxUses} ${entry.maxUses === 1 ? "use" : "uses"}` : "Unlimited uses"}
        </p>
      );
    case "invite_link_revoke":
      return (
        <p className="mt-0.5 text-xs text-muted">
          {entry.uses} {entry.uses === 1 ? "person" : "people"} joined with it
        </p>
      );
    case "report_dismiss":
      return (
        <>
          {entry.reason && <p className="mt-0.5 text-xs text-muted">Reported for: {entry.reason}</p>}
          <Quote message={entry.message} nameOf={nameOf} />
        </>
      );
    case "role_create":
    case "role_delete":
      return <p className="mt-0.5 text-xs text-muted">{permissionList(entry.role.permissions)}</p>;
    case "role_update":
      return (
        <Changes
          rows={[
            { label: "Name", before: entry.before.name, after: entry.after.name, same: entry.before.name === entry.after.name },
            { label: "Color", before: <Swatch color={entry.before.color} />, after: <Swatch color={entry.after.color} />, same: entry.before.color === entry.after.color },
            {
              label: "Can",
              before: permissionList(entry.before.permissions),
              after: permissionList(entry.after.permissions),
              same: String([...entry.before.permissions].sort()) === String([...entry.after.permissions].sort()),
            },
          ]}
        />
      );
    case "member_roles":
      return (
        <p className="mt-0.5 text-xs text-muted">
          {[entry.added.length > 0 && `Gave `, entry.removed.length > 0 && `Took `]
            .filter(Boolean)
            .join(" · ")}
        </p>
      );
    default:
      return null;
  }
}

/** The message as it was, quoted. */
function Quote({ message, nameOf }: { message: MessageSnapshot; nameOf: (id: string | undefined) => string }) {
  const text = summarize(message);
  // Mentions and replies decorate the text; the rest is content the summary may not show.
  const extras = (message.attachments ?? []).filter((a) => a.type !== "mention" && a.type !== "reply").length;
  return (
    <blockquote className="mt-1 rounded-lg border-l-2 border-border bg-surface-2 px-3 py-2 text-xs">
      <p className="mb-0.5 text-muted">
        {message.system ? "Notice" : nameOf(message.authorId)} · {formatDateTime(message.createdAt)}
        {message.threadId && " · in a thread"}
      </p>
      <p className="whitespace-pre-line wrap-break-word">{text || <span className="text-muted italic">No text</span>}</p>
      {message.text && extras > 0 && (
        <p className="mt-0.5 text-muted">
          + {extras} {extras === 1 ? "attachment" : "attachments"}
        </p>
      )}
    </blockquote>
  );
}

function describeEvent(event: EventAttachment) {
  return [
    event.title,
    formatEventWhen(event.startTime, event.endTime, event.allDay),
    event.location,
    event.visibility === "public" ? "on Discover" : undefined,
    event.cancelled ? "cancelled" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A custom role's name in its color. */
function RoleName({ role }: { role: GroupRole }) {
  return (
    <span className="font-medium" style={{ color: role.color }}>
      {role.name}
    </span>
  );
}

/** "Pin messages, Invite people", or that it grants nothing extra. */
function permissionList(permissions: RolePermission[]) {
  return permissions.length ? permissions.map((p) => ROLE_PERMISSION_LABELS[p].label).join(", ") : "No extra permissions";
}
