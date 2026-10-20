"use client";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { createId } from "./id";
import type { ChannelMove } from "./order";
import type { Identity } from "./identity";
import { formatEventWhen } from "./format";
import {
  collectionsOf,
  DEFAULT_SETTINGS,
  type Attachment,
  type ChannelDraft,
  type ClientToServerEvents,
  type CollectionKind,
  type CollectionPage,
  type DiscoverPage,
  type DmResult,
  type EventAttachment,
  type EventReminder,
  type NotificationLevel,
  type Notify,
  type Presence,
  type PushSubscriptionInfo,
  type SearchPage,
  type Group,
  type GroupBan,
  type GroupDraft,
  type SaveResult,
  type HistoryPage,
  type InstanceBan,
  type Member,
  type MemberProfile,
  type MemberRole,
  type Message,
  type ModerationLogPage,
  type ObsidianSettings,
  type ServerToClientEvents,
  type Snapshot,
  type GroupRoleDraft,
  type QuizAnswer,
  type ThreadPage,
  type ThreadSummary,
  type User,
  type WikiPage,
  type WikiSaveResult,
} from "./types";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ChatMessage = Message & {
  status?: "sending" | "failed";
  /** Why sending failed, when the server said (e.g. rate limited). */
  error?: string;
  /** Still sending: its link's preview card was removed while writing it (kept for retries). */
  noPreview?: true;
};

export type ChatState = {
  status: "connecting" | "ready" | "offline" | "error";
  error: string | null;
  selfId: string;
  users: Record<string, User>;
  groups: Group[];
  /** Latest confirmed message per subgroup (drives previews). */
  latest: Record<string, Message>;
  /** Full history, only for subgroups that have been opened. */
  messages: Record<string, ChatMessage[]>;
  unread: Record<string, number>;
  /** User ids currently typing, per subgroup. */
  typing: Record<string, string[]>;
  activeId: string | null;
  /**
   * Reply targets fetched by id because they're outside the loaded history.
   * `null` means the server no longer has that message.
   */
  references: Record<string, Message | null>;
  /** Whether older history exists before the loaded messages, per subgroup. */
  hasMore: Record<string, boolean>;
  /** When this member last read each subgroup (ms), synced with the server. */
  lastRead: Record<string, number>;
  /**
   * Where the "New messages" divider sits, per subgroup: the read position
   * captured when the channel was opened, so it stays put while reading.
   */
  dividerAt: Record<string, number>;
  /** Whether the tab is visible; messages arriving while hidden count as unread. */
  visible: boolean;
  /** Replies per thread root id, only for threads that have been opened. */
  threads: Record<string, ChatMessage[]>;
  /** Older replies exist beyond the loaded ones, per thread root id. */
  threadHasMore: Record<string, boolean>;
  /** Pinned messages per subgroup; absent until fetched, and dropped when they change. */
  pins: Record<string, Message[]>;
  /** Wiki pages per subgroup, once fetched. */
  wiki: Record<string, WikiPage>;
  /** Browse panel lists, keyed "groupId/kind", once fetched; new and changed messages are applied live. */
  collections: Record<string, { messages: Message[]; hasMore: boolean }>;
  /** Members per group, once fetched (the open channel's group); kept current by member events. */
  members: Record<string, Member[]>;
  settings: ObsidianSettings;
  /** Event reminders that arrived and haven't been dismissed, oldest first. */
  reminders: EventReminder[];
  /** An admin is stopping the server. */
  stopping: "restart" | "shutdown" | null;
  /** Unread messages addressed to you (mentions, replies, your threads, DMs), per subgroup. */
  mentions: Record<string, number>;
  /** Your notification settings, by group or channel id. */
  notifications: Record<string, NotificationLevel>;
  /** The presence you picked. */
  presence: Presence;
  /** The latest notification (see "notify"), numbered so repeats are told apart; for showing it. */
  lastNotify: { notify: Notify; seq: number } | null;
  /** People you've blocked: their messages are hidden behind a "show" link. */
  blocked: string[];
  /** Open reports per group, for the groups whose reports you review. */
  reports: Record<string, number>;
  /** How far other members have read, per subgroup (loaded for the open channel): member id → ms. */
  readPositions: Record<string, Record<string, number>>;
  /** Whether you share read receipts ("Seen by"); off hides yours and theirs. */
  readReceipts: boolean;
  /** GIF search is set up on this server. */
  gifs: boolean;
  /** Bumped when one of your scheduled messages in a channel was sent or failed (lists refetch on change). */
  scheduledVersion: Record<string, number>;
  /** The messages you saved for later (ids, most recent first). */
  saved: string[];
  /**
   * The channel you marked unread while looking at it: it stays unread (and
   * isn't marked read) until you open another channel.
   */
  heldUnread: string | null;
};

type Action =
  | { type: "offline" }
  | { type: "error"; error: string }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "history"; subgroupId: string; page: HistoryPage; older: boolean }
  | { type: "select"; subgroupId: string }
  | { type: "user"; user: User }
  | { type: "userRemoved"; userId: string }
  | { type: "message"; message: ChatMessage; replaces?: string }
  | { type: "failed"; subgroupId: string; threadId?: string; id: string; error?: string }
  | { type: "thread"; rootId: string; page: ThreadPage }
  | { type: "summary"; subgroupId: string; messageId: string; thread?: ThreadSummary }
  | { type: "pinned"; subgroupId: string; messageId: string; pinned?: Message["pinned"] }
  | { type: "pins"; subgroupId: string; messages: Message[]; users: User[] }
  | { type: "wiki"; page: WikiPage }
  | { type: "groups"; groups: Group[] }
  | { type: "typing"; subgroupId: string; userId: string; typing: boolean }
  | { type: "references"; ids: string[]; messages: Message[]; users: User[] }
  | { type: "patch"; subgroupId: string; messageId: string; patch: Partial<Message>; replace?: boolean }
  | { type: "visibility"; visible: boolean }
  | { type: "read"; subgroupId: string; at: number }
  | { type: "members"; groupId: string; members: Member[] }
  | { type: "member"; groupId: string; member: Member }
  | { type: "memberRemoved"; groupId: string; userId: string }
  | { type: "collection"; groupId: string; kind: CollectionKind; page: CollectionPage }
  | { type: "settings"; settings: ObsidianSettings }
  | { type: "reminder"; reminder: EventReminder }
  | { type: "dismissReminder"; messageId: string }
  | { type: "stopping"; mode: "restart" | "shutdown" }
  | { type: "notify"; notify: Notify }
  | { type: "notificationLevel"; targetId: string; level: NotificationLevel | null }
  | { type: "presence"; presence: Presence }
  | { type: "blocked"; blocked: string[] }
  | { type: "reports"; groupId: string; open: number }
  | { type: "readPositions"; subgroupId: string; positions: Record<string, number> }
  | { type: "readUpdate"; subgroupId: string; userId: string; at: number }
  | { type: "readReceipts"; on: boolean }
  | { type: "scheduled"; subgroupId: string }
  /** Everything in `groupId` (or in all your groups, without it) was marked read at `at`. */
  | { type: "markedRead"; groupId?: string; at: number }
  /** The channel was marked unread: read up to `lastRead`, with `unread` messages after it. */
  | { type: "markedUnread"; subgroupId: string; lastRead: number; unread: number }
  | { type: "saved"; messageId: string; saved: boolean }
  | { type: "quizAnswer"; subgroupId: string; messageId: string; quiz: number; answer: QuizAnswer };

const ACK_TIMEOUT = 10_000;
/** What an action resolves to when the server never answered. */
const noAnswer = { ok: false as const, error: "The server didn't respond. Try again." };
const TYPING_REFRESH = 3_000;
const TYPING_EXPIRY = 5_000;

function init(selfId: string): ChatState {
  return {
    status: "connecting",
    error: null,
    selfId,
    users: {},
    groups: [],
    latest: {},
    messages: {},
    unread: {},
    typing: {},
    activeId: null,
    references: {},
    hasMore: {},
    lastRead: {},
    dividerAt: {},
    visible: typeof document === "undefined" || document.visibilityState === "visible",
    threads: {},
    threadHasMore: {},
    pins: {},
    wiki: {},
    collections: {},
    members: {},
    settings: DEFAULT_SETTINGS,
    reminders: [],
    stopping: null,
    mentions: {},
    notifications: {},
    presence: "online",
    lastNotify: null,
    blocked: [],
    reports: {},
    readPositions: {},
    readReceipts: true,
    gifs: false,
    scheduledVersion: {},
    saved: [],
    heldUnread: null,
  };
}

function patchList(list: ChatMessage[], id: string, change: (m: Message) => Message) {
  return list.map((m) => (m.id === id ? { ...change(m), status: m.status } : m));
}

/**
 * Apply a change to one message wherever it's held: the loaded list, open
 * threads, pins, the sidebar preview and reply-quote references (which also
 * hold thread roots).
 */
function patchMessage(state: ChatState, subgroupId: string, id: string, change: (m: Message) => Message): ChatState {
  const list = state.messages[subgroupId];
  const latest = state.latest[subgroupId];
  const reference = state.references[id];
  const pins = state.pins[subgroupId];
  // Events like reactions don't say whether the message is a thread reply,
  // so look in every loaded thread (only opened ones are held).
  const threadId = Object.keys(state.threads).find((root) => state.threads[root].some((m) => m.id === id));
  // Browse lists that hold it (e.g. a poll's votes).
  const collectionKeys = Object.keys(state.collections).filter((key) =>
    state.collections[key].messages.some((m) => m.id === id),
  );
  const collections = collectionKeys.length
    ? {
        ...state.collections,
        ...Object.fromEntries(
          collectionKeys.map((key) => [
            key,
            { ...state.collections[key], messages: state.collections[key].messages.map((m) => (m.id === id ? change(m) : m)) },
          ]),
        ),
      }
    : state.collections;
  return {
    ...state,
    collections,
    messages: list?.some((m) => m.id === id)
      ? { ...state.messages, [subgroupId]: patchList(list, id, change) }
      : state.messages,
    threads: threadId ? { ...state.threads, [threadId]: patchList(state.threads[threadId], id, change) } : state.threads,
    pins: pins?.some((m) => m.id === id) ? { ...state.pins, [subgroupId]: pins.map((m) => (m.id === id ? change(m) : m)) } : state.pins,
    latest: latest?.id === id ? { ...state.latest, [subgroupId]: change(latest) } : state.latest,
    references: reference ? { ...state.references, [id]: change(reference) } : state.references,
  };
}

/** Merge a fetched page of messages with the local list, keeping unsent ones at the end. */
function mergePage(existing: ChatMessage[], page: Message[]) {
  const incoming = new Set(page.map((m) => m.id));
  const confirmed = existing.filter((m) => !m.status && !incoming.has(m.id));
  const local = existing.filter((m) => m.status && !incoming.has(m.id));
  const merged = [...confirmed, ...page].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  return [...merged, ...local];
}

/**
 * Guards against a server running older code (e.g. `yarn dev` not restarted
 * after server.mts changed, since Next doesn't hot-reload the custom server).
 */
function isHistoryPage(page: unknown): page is HistoryPage {
  const ok =
    typeof page === "object" && page !== null && Array.isArray((page as HistoryPage).messages) &&
    Array.isArray((page as HistoryPage).users);
  if (!ok) console.warn("Unexpected history response; is the chat server up to date? Restart it.", page);
  return ok;
}

/**
 * Add members we learned about from history (e.g. guests who have left).
 * Records we already have win: they're kept current by live presence events.
 */
function mergeUsers(current: Record<string, User>, incoming: User[]) {
  const fresh = incoming.filter((user) => !current[user.id]);
  return fresh.length ? { ...current, ...Object.fromEntries(fresh.map((user) => [user.id, user])) } : current;
}

function upsert(list: ChatMessage[], message: ChatMessage, replaces?: string) {
  const next = list.filter((m) => m.id !== message.id && m.id !== replaces);
  next.push(message);
  // Keep chronological order; the new message is almost always last already.
  for (let i = next.length - 1; i > 0 && next[i - 1].createdAt > next[i].createdAt; i--) {
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
  }
  return next;
}

/** The channel to open when none is: the first one of your first group. Null when you're in none (Discover shows). */
function defaultChannel(groups: Group[]) {
  return groups.find((g) => g.role && g.subgroups.length > 0)?.subgroups[0].id ?? null;
}

function setTyper(typing: ChatState["typing"], subgroupId: string, userId: string, on: boolean) {
  const current = typing[subgroupId] ?? [];
  if (current.includes(userId) === on) return typing;
  return {
    ...typing,
    [subgroupId]: on ? [...current, userId] : current.filter((id) => id !== userId),
  };
}

/** New events, polls, quizzes and media join their group's browse lists (the ones loaded). */
function addToCollections(state: ChatState, message: Message): ChatState {
  const kinds = collectionsOf(message);
  if (kinds.length === 0) return state;
  const groupId = state.groups.find((g) => g.subgroups.some((s) => s.id === message.subgroupId))?.id;
  if (!groupId) return state;
  let collections = state.collections;
  for (const kind of kinds) {
    const key = `${groupId}/${kind}`;
    const list = collections[key];
    if (!list || list.messages.some((m) => m.id === message.id)) continue;
    collections = { ...collections, [key]: { ...list, messages: [message, ...list.messages] } };
  }
  return collections === state.collections ? state : { ...state, collections };
}

function reducer(state: ChatState, action: Action): ChatState {
  const next = apply(state, action);
  // Confirmed messages only: a local one may still fail to send.
  return action.type === "message" && !action.message.status ? addToCollections(next, action.message) : next;
}

function apply(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "offline":
      return state.status === "error" ? state : { ...state, status: "offline", typing: {} };

    case "error":
      return { ...state, status: "error", error: action.error };

    case "snapshot": {
      const { snapshot } = action;
      const ids = snapshot.groups.flatMap((group) => group.subgroups.map((s) => s.id));
      const activeId =
        state.activeId && ids.includes(state.activeId) ? state.activeId : defaultChannel(snapshot.groups);
      return {
        ...state,
        status: "ready",
        error: null,
        stopping: null,
        // Servers running older code don't send settings.
        settings: snapshot.settings ?? DEFAULT_SETTINGS,
        selfId: snapshot.self.id,
        users: {
          // Guests the server has dropped since we last saw them: keep their
          // names for old messages, as offline.
          ...Object.fromEntries(
            Object.values(state.users)
              .filter((user) => user.id.startsWith("guest-"))
              .map((user) => [user.id, { ...user, status: "offline" as const }]),
          ),
          ...Object.fromEntries(snapshot.users.map((user) => [user.id, user])),
        },
        groups: snapshot.groups,
        latest: snapshot.latest,
        activeId,
        // The server's counts are authoritative after (re)connecting, except
        // for the channel being looked at right now (unless you marked it unread).
        unread: {
          ...snapshot.unread,
          ...(activeId && state.visible && activeId !== state.heldUnread && { [activeId]: 0 }),
        },
        // Servers running older code don't send these.
        mentions: {
          ...snapshot.mentions,
          ...(activeId && state.visible && activeId !== state.heldUnread && { [activeId]: 0 }),
        },
        notifications: snapshot.notifications ?? {},
        presence: snapshot.presence ?? "online",
        blocked: snapshot.blocked ?? [],
        reports: snapshot.reports ?? {},
        readReceipts: snapshot.readReceipts ?? true,
        gifs: snapshot.gifs ?? false,
        saved: snapshot.saved ?? [],
        lastRead: snapshot.lastRead,
        // Pins may have changed while we were away; refetch on demand.
        pins: {},
        // Same rule as "select": a divider only if this channel had unread messages.
        dividerAt:
          activeId && state.dividerAt[activeId] === undefined && (snapshot.unread[activeId] ?? 0) > 0
            ? { ...state.dividerAt, [activeId]: snapshot.lastRead[activeId] }
            : state.dividerAt,
      };
    }

    case "history": {
      const { subgroupId, page, older } = action;
      const existing = state.messages[subgroupId] ?? [];
      const incoming = new Set(page.messages.map((m) => m.id));
      const confirmed = existing.filter((m) => !m.status && !incoming.has(m.id));
      // Keep local messages that are still sending or failed.
      const local = existing.filter((m) => m.status && !incoming.has(m.id));

      // A reload of the latest page (e.g. after reconnecting) can only be
      // merged with what we have if the two overlap; otherwise messages sent
      // while we were offline would leave a silent gap, so start over.
      const overlaps =
        older || !page.hasMore || page.messages.length === 0 || existing.some((m) => m.id === page.messages[0].id);
      // Copy before sorting: page.messages belongs to the action (reducers must not mutate it).
      const merged = (overlaps ? [...confirmed, ...page.messages] : [...page.messages]).sort(
        (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
      );
      const keptOlder = !older && overlaps && confirmed.some((m) => m.createdAt < (page.messages[0]?.createdAt ?? 0));
      return {
        ...state,
        users: mergeUsers(state.users, page.users),
        messages: { ...state.messages, [subgroupId]: [...merged, ...local] },
        hasMore: { ...state.hasMore, [subgroupId]: keptOlder ? (state.hasMore[subgroupId] ?? false) : page.hasMore },
      };
    }

    case "select": {
      // Only mark "New messages" if there were unread ones when it was opened;
      // otherwise messages arriving while you watch would get a divider too.
      const at = (state.unread[action.subgroupId] ?? 0) > 0 ? state.lastRead[action.subgroupId] : undefined;
      const otherDividers = { ...state.dividerAt };
      delete otherDividers[action.subgroupId];
      return {
        ...state,
        activeId: action.subgroupId,
        unread: { ...state.unread, [action.subgroupId]: 0 },
        mentions: { ...state.mentions, [action.subgroupId]: 0 },
        dividerAt: at === undefined ? otherDividers : { ...otherDividers, [action.subgroupId]: at },
        // Opening a channel (even the one you marked unread) reads it again.
        heldUnread: null,
      };
    }

    case "visibility": {
      // Coming back to a channel you marked unread leaves it unread.
      const clear = action.visible && state.activeId && state.activeId !== state.heldUnread ? state.activeId : null;
      return {
        ...state,
        visible: action.visible,
        unread: clear ? { ...state.unread, [clear]: 0 } : state.unread,
        mentions: clear ? { ...state.mentions, [clear]: 0 } : state.mentions,
      };
    }

    case "notify": {
      const { message, reason } = action.notify;
      const lastNotify = { notify: action.notify, seq: (state.lastNotify?.seq ?? 0) + 1 };
      // Channels set to "all" just count as unread; the rest are addressed to you.
      const looking = message.subgroupId === state.activeId && state.visible;
      if (reason === "message" || looking) return { ...state, lastNotify };
      return {
        ...state,
        lastNotify,
        mentions: { ...state.mentions, [message.subgroupId]: Math.min((state.mentions[message.subgroupId] ?? 0) + 1, 100) },
      };
    }

    case "notificationLevel": {
      const notifications = { ...state.notifications };
      if (action.level) notifications[action.targetId] = action.level;
      else delete notifications[action.targetId];
      return { ...state, notifications };
    }

    case "presence":
      return { ...state, presence: action.presence };

    case "blocked":
      return { ...state, blocked: action.blocked };

    case "reports": {
      const reports = { ...state.reports };
      if (action.open > 0) reports[action.groupId] = action.open;
      else delete reports[action.groupId];
      return { ...state, reports };
    }

    case "readPositions":
      return { ...state, readPositions: { ...state.readPositions, [action.subgroupId]: action.positions } };

    case "scheduled":
      return {
        ...state,
        scheduledVersion: { ...state.scheduledVersion, [action.subgroupId]: (state.scheduledVersion[action.subgroupId] ?? 0) + 1 },
      };

    case "readReceipts":
      // Off: what you'd seen of others' reads goes too (it works both ways).
      return { ...state, readReceipts: action.on, readPositions: action.on ? state.readPositions : {} };

    case "readUpdate": {
      // Only kept for channels whose positions were loaded (the open one).
      const current = state.readPositions[action.subgroupId];
      if (!current || (current[action.userId] ?? 0) >= action.at) return state;
      return {
        ...state,
        readPositions: { ...state.readPositions, [action.subgroupId]: { ...current, [action.userId]: action.at } },
      };
    }

    case "markedRead": {
      const unread = { ...state.unread };
      const mentions = { ...state.mentions };
      const lastRead = { ...state.lastRead };
      const dividerAt = { ...state.dividerAt };
      const marked = state.groups.filter((g) => (action.groupId ? g.id === action.groupId : g.role));
      for (const id of marked.flatMap((g) => g.subgroups.map((s) => s.id))) {
        delete unread[id];
        delete mentions[id];
        lastRead[id] = Math.max(lastRead[id] ?? 0, action.at);
        delete dividerAt[id];
      }
      return { ...state, unread, mentions, lastRead, dividerAt };
    }

    case "markedUnread": {
      const { subgroupId } = action;
      return {
        ...state,
        unread: { ...state.unread, [subgroupId]: action.unread },
        lastRead: { ...state.lastRead, [subgroupId]: action.lastRead },
        // The "New messages" divider moves up to the message it was marked from.
        dividerAt: { ...state.dividerAt, [subgroupId]: action.lastRead },
        heldUnread: subgroupId === state.activeId ? subgroupId : state.heldUnread,
      };
    }

    case "saved":
      return {
        ...state,
        saved: action.saved
          ? [action.messageId, ...state.saved.filter((id) => id !== action.messageId)]
          : state.saved.filter((id) => id !== action.messageId),
      };

    case "quizAnswer":
      return patchMessage(state, action.subgroupId, action.messageId, (m) => ({
        ...m,
        quizAnswers: { ...m.quizAnswers, [action.quiz]: action.answer },
      }));

    case "read":
      if ((state.lastRead[action.subgroupId] ?? 0) >= action.at) return state;
      return { ...state, lastRead: { ...state.lastRead, [action.subgroupId]: action.at } };

    case "patch": {
      const patched = patchMessage(state, action.subgroupId, action.messageId, (m) =>
        action.replace
          ? // Updates are the same for everyone, so they leave out your quiz answers: keep them.
            ({ ...(m.quizAnswers && !action.patch.deleted && { quizAnswers: m.quizAnswers }), ...action.patch } as Message)
          : { ...m, ...action.patch },
      );
      // A deleted message loses its pin.
      const pins = patched.pins[action.subgroupId];
      if (!action.replace || action.patch.pinned || !pins?.some((m) => m.id === action.messageId)) return patched;
      return {
        ...patched,
        pins: { ...patched.pins, [action.subgroupId]: pins.filter((m) => m.id !== action.messageId) },
      };
    }

    case "user":
      return { ...state, users: { ...state.users, [action.user.id]: action.user } };

    case "userRemoved": {
      // Keep the record so their earlier messages still show a name; the
      // members list hides offline guests.
      const user = state.users[action.userId];
      if (!user) return state;
      return { ...state, users: { ...state.users, [user.id]: { ...user, status: "offline" } } };
    }

    case "message": {
      const { message, replaces } = action;
      const subgroupId = message.subgroupId;

      // Thread replies only live in their thread (if it's open); they never
      // touch the channel list, previews or unread counts.
      if (message.threadId) {
        const thread = state.threads[message.threadId] ?? (message.status ? [] : undefined);
        return {
          ...state,
          threads: thread
            ? { ...state.threads, [message.threadId]: upsert(thread, message, replaces) }
            : state.threads,
        };
      }

      const confirmed = !message.status;
      const loaded = state.messages[subgroupId];
      const list = loaded ?? (message.status ? [] : undefined);
      const latest = state.latest[subgroupId];
      const known = latest?.id === message.id || (loaded?.some((m) => m.id === message.id) ?? false);
      const isNewest = confirmed && (!latest || latest.createdAt <= message.createdAt);
      const countsAsUnread =
        confirmed &&
        !known &&
        // Notices like "joined the group" aren't worth a badge (the server doesn't count them either).
        !message.system &&
        (subgroupId !== state.activeId || !state.visible || subgroupId === state.heldUnread) &&
        message.authorId !== state.selfId;

      return {
        ...state,
        messages: list
          ? { ...state.messages, [subgroupId]: upsert(list, message, replaces) }
          : state.messages,
        latest: isNewest ? { ...state.latest, [subgroupId]: message } : state.latest,
        unread: countsAsUnread
          ? { ...state.unread, [subgroupId]: (state.unread[subgroupId] ?? 0) + 1 }
          : state.unread,
        typing: setTyper(state.typing, subgroupId, message.authorId, false),
      };
    }

    case "failed": {
      const key = action.threadId ?? action.subgroupId;
      const lists = action.threadId ? state.threads : state.messages;
      const list = lists[key];
      if (!list) return state;
      const updated = {
        ...lists,
        [key]: list.map((m) => (m.id === action.id ? { ...m, status: "failed" as const, error: action.error } : m)),
      };
      return action.threadId ? { ...state, threads: updated } : { ...state, messages: updated };
    }

    case "thread": {
      const { rootId, page } = action;
      return {
        ...state,
        users: mergeUsers(state.users, page.users),
        threads: { ...state.threads, [rootId]: mergePage(state.threads[rootId] ?? [], page.replies) },
        threadHasMore: { ...state.threadHasMore, [rootId]: page.hasMore },
        // The root is kept with the reply-quote references so live patches reach it.
        references: { ...state.references, [rootId]: page.root },
      };
    }

    case "summary":
      return patchMessage(state, action.subgroupId, action.messageId, (m) => {
        const next = { ...m };
        if (action.thread) next.thread = action.thread;
        else delete next.thread;
        return next;
      });

    case "pinned": {
      const patched = patchMessage(state, action.subgroupId, action.messageId, (m) => {
        const next = { ...m };
        if (action.pinned) next.pinned = action.pinned;
        else delete next.pinned;
        return next;
      });
      // The pinned list is ordered by the server; refetch it when next shown.
      const pins = { ...patched.pins };
      delete pins[action.subgroupId];
      return { ...patched, pins };
    }

    case "pins":
      return {
        ...state,
        users: mergeUsers(state.users, action.users),
        pins: { ...state.pins, [action.subgroupId]: action.messages },
      };

    case "groups": {
      // If the open channel was deleted (or we lost access), move to the first one of ours.
      const ids = action.groups.flatMap((group) => group.subgroups.map((s) => s.id));
      const activeId = state.activeId && ids.includes(state.activeId) ? state.activeId : defaultChannel(action.groups);
      // Deleted channels' unread counts would otherwise linger in the tab title.
      const unread = Object.fromEntries(ids.map((id) => [id, id === activeId ? 0 : (state.unread[id] ?? 0)]));
      const mentions = Object.fromEntries(ids.map((id) => [id, id === activeId ? 0 : (state.mentions[id] ?? 0)]));
      // Member lists of groups we can no longer read (deleted, or we were removed) are stale.
      const readable = new Set(action.groups.filter((g) => !g.invited).map((g) => g.id));
      const members = Object.fromEntries(Object.entries(state.members).filter(([id]) => readable.has(id)));
      return { ...state, groups: action.groups, activeId, unread, mentions, members };
    }

    case "members":
      return {
        ...state,
        users: mergeUsers(state.users, action.members.map((m) => m.user)),
        members: { ...state.members, [action.groupId]: action.members },
      };

    case "member": {
      const list = state.members[action.groupId];
      if (!list) return state; // not loaded; fetched in full when opened
      const known = list.some((m) => m.user.id === action.member.user.id);
      return {
        ...state,
        users: mergeUsers(state.users, [action.member.user]),
        members: {
          ...state.members,
          [action.groupId]: known
            ? list.map((m) => (m.user.id === action.member.user.id ? action.member : m))
            : [...list, action.member],
        },
      };
    }

    case "memberRemoved": {
      const list = state.members[action.groupId];
      if (!list) return state;
      return {
        ...state,
        members: { ...state.members, [action.groupId]: list.filter((m) => m.user.id !== action.userId) },
      };
    }

    case "collection":
      return {
        ...state,
        users: mergeUsers(state.users, action.page.users),
        collections: {
          ...state.collections,
          [`${action.groupId}/${action.kind}`]: { messages: action.page.messages, hasMore: action.page.hasMore },
        },
      };

    case "settings":
      return { ...state, settings: action.settings };

    case "reminder":
      // One card per event; a later reminder for it replaces the earlier one.
      return {
        ...state,
        reminders: [...state.reminders.filter((r) => r.messageId !== action.reminder.messageId), action.reminder],
      };

    case "dismissReminder":
      return { ...state, reminders: state.reminders.filter((r) => r.messageId !== action.messageId) };

    case "stopping":
      return { ...state, stopping: action.mode };

    case "wiki": {
      const current = state.wiki[action.page.subgroupId];
      // Saves and broadcasts can arrive out of order; keep the newest.
      if (current && current.version > action.page.version) return state;
      return { ...state, wiki: { ...state.wiki, [action.page.subgroupId]: action.page } };
    }

    case "references": {
      const found = new Map(action.messages.map((m) => [m.id, m]));
      const references = { ...state.references };
      for (const id of action.ids) references[id] = found.get(id) ?? null;
      return { ...state, references, users: mergeUsers(state.users, action.users) };
    }

    case "typing":
      if (action.userId === state.selfId) return state;
      return {
        ...state,
        typing: setTyper(state.typing, action.subgroupId, action.userId, action.typing),
      };
  }
}

/** A system notification for a reminder, when the browser allows them (the in-app card shows either way). */
function notifyReminder(reminder: EventReminder) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(reminder.title, {
      body: formatEventWhen(reminder.startTime, undefined, reminder.allDay),
      tag: `reminder-${reminder.messageId}`,
    });
  } catch {
    // Some browsers (e.g. Android Chrome) only allow notifications from a service worker.
  }
}

export type ChatIdentity = Identity & {
  /** Signed-in users: returns a fresh Supabase access token for the server to verify. */
  getAccessToken?: () => Promise<string | null>;
};

const IDLE_AFTER = 10 * 60 * 1000;

export function useChat(identity: ChatIdentity) {
  const [state, dispatch] = useReducer(reducer, identity.id, init);
  const socketRef = useRef<ChatSocket | null>(null);
  const typingSentRef = useRef<{ subgroupId: string; at: number } | null>(null);
  // The server assigns the real id (guests get a "guest-" prefix).
  const selfIdRef = useRef(state.selfId);
  useEffect(() => {
    selfIdRef.current = state.selfId;
  }, [state.selfId]);

  // Joining is also how a profile change is announced, so it always reads
  // the latest identity.
  const join = useEffectEvent(async (socket: ChatSocket) => {
    // Fetched on every join so an expired token is refreshed first.
    const token = await identity.getAccessToken?.();
    if (token === null) {
      dispatch({ type: "error", error: "Your sign-in has expired. Sign in again." });
      return;
    }
    const payload = {
      userId: identity.id,
      name: identity.name,
      ...(identity.color && { color: identity.color }),
      ...(identity.avatarUrl && { avatarUrl: identity.avatarUrl }),
      ...(identity.bio && { bio: identity.bio }),
      ...(token && { accessToken: token }),
    };
    socket.timeout(ACK_TIMEOUT).emit("session:join", payload, (err, result) => {
      if (err) return; // Socket.io will reconnect and we'll try again.
      if ("error" in result) dispatch({ type: "error", error: result.error });
      else dispatch({ type: "snapshot", snapshot: result });
    });
  });

  // Guest profile edits: re-join on the open connection (no reconnect, so
  // they don't flicker out of the member list). Signed-in users call
  // rejoin() themselves once their refreshed token carries the new profile;
  // re-joining earlier would send a token with the old one.
  const profileKey = identity.getAccessToken
    ? ""
    : `${identity.name}|${identity.color ?? ""}|${identity.avatarUrl ?? ""}|${identity.bio ?? ""}`;
  const [rejoinRequests, setRejoinRequests] = useState(0);
  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected) void join(socket);
  }, [profileKey, rejoinRequests]);

  const rejoin = useCallback(() => setRejoinRequests((n) => n + 1), []);

  useEffect(() => {
    // Same origin: the socket server is attached to the Next.js server (server.mts).
    const socket: ChatSocket = io({ autoConnect: false });
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    socketRef.current = socket;

    socket.on("connect", () => void join(socket));
    socket.on("disconnect", () => dispatch({ type: "offline" }));
    socket.on("connect_error", () => dispatch({ type: "offline" }));
    socket.on("user:update", (user) => dispatch({ type: "user", user }));
    socket.on("user:remove", (userId) => dispatch({ type: "userRemoved", userId }));
    socket.on("message:new", (message) => dispatch({ type: "message", message }));
    socket.on("message:update", (message) =>
      dispatch({ type: "patch", subgroupId: message.subgroupId, messageId: message.id, patch: message, replace: true }),
    );
    socket.on("message:reactions", ({ subgroupId, messageId, reactions }) =>
      dispatch({ type: "patch", subgroupId, messageId, patch: { reactions } }),
    );
    socket.on("poll:votes", ({ subgroupId, messageId, pollVotes }) =>
      dispatch({ type: "patch", subgroupId, messageId, patch: { pollVotes } }),
    );
    socket.on("thread:summary", ({ subgroupId, messageId, thread }) =>
      dispatch({ type: "summary", subgroupId, messageId, thread }),
    );
    socket.on("message:pin", ({ subgroupId, messageId, pinned }) =>
      dispatch({ type: "pinned", subgroupId, messageId, pinned }),
    );
    socket.on("wiki:update", (page) => dispatch({ type: "wiki", page }));
    socket.on("groups:update", (groups) => dispatch({ type: "groups", groups }));
    socket.on("member:update", ({ groupId, member }) => dispatch({ type: "member", groupId, member }));
    socket.on("member:remove", ({ groupId, userId }) => dispatch({ type: "memberRemoved", groupId, userId }));
    socket.on("obsidian:update", (settings) => dispatch({ type: "settings", settings }));
    socket.on("obsidian:banstatus", ({ userId, banned }) => {
      if (banned && userId === selfIdRef.current) {
        dispatch({ type: "error", error: "You've been banned from this instance." });
      }
    });
    socket.on("obsidian:restart", () => dispatch({ type: "stopping", mode: "restart" }));
    socket.on("obsidian:shutdown", () => dispatch({ type: "stopping", mode: "shutdown" }));
    socket.on("event:reminder", (reminder) => {
      dispatch({ type: "reminder", reminder });
      notifyReminder(reminder);
    });
    socket.on("notify", (notify) => dispatch({ type: "notify", notify }));
    socket.on("blocks:update", (blocked) => dispatch({ type: "blocked", blocked }));
    socket.on("report:count", ({ groupId, open }) => dispatch({ type: "reports", groupId, open }));
    socket.on("read:update", ({ subgroupId, userId, at }) => dispatch({ type: "readUpdate", subgroupId, userId, at }));
    socket.on("schedule:update", ({ subgroupId }) => dispatch({ type: "scheduled", subgroupId }));
    socket.on("typing", ({ subgroupId, userId, typing }) => {
      const key = `${subgroupId}:${userId}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
      dispatch({ type: "typing", subgroupId, userId, typing });
      if (typing) {
        // Clear the indicator if the "stopped typing" event never arrives.
        typingTimers.set(
          key,
          setTimeout(() => {
            typingTimers.delete(key);
            dispatch({ type: "typing", subgroupId, userId, typing: false });
          }, TYPING_EXPIRY),
        );
      }
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      typingTimers.forEach(clearTimeout);
      socketRef.current = null;
    };
  }, [identity.id]);

  // Load history for the open channel, and reload it after every reconnect.
  useEffect(() => {
    const socket = socketRef.current;
    if (state.status !== "ready" || !state.activeId || !socket) return;
    const subgroupId = state.activeId;
    socket.timeout(ACK_TIMEOUT).emit("history", { subgroupId }, (err, page) => {
      if (!err && isHistoryPage(page)) dispatch({ type: "history", subgroupId, page, older: false });
    });
  }, [state.status, state.activeId]);

  // Load the open channel's group members (for roles and moderation), and
  // reload them after every reconnect.
  const activeGroupId = state.groups.find((g) => g.subgroups.some((s) => s.id === state.activeId))?.id;
  useEffect(() => {
    const socket = socketRef.current;
    if (state.status !== "ready" || !activeGroupId || !socket) return;
    const groupId = activeGroupId;
    socket.timeout(ACK_TIMEOUT).emit("member:list", { groupId }, (err, members) => {
      if (!err && Array.isArray(members)) dispatch({ type: "members", groupId, members });
    });
  }, [state.status, activeGroupId]);

  /** Fetch the page before `beforeId` (the oldest loaded message). Resolves when merged. */
  const loadOlder = useCallback((subgroupId: string, beforeId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
      socket.timeout(ACK_TIMEOUT).emit("history", { subgroupId, before: beforeId }, (err, page) => {
        if (!err && isHistoryPage(page)) dispatch({ type: "history", subgroupId, page, older: true });
        resolve();
      });
    });
  }, []);

  const deliver = useCallback((message: ChatMessage) => {
    const socket = socketRef.current;
    const { id, subgroupId, text, attachments, threadId, noPreview } = message;
    if (!socket?.connected) {
      dispatch({ type: "failed", subgroupId, threadId, id });
      return;
    }
    const payload = { id, subgroupId, text, attachments, ...(threadId && { threadId }), ...(noPreview && { preview: false }) };
    socket.timeout(ACK_TIMEOUT).emit("message:send", payload, (err, result) => {
      if (err) dispatch({ type: "failed", subgroupId, threadId, id });
      else if (!result.ok) dispatch({ type: "failed", subgroupId, threadId, id, error: result.error });
      else dispatch({ type: "message", message: result.message, replaces: id });
    });
  }, []);

  /** `threadId` posts a reply in that message's thread. */
  const send = useCallback(
    (
      subgroupId: string,
      text: string,
      attachments: Attachment[] = [],
      threadId?: string,
      /** `preview: false`: no card for its link (removed while writing it). */
      options: { preview?: boolean } = {},
    ) => {
      const message: ChatMessage = {
        id: createId(),
        subgroupId,
        authorId: selfIdRef.current,
        text,
        createdAt: Date.now(),
        status: "sending",
        ...(attachments.length > 0 && { attachments }),
        ...(threadId && { threadId }),
        ...(options.preview === false && { noPreview: true as const }),
      };
      dispatch({ type: "message", message });
      deliver(message);
    },
    [deliver],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      const pending: ChatMessage = { ...message, status: "sending" };
      dispatch({ type: "message", message: pending });
      deliver(pending);
    },
    [deliver],
  );

  // Ids already requested, so re-renders don't refetch the same messages.
  const requestedRef = useRef(new Set<string>());
  const lookup = useCallback((subgroupId: string, ids: string[]) => {
    const socket = socketRef.current;
    const fresh = ids.filter((id) => !requestedRef.current.has(id)).slice(0, 50);
    if (!socket?.connected || fresh.length === 0) return;
    fresh.forEach((id) => requestedRef.current.add(id));
    socket.timeout(ACK_TIMEOUT).emit("messages:lookup", { subgroupId, ids: fresh }, (err, result) => {
      // On failure, allow a later retry instead of caching "missing".
      if (err || !Array.isArray(result?.messages)) fresh.forEach((id) => requestedRef.current.delete(id));
      else dispatch({ type: "references", ids: fresh, messages: result.messages, users: result.users ?? [] });
    });
  }, []);

  const select = useCallback((subgroupId: string) => {
    dispatch({ type: "select", subgroupId });
  }, []);

  // Throttled: re-announce while typing so the other side's timer doesn't expire.
  const setTyping = useCallback((subgroupId: string, typing: boolean) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const last = typingSentRef.current;
    if (typing) {
      if (last?.subgroupId === subgroupId && Date.now() - last.at < TYPING_REFRESH) return;
      if (last && last.subgroupId !== subgroupId) {
        socket.emit("typing", { subgroupId: last.subgroupId, typing: false });
      }
      typingSentRef.current = { subgroupId, at: Date.now() };
      socket.emit("typing", { subgroupId, typing: true });
    } else if (last) {
      typingSentRef.current = null;
      socket.emit("typing", { subgroupId: last.subgroupId, typing: false });
    }
  }, []);

  /** Load (or reload, e.g. after reconnecting) a thread's root and replies. */
  const loadThread = useCallback((rootId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(ACK_TIMEOUT).emit("thread:history", { rootId }, (err, page) => {
      if (!err && page && Array.isArray(page.replies)) dispatch({ type: "thread", rootId, page });
    });
  }, []);

  const loadPins = useCallback((subgroupId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(ACK_TIMEOUT).emit("pins", { subgroupId }, (err, result) => {
      if (!err && Array.isArray(result?.messages)) {
        dispatch({ type: "pins", subgroupId, messages: result.messages, users: result.users ?? [] });
      }
    });
  }, []);

  /** Load (or reload) one of a group's browse lists. */
  const loadCollection = useCallback((groupId: string, kind: CollectionKind) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(ACK_TIMEOUT).emit("group:collection", { groupId, kind }, (err, page) => {
      if (!err && Array.isArray(page?.messages)) dispatch({ type: "collection", groupId, kind, page });
    });
  }, []);

  /**
   * Watch the discover page (public groups' stats and upcoming events): `onPage`
   * gets it now, `undefined` if it couldn't be loaded, and again whenever it
   * changes. Returns a function that stops watching. Call again after reconnecting.
   */
  const watchDiscover = useCallback((onPage: (page: DiscoverPage | undefined) => void) => {
    const socket = socketRef.current;
    if (!socket?.connected) return () => {};
    socket.on("discover:update", onPage);
    socket.timeout(ACK_TIMEOUT).emit("discover", {}, (err, page) => {
      onPage(!err && Array.isArray(page?.groups) && Array.isArray(page.events) ? page : undefined);
    });
    return () => {
      socket.off("discover:update", onPage);
      if (socket.connected) socket.emit("discover:leave");
    };
  }, []);

  /** Tell the server which channel is on screen (`null` for none). Send again after reconnecting. */
  const setViewing = useCallback((subgroupId: string | null) => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit("view", { subgroupId });
  }, []);

  const loadWiki = useCallback((subgroupId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(ACK_TIMEOUT).emit("wiki:get", { subgroupId }, (err, page) => {
      if (!err && page) dispatch({ type: "wiki", page });
    });
  }, []);

  const saveWiki = useCallback(
    (subgroupId: string, body: string, baseVersion: number) =>
      new Promise<WikiSaveResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: "You're offline. Try again once reconnected." });
        socket.timeout(ACK_TIMEOUT).emit("wiki:save", { subgroupId, body, baseVersion }, (err, result) => {
          if (err) return resolve({ ok: false, error: "The server didn't respond. Try again." });
          if (result.page) dispatch({ type: "wiki", page: result.page });
          resolve(result);
        });
      }),
    [],
  );

  /** Admins: create (no `id`) or edit groups and channels. Everyone gets the new list via "groups:update". */
  const emitSave = useCallback(
    <E extends "group:save" | "channel:save">(event: E, payload: Parameters<ClientToServerEvents[E]>[0]) =>
      new Promise<SaveResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: "You're offline. Try again once reconnected." });
        // The generic event name defeats socket.io's typed overloads.
        (socket.timeout(ACK_TIMEOUT) as unknown as {
          emit: (e: string, p: unknown, ack: (err: Error | null, result: SaveResult) => void) => void;
        }).emit(event, payload, (err, result) => {
          resolve(err ? { ok: false, error: "The server didn't respond. Try again." } : result);
        });
      }),
    [],
  );
  const saveGroup = useCallback(
    (draft: GroupDraft, id?: string) => emitSave("group:save", { ...draft, ...(id && { id }) }),
    [emitSave],
  );
  const saveChannel = useCallback(
    (draft: ChannelDraft, id?: string) => emitSave("channel:save", { ...draft, ...(id && { id }) }),
    [emitSave],
  );

  // Edits, deletes, reactions, votes and pins: the server broadcasts the
  // result to everyone (including us), so these only report failures.
  const request = useCallback(
    <
      E extends
        | "message:edit"
        | "event:update"
        | "push:subscribe"
        | "push:unsubscribe"
        | "invite:revoke"
        | "report:create"
        | "report:resolve"
        | "block:set"
        | "event:rsvp"
        | "privacy:set"
        | "schedule:cancel"
        | "webhook:delete"
        | "bot:remove"
        | "emoji:add"
        | "emoji:remove"
        | "account:delete"
        | "message:delete"
        | "reaction:toggle"
        | "poll:vote"
        | "saved:set"
        | "role:save"
        | "role:delete"
        | "roles:reorder"
        | "member:roles"
        | "message:pin"
        | "group:delete"
        | "channel:delete"
        | "groups:reorder"
        | "channel:move"
        | "member:join"
        | "member:leave"
        | "member:invite"
        | "member:uninvite"
        | "member:update"
        | "member:mute"
        | "member:kick"
        | "member:ban"
        | "member:transfer"
        | "member:unban"
        | "member:profile"
        | "status:set"
        | "notifications:set"
        | "obsidian:update"
        | "obsidian:ban"
        | "obsidian:unban"
        | "obsidian:shutdown"
        | "obsidian:restart",
    >(
      event: E,
      payload: Parameters<ClientToServerEvents[E]>[0],
    ) =>
      new Promise<string | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve("You're offline. Try again once reconnected.");
        // The generic event name defeats socket.io's typed overloads.
        (socket.timeout(ACK_TIMEOUT) as unknown as {
          emit: (e: string, p: unknown, ack: (err: Error | null, result: { ok: boolean; error?: string }) => void) => void;
        }).emit(event, payload, (err, result) => {
          if (err) resolve("The server didn't respond. Try again.");
          else resolve(result.ok ? undefined : (result.error ?? "Something went wrong."));
        });
      }),
    [],
  );

  const editMessage = useCallback(
    (id: string, text: string) => request("message:edit", { id, text }),
    [request],
  );
  /** Replace the event at `index` in the message (edit, cancel or restore it). */
  const editEvent = useCallback(
    (messageId: string, index: number, event: EventAttachment) => request("event:update", { messageId, index, event }),
    [request],
  );
  const deleteMessage = useCallback((id: string) => request("message:delete", { id }), [request]);
  const react = useCallback(
    (messageId: string, emoji: string) => request("reaction:toggle", { messageId, emoji }),
    [request],
  );
  const vote = useCallback(
    (messageId: string, poll: number, option: number | null) => request("poll:vote", { messageId, poll, option }),
    [request],
  );
  const pin = useCallback((id: string, pinned: boolean) => request("message:pin", { id, pinned }), [request]);
  const deleteGroup = useCallback((id: string) => request("group:delete", { id }), [request]);
  const deleteChannel = useCallback((id: string) => request("channel:delete", { id }), [request]);
  const reorderGroups = useCallback((order: string[]) => request("groups:reorder", { order }), [request]);
  const moveChannel = useCallback((move: ChannelMove) => request("channel:move", move), [request]);

  // Group membership and moderation. The server broadcasts member and group
  // list changes to everyone affected, so these only report failures too.
  const joinGroup = useCallback((groupId: string) => request("member:join", { groupId }), [request]);
  const leaveGroup = useCallback((groupId: string) => request("member:leave", { groupId }), [request]);
  const inviteMember = useCallback(
    (groupId: string, userId: string) => request("member:invite", { groupId, userId }),
    [request],
  );
  /** Revoke someone's pending invite (moderators and up), or decline your own. */
  const uninvite = useCallback(
    (groupId: string, userId: string) => request("member:uninvite", { groupId, userId }),
    [request],
  );
  const declineInvite = useCallback((groupId: string) => uninvite(groupId, selfIdRef.current), [uninvite]);
  /** People with a pending invite to the group (moderators and up); `undefined` if it couldn't be loaded. */
  const loadInvites = useCallback(
    (groupId: string) =>
      new Promise<User[] | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        socket.timeout(ACK_TIMEOUT).emit("member:invites", { groupId }, (err, users) => {
          resolve(!err && Array.isArray(users) ? users : undefined);
        });
      }),
    [],
  );
  const setMemberRole = useCallback(
    (groupId: string, userId: string, role: Exclude<MemberRole, "owner">) =>
      request("member:update", { groupId, userId, role }),
    [request],
  );
  /** `until: null` unmutes. */
  const muteMember = useCallback(
    (groupId: string, userId: string, until: number | null) => request("member:mute", { groupId, userId, until }),
    [request],
  );
  const kickMember = useCallback(
    (groupId: string, userId: string) => request("member:kick", { groupId, userId }),
    [request],
  );
  /** Without `until` the ban is permanent. */
  const banMember = useCallback(
    (groupId: string, userId: string, options: { reason?: string; until?: number } = {}) =>
      request("member:ban", { groupId, userId, ...options }),
    [request],
  );
  const transferOwnership = useCallback(
    (groupId: string, userId: string) => request("member:transfer", { groupId, userId }),
    [request],
  );
  const unbanMember = useCallback(
    (groupId: string, userId: string) => request("member:unban", { groupId, userId }),
    [request],
  );
  /** Your own profile in the group; `null` goes back to your app-wide one. */
  const setGroupProfile = useCallback(
    (groupId: string, profile: MemberProfile | null) => request("member:profile", { groupId, profile }),
    [request],
  );

  /** Lists that only come back in an ack: `undefined` if they couldn't be loaded. */
  const fetchList = useCallback(
    <T>(event: "member:bans" | "obsidian:bans", payload: object) =>
      new Promise<T[] | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        // The generic event name defeats socket.io's typed overloads.
        (socket.timeout(ACK_TIMEOUT) as unknown as {
          emit: (e: string, p: unknown, ack: (err: Error | null, list: unknown) => void) => void;
        }).emit(event, payload, (err, list) => resolve(!err && Array.isArray(list) ? (list as T[]) : undefined));
      }),
    [],
  );
  const loadBans = useCallback((groupId: string) => fetchList<GroupBan>("member:bans", { groupId }), [fetchList]);
  /** Emit an event whose ack carries data; `undefined` when offline, timed out or refused. */
  const ask = useCallback(
    <
      E extends
        | "invite:create"
        | "invite:list"
        | "invite:preview"
        | "invite:redeem"
        | "report:list"
        | "message:forward"
        | "schedule:create"
        | "schedule:list"
        | "webhook:list"
        | "webhook:create"
        | "bot:list"
        | "bot:add"
        | "bot:refresh"
        | "gif:search"
        | "link:preview"
        | "read:unmark"
        | "quiz:answer"
        | "saved:list",
    >(
      event: E,
      payload: Parameters<ClientToServerEvents[E]>[0],
    ) =>
      new Promise<Parameters<Parameters<ClientToServerEvents[E]>[1]>[0] | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        // The generic event name defeats socket.io's typed overloads.
        (socket.timeout(ACK_TIMEOUT) as unknown as {
          emit: (e: string, p: unknown, ack: (err: Error | null, result: unknown) => void) => void;
        }).emit(event, payload, (err, result) => resolve(err ? undefined : (result as never)));
      }),
    [],
  );

  // Push: this browser's subscription, kept by the server (see usePush).
  const subscribePush = useCallback((subscription: PushSubscriptionInfo) => request("push:subscribe", subscription), [request]);
  const unsubscribePush = useCallback((endpoint: string) => request("push:unsubscribe", { endpoint }), [request]);

  // Invite links. Each resolves to the result, or an error message.
  const createInviteLink = useCallback(
    async (groupId: string, options: { expiresIn?: number; maxUses?: number }) =>
      (await ask("invite:create", { groupId, ...options })) ?? { ok: false as const, error: "The server didn't respond. Try again." },
    [ask],
  );
  /** The group's working links; `undefined` if they couldn't be loaded. */
  const loadInviteLinks = useCallback((groupId: string) => ask("invite:list", { groupId }), [ask]);
  const revokeInviteLink = useCallback((code: string) => request("invite:revoke", { code }), [request]);
  /** What a link leads to; `null` if it doesn't work, `undefined` if the server couldn't be asked. */
  const previewInvite = useCallback((code: string) => ask("invite:preview", { code }), [ask]);
  const redeemInvite = useCallback(
    async (code: string) =>
      (await ask("invite:redeem", { code })) ?? { ok: false as const, error: "The server didn't respond. Try again." },
    [ask],
  );

  // Reports and blocks.
  const reportMessage = useCallback(
    (messageId: string, reason?: string) => request("report:create", { messageId, ...(reason && { reason }) }),
    [request],
  );
  /** Open reports (moderators and up); `undefined` if they couldn't be loaded. */
  const loadReports = useCallback(async (groupId: string) => (await ask("report:list", { groupId })) ?? undefined, [ask]);
  const resolveReport = useCallback((id: string, remove: boolean) => request("report:resolve", { id, remove }), [request]);
  const setBlocked = useCallback(
    (userId: string, blocked: boolean) => request("block:set", { userId, blocked }),
    [request],
  );

  /** Forward a message into another chat; resolves to an error message. */
  const forwardMessage = useCallback(
    async (messageId: string, subgroupId: string) => {
      const result = (await ask("message:forward", { messageId, subgroupId })) ?? noAnswer;
      return result.ok ? undefined : result.error;
    },
    [ask],
  );

  /** Schedule a message; resolves to an error message. */
  const scheduleMessage = useCallback(
    async (subgroupId: string, text: string, attachments: Attachment[], sendAt: number) => {
      const result = (await ask("schedule:create", { subgroupId, text, attachments, sendAt })) ?? noAnswer;
      if (!result.ok) return result.error;
      dispatch({ type: "scheduled", subgroupId });
      return undefined;
    },
    [ask],
  );
  /** Your scheduled messages in a channel; `undefined` if they couldn't be loaded. */
  const loadScheduled = useCallback((subgroupId: string) => ask("schedule:list", { subgroupId }), [ask]);
  const cancelScheduled = useCallback((id: string) => request("schedule:cancel", { id }), [request]);

  // Webhooks (those who manage the group).
  const loadWebhooks = useCallback(async (subgroupId: string) => (await ask("webhook:list", { subgroupId })) ?? undefined, [ask]);
  const createWebhook = useCallback(
    async (subgroupId: string, name: string) => (await ask("webhook:create", { subgroupId, name })) ?? noAnswer,
    [ask],
  );
  const deleteWebhook = useCallback((id: string) => request("webhook:delete", { id }), [request]);

  // Group bots (those who manage the group). Everyone gets their commands with the group list.
  const loadBots = useCallback(async (groupId: string) => (await ask("bot:list", { groupId })) ?? undefined, [ask]);
  const addBot = useCallback(
    async (groupId: string, name: string, url: string) => (await ask("bot:add", { groupId, name, url })) ?? noAnswer,
    [ask],
  );
  const refreshBot = useCallback(async (id: string) => (await ask("bot:refresh", { id })) ?? noAnswer, [ask]);
  const removeBot = useCallback((id: string) => request("bot:remove", { id }), [request]);

  // Custom emoji (those who manage the group).
  const addEmoji = useCallback(
    (groupId: string, name: string, url: string) => request("emoji:add", { groupId, name, url }),
    [request],
  );
  const removeEmoji = useCallback((groupId: string, name: string) => request("emoji:remove", { groupId, name }), [request]);

  // Custom roles (admins and up; the server checks). The new roles arrive with "groups:update",
  // and who holds them with "member:update".
  /** Make a custom role (no `id`) or change one. */
  const saveRole = useCallback(
    (groupId: string, draft: GroupRoleDraft, id?: string) => request("role:save", { groupId, ...draft, ...(id && { id }) }),
    [request],
  );
  const deleteRole = useCallback((groupId: string, id: string) => request("role:delete", { groupId, id }), [request]);
  const reorderRoles = useCallback((groupId: string, order: string[]) => request("roles:reorder", { groupId, order }), [request]);
  /** Set exactly which custom roles someone holds in the group. */
  const setMemberRoles = useCallback(
    (groupId: string, userId: string, roles: string[]) => request("member:roles", { groupId, userId, roles }),
    [request],
  );

  /** GIFs for a search (trending for ""); `null` when GIFs aren't set up, `undefined` if the server couldn't be asked. */
  const searchGifs = useCallback((query: string) => ask("gif:search", { query }), [ask]);

  /** The card a message with this link would get; `null` for none, `undefined` if the server couldn't be asked. */
  const previewLink = useCallback((url: string) => ask("link:preview", { url }), [ask]);

  /** Delete your account (signed-in users); resolves to an error message. */
  const deleteAccount = useCallback(() => request("account:delete", { confirm: "delete" }), [request]);

  /** Turn read receipts ("Seen by") on or off, both ways. Resolves to an error message. */
  const setReadReceipts = useCallback(
    async (on: boolean) => {
      const failure = await request("privacy:set", { readReceipts: on });
      if (!failure) dispatch({ type: "readReceipts", on });
      return failure;
    },
    [request],
  );

  /** Answer the quiz at `quiz` in a message; the server grades it and your answer shows. */
  const answerQuiz = useCallback(
    async (subgroupId: string, messageId: string, quiz: number, option: number) => {
      const result = (await ask("quiz:answer", { messageId, quiz, option })) ?? noAnswer;
      if (!result.ok) return result.error;
      dispatch({ type: "quizAnswer", subgroupId, messageId, quiz, answer: result.answer });
      return undefined;
    },
    [ask],
  );

  /** Save a message for later, or un-save it. Applied right away; undone if it fails. */
  const setSaved = useCallback(
    async (messageId: string, saved: boolean) => {
      dispatch({ type: "saved", messageId, saved });
      const error = await request("saved:set", { messageId, saved });
      if (error) dispatch({ type: "saved", messageId, saved: !saved });
      return error;
    },
    [request],
  );

  /** A page of your saved messages (after `before`, for more); `undefined` if it couldn't be loaded. */
  const loadSaved = useCallback((before?: string) => ask("saved:list", before ? { before } : {}), [ask]);

  /** Say whether you're going to the event at `index` in the message. */
  const rsvp = useCallback(
    (messageId: string, index: number, going: boolean) => request("event:rsvp", { messageId, index, going }),
    [request],
  );

  /** Mark a group's channels read, or everything you're in (no `groupId`). Resolves to an error message. */
  const markAllRead = useCallback(
    (groupId?: string) =>
      new Promise<string | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve("You're offline. Try again once reconnected.");
        socket.timeout(ACK_TIMEOUT).emit("read:markAll", groupId ? { groupId } : {}, (err, result) => {
          if (err) return resolve("The server didn't respond. Try again.");
          if (!result.ok) return resolve(result.error);
          dispatch({ type: "markedRead", groupId, at: Date.now() });
          resolve(undefined);
        });
      }),
    [],
  );

  /** A group's blocked words (those who manage it); `undefined` if they couldn't be loaded. */
  const loadBlockedWords = useCallback(
    (groupId: string) =>
      new Promise<string[] | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        socket.timeout(ACK_TIMEOUT).emit("group:filter", { groupId }, (err, words) => resolve(err || !words ? undefined : words));
      }),
    [],
  );

  /** A page of the group's moderation log (admins and up); `undefined` if it couldn't be loaded. */
  const loadModerationLog = useCallback(
    (groupId: string, before?: string) =>
      new Promise<ModerationLogPage | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        socket.timeout(ACK_TIMEOUT).emit("moderation:log", { groupId, ...(before && { before }) }, (err, page) => {
          resolve(!err && page ? page : undefined);
        });
      }),
    [],
  );

  // Instance administration (app-wide admins; the server checks).
  const updateSettings = useCallback(
    (changes: Partial<ObsidianSettings>) => request("obsidian:update", changes),
    [request],
  );
  const loadInstanceBans = useCallback(() => fetchList<InstanceBan>("obsidian:bans", {}), [fetchList]);
  const banFromInstance = useCallback(
    (userId: string, reason?: string) => request("obsidian:ban", { userId, ...(reason && { reason }) }),
    [request],
  );
  const unbanFromInstance = useCallback((userId: string) => request("obsidian:unban", { userId }), [request]);
  const stopServer = useCallback(
    (mode: "restart" | "shutdown") => request(mode === "restart" ? "obsidian:restart" : "obsidian:shutdown", {}),
    [request],
  );

  const dismissReminder = useCallback((messageId: string) => dispatch({ type: "dismissReminder", messageId }), []);

  /** Your presence and custom status (only the keys given; see "status:set"). */
  const setStatus = useCallback(
    async (changes: Parameters<ClientToServerEvents["status:set"]>[0]) => {
      const error = await request("status:set", changes);
      if (!error && changes.presence) dispatch({ type: "presence", presence: changes.presence });
      return error;
    },
    [request],
  );

  /** Your notification level for a group or channel (`null`: the default). Applied right away; undone if it fails. */
  const setNotificationLevel = useCallback(
    async (targetId: string, level: NotificationLevel | null, previous: NotificationLevel | null) => {
      dispatch({ type: "notificationLevel", targetId, level });
      const error = await request("notifications:set", { targetId, level });
      if (error) dispatch({ type: "notificationLevel", targetId, level: previous });
      return error;
    },
    [request],
  );

  /** Search messages (see "search"); `undefined` if it couldn't run. */
  const search = useCallback(
    (payload: Parameters<ClientToServerEvents["search"]>[0]) =>
      new Promise<SearchPage | undefined>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve(undefined);
        socket.timeout(ACK_TIMEOUT).emit("search", payload, (err, page) => {
          resolve(!err && Array.isArray(page?.messages) ? page : undefined);
        });
      }),
    [],
  );

  /** Open (or start) the direct message with these people. The new conversation arrives with "groups:update" first. */
  const openDm = useCallback(
    (userIds: string[]) =>
      new Promise<DmResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: "You're offline. Try again once reconnected." });
        socket.timeout(ACK_TIMEOUT).emit("dm:open", { userIds }, (err, result) => {
          resolve(err ? { ok: false, error: "The server didn't respond. Try again." } : result);
        });
      }),
    [],
  );

  // Idle for a while (no input, or the tab hidden all along): shown as away.
  // Sent again after reconnecting, since the server forgets it.
  const idleRef = useRef(false);
  useEffect(() => {
    const socket = socketRef.current;
    if (state.status !== "ready" || !socket) return;
    let timer: ReturnType<typeof setTimeout>;
    const setIdle = (idle: boolean) => {
      if (idleRef.current === idle) return;
      idleRef.current = idle;
      socket.emit("presence:idle", { idle });
    };
    const active = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_AFTER);
    };
    if (idleRef.current) socket.emit("presence:idle", { idle: true });
    else active();
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "focus"] as const;
    for (const event of events) window.addEventListener(event, active, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, active);
    };
  }, [state.status]);

  // Track tab visibility: unread counting and read marking depend on it.
  useEffect(() => {
    const update = () => dispatch({ type: "visibility", visible: document.visibilityState === "visible" });
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // "Seen by": how far others have read the open channel, fetched when it opens
  // (and after reconnecting); "read:update" keeps it current.
  useEffect(() => {
    const socket = socketRef.current;
    const subgroupId = state.activeId;
    if (!socket?.connected || state.status !== "ready" || !subgroupId || !state.readReceipts) return;
    let active = true;
    socket.timeout(ACK_TIMEOUT).emit("read:positions", { subgroupId }, (err, positions) => {
      if (active && !err) dispatch({ type: "readPositions", subgroupId, positions });
    });
    return () => {
      active = false;
    };
  }, [state.status, state.activeId, state.readReceipts]);

  // Mark the open channel read up to its newest message whenever that changes
  // while the tab is visible (not while it's held unread: see markUnread).
  const activeLatest = state.activeId ? state.latest[state.activeId] : undefined;
  const held = state.heldUnread !== null && state.heldUnread === state.activeId;
  const markedRef = useRef(new Map<string, string>());
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || state.status !== "ready" || !state.visible || !activeLatest || held) return;
    const { subgroupId, id, createdAt } = activeLatest;
    if (markedRef.current.get(subgroupId) === id) return;
    markedRef.current.set(subgroupId, id);
    socket.emit("read:mark", { subgroupId, messageId: id });
    dispatch({ type: "read", subgroupId, at: createdAt });
  }, [state.status, state.visible, activeLatest, held]);

  /**
   * Mark a channel unread from one of its (top-level) messages on. If it's the
   * open one, it stays unread until you open a channel again.
   */
  const markUnread = useCallback(
    async (subgroupId: string, messageId: string) => {
      const result = (await ask("read:unmark", { subgroupId, messageId })) ?? noAnswer;
      if (!result.ok) return result.error;
      // Read again from the latest message next time, even if it's the one marked before.
      markedRef.current.delete(subgroupId);
      dispatch({ type: "markedUnread", subgroupId, lastRead: result.lastRead, unread: result.unread });
      return undefined;
    },
    [ask],
  );

  return {
    state,
    /** The connection itself, for features with their own events (calls). Set once mounted. */
    socketRef,
    send,
    retry,
    select,
    setTyping,
    lookup,
    rejoin,
    loadOlder,
    editMessage,
    editEvent,
    deleteMessage,
    react,
    vote,
    pin,
    loadThread,
    loadPins,
    loadCollection,
    watchDiscover,
    setViewing,
    loadWiki,
    saveWiki,
    saveGroup,
    deleteGroup,
    saveChannel,
    deleteChannel,
    reorderGroups,
    moveChannel,
    joinGroup,
    leaveGroup,
    inviteMember,
    uninvite,
    declineInvite,
    loadInvites,
    setMemberRole,
    muteMember,
    kickMember,
    banMember,
    transferOwnership,
    unbanMember,
    setGroupProfile,
    loadBans,
    loadModerationLog,
    subscribePush,
    unsubscribePush,
    createInviteLink,
    loadInviteLinks,
    revokeInviteLink,
    previewInvite,
    redeemInvite,
    reportMessage,
    loadReports,
    resolveReport,
    setBlocked,
    rsvp,
    markAllRead,
    markUnread,
    answerQuiz,
    setSaved,
    loadSaved,
    loadBlockedWords,
    setReadReceipts,
    forwardMessage,
    scheduleMessage,
    loadScheduled,
    cancelScheduled,
    loadWebhooks,
    createWebhook,
    deleteWebhook,
    loadBots,
    addBot,
    refreshBot,
    removeBot,
    addEmoji,
    removeEmoji,
    saveRole,
    deleteRole,
    reorderRoles,
    setMemberRoles,
    searchGifs,
    previewLink,
    deleteAccount,
    updateSettings,
    loadInstanceBans,
    banFromInstance,
    unbanFromInstance,
    stopServer,
    dismissReminder,
    setStatus,
    setNotificationLevel,
    search,
    openDm,
  };
}
