"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  Bookmark,
  Ellipsis,
  Hourglass,
  Info,
  LayoutGrid,
  Megaphone,
  Menu,
  Search as SearchIcon,
  Settings,
  Timer,
  Upload,
  Users as UsersIcon,
  VolumeOff,
} from "lucide-react";
import { CallBar, CallButtons } from "@/components/chat/Call";
import ChannelIcon, { channelTypeLabel } from "@/components/chat/ChannelIcon";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { serverCommands } from "@/lib/chat/commands";
import { authorName, formatDateTime, formatDay, formatDisappear, formatTime, isSameDay } from "@/lib/chat/format";
import { DEFAULT_BOT_ID } from "@/lib/commands";
import { formatSlowMode } from "@/lib/chat/safety";
import type {
  Attachment,
  EventAttachment,
  Group,
  Message as MessageType,
  MessageVersion,
  Subgroup,
  User,
} from "@/lib/chat/types";
import type { ChatMessage } from "@/lib/chat/useChat";
import { useUntil } from "@/lib/hooks/useUntil";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu as ActionMenu } from "@/components/Menu";
import Composer, { type ComposerHandle } from "./Composer";
import DeleteDialog from "./DeleteDialog";
import Forum from "./Forum";
import Message from "./Message";
import Pins from "./Pins";
import Scheduled from "./Scheduled";
import Wiki from "./Wiki";

const GROUP_WINDOW = 5 * 60 * 1000;

export { useUntil };

/** Each resolves to an error message, or undefined on success. */
export type MessageActions = {
  edit: (id: string, text: string) => Promise<string | undefined>;
  /** Retitle or retag your forum post (`text` is its text, unchanged). */
  editPost: (id: string, text: string, post: { title: string; tags: string[] }) => Promise<string | undefined>;
  /** Replace the event at `index` in the message. */
  editEvent: (id: string, index: number, event: EventAttachment) => Promise<string | undefined>;
  remove: (id: string) => Promise<string | undefined>;
  react: (id: string, emoji: string) => Promise<string | undefined>;
  /** Vote for `option` (`null` withdraws); `chosen: false` takes one choice back in a multiple-choice poll. */
  vote: (id: string, poll: number, option: number | null, chosen?: boolean) => Promise<string | undefined>;
  pin: (id: string, pinned: boolean) => Promise<string | undefined>;
  /** Whether you can delete someone else's message (moderators and up, for members below them). */
  canRemove: (authorId: string) => boolean;
  /** Flag a message for the group's moderators; absent in direct messages (nobody moderates them). */
  report?: (id: string, reason?: string) => Promise<string | undefined>;
  /** Whether you blocked this author (their messages show collapsed). */
  isBlocked: (authorId: string) => boolean;
  /** Answer Going (or not) to the event at `index` in a message. */
  rsvp: (id: string, index: number, going: boolean) => Promise<string | undefined>;
  /** Forward a message to another chat. */
  forward: (id: string, subgroupId: string) => Promise<string | undefined>;
  /** Answer the quiz at `quiz` in a message (once; the server grades it). */
  answerQuiz: (subgroupId: string, id: string, quiz: number, option: number) => Promise<string | undefined>;
  /** Save a message for later, or un-save it. */
  save: (id: string, saved: boolean) => Promise<string | undefined>;
  /** Whether you saved this message. */
  isSaved: (id: string) => boolean;
  /** Mark the channel unread from this (top-level) message on. */
  markUnread: (subgroupId: string, id: string) => Promise<string | undefined>;
  /** The open group's custom emoji (name → image URL). */
  emoji?: Record<string, string>;
  /** Every version of an edited message's text, oldest first; `undefined` if it couldn't be loaded. */
  history: (id: string) => Promise<MessageVersion[] | undefined>;
};

type ChatProps = {
  group: Group;
  subgroup: Subgroup;
  users: Record<string, User>;
  typingNames: string[];
  usersOpen: boolean;
  onlineCount: number;
  actions: MessageActions;
  /** Signed-in users can upload and edit wiki pages; guests can't. */
  signedIn: boolean;
  /** Can post in announcement channels: the group's owner and admins, and bots. */
  canAnnounce: boolean;
  /** Can pin and unpin: moderators and up (anyone in a direct message). */
  canPin: boolean;
  /** When you're muted in this group: you can't post until then (ms). */
  mutedUntil?: number;
  /** A notice for everyone (from an admin, or about the server stopping), shown under the header. */
  notice?: string;
  /** The thread open beside the channel, to highlight its root. */
  openThreadId?: string;
  onOpenSidebar: () => void;
  onToggleUsers: () => void;
  onOpenThread: (message: MessageType) => void;
  /** Open the panel with the group's events, polls, quizzes and media. */
  onBrowse: () => void;
  /** The browse panel is open beside the channel. */
  browsing: boolean;
  /** Open this chat's settings (about it, its notifications, you in it). */
  onOpenSettings?: () => void;
  /** You're previewing a group you're not in: join it (resolves to an error message). */
  onJoin?: () => Promise<string | undefined>;
  /** A direct message: shown by who's in it rather than as a channel. */
  direct?: { title: string; subtitle?: string };
  /** The search panel is open beside the channel. */
  searching: boolean;
  onSearch: () => void;
  /** Your saved messages are open beside the channel. */
  savedOpen: boolean;
  onSaved: () => void;
  /** The notification settings button (see NotifyMenu). */
  notifyMenu?: ReactNode;
};

/** The header's icon buttons; `pressed` while their panel is open. */
const headerButton =
  "inline-flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground";
const pressed = "bg-surface-2 text-foreground";

/** A thin line between the header's groups of buttons. */
function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border max-sm:hidden" />;
}

export default function Chat({
  group,
  subgroup,
  users,
  typingNames,
  usersOpen,
  onlineCount,
  actions,
  signedIn,
  canAnnounce,
  canPin,
  mutedUntil,
  notice,
  openThreadId,
  onOpenSidebar,
  onToggleUsers,
  onOpenThread,
  onBrowse,
  browsing,
  onOpenSettings,
  onJoin,
  direct,
  searching,
  onSearch,
  savedOpen,
  onSaved,
  notifyMenu,
}: ChatProps) {
  const chat = useChatContext();
  const t = useT();
  const { state, retry: onRetry, lookup } = chat;
  const { selfId, references } = state;
  const connected = state.status === "ready";
  const id = subgroup.id;
  // `undefined` while history is loading.
  const messages = state.messages[id];
  const hasMore = state.hasMore[id] ?? false;
  const dividerAt = state.dividerAt[id];
  // `undefined` until fetched; wiki pages only exist for wiki channels.
  const pins = state.pins[id];
  const wikiPage = state.wiki[id];
  // Stable while the channel is: the message list looks up missing replies in an effect.
  const onLookup = useCallback((ids: string[]) => lookup(id, ids), [lookup, id]);
  const onLoadOlder = (beforeId: string) => chat.loadOlder(id, beforeId);
  const onSend = (text: string, attachments: Attachment[], options?: { preview?: boolean }) =>
    chat.send(id, text, attachments, undefined, options);
  const onTyping = (typing: boolean) => chat.setTyping(id, typing);
  const onLoadPins = () => chat.loadPins(id);
  const onLoadWiki = () => chat.loadWiki(id);
  const onSaveWiki = (body: string, baseVersion: number) => chat.saveWiki(id, body, baseVersion);
  const composerRef = useRef<ComposerHandle>(null);
  useEffect(() => {
    activeComposer = composerRef;
    return () => {
      if (activeComposer === composerRef) activeComposer = null;
    };
  }, []);
  const [reply, setReply] = useState<{ subgroupId: string; message: MessageType } | null>(null);
  const [editing, setEditing] = useState<{ subgroupId: string; id: string } | null>(null);
  const [tab, setTab] = useState<{ subgroupId: string; tab: "page" | "chat" } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Replies, edits and tabs only apply to the channel they were started in.
  const replyTo =
    reply?.subgroupId === subgroup.id
      ? { message: reply.message, authorName: authorName(users[reply.message.authorId], reply.message.authorId) }
      : undefined;
  const editingId = editing?.subgroupId === subgroup.id ? editing.id : null;
  const isWiki = subgroup.type === "wiki";
  // A forum lists its posts instead of a chat; each post's conversation is its thread.
  const isForum = subgroup.type === "forum";
  const view = isWiki ? (tab?.subgroupId === subgroup.id ? tab.tab : "page") : "chat";
  const muted = useUntil(mutedUntil);
  const readOnly = muted || (subgroup.type === "announcement" && !canAnnounce);
  const acceptsFiles = view === "chat" && !readOnly && !isForum;
  const mutedNotice = (
    <p className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
      <VolumeOff aria-hidden className="size-4 shrink-0" />
      <span>
        You&apos;re muted in {group.name} until{" "}
        <span className="font-medium text-foreground">{formatDateTime(mutedUntil!)}</span>.
      </span>
    </p>
  );
  // Under the composer: the channel's disappearing timer and slow mode.
  const composerHint =
    subgroup.slowMode || subgroup.disappearAfter ? (
      <span className="inline-flex items-center gap-3">
        {subgroup.disappearAfter !== undefined && subgroup.disappearAfter > 0 && (
          <span className="inline-flex items-center gap-1" title="Messages here are deleted for everyone once they're this old">
            <Hourglass aria-hidden className="size-3.5" />
            Disappearing: {formatDisappear(subgroup.disappearAfter)}
          </span>
        )}
        {subgroup.slowMode !== undefined && subgroup.slowMode > 0 && (
          <span className="inline-flex items-center gap-1" title="Moderators aren't limited">
            <Timer aria-hidden className="size-3.5" />
            Slow mode: {formatSlowMode(subgroup.slowMode)}
          </span>
        )}
      </span>
    ) : undefined;
  const loaded = useMemo(() => new Set(messages?.map((m) => m.id)), [messages]);
  const defaultBot = users[DEFAULT_BOT_ID]?.name;
  const commands = useMemo(() => serverCommands(group, defaultBot), [group, defaultBot]);
  // "#channel" suggestions: the group's channels (the ones you can see), not in direct messages.
  const linkable = useMemo(
    () => (group.kind === "dm" ? [] : group.subgroups.map((s) => ({ id: s.id, name: s.name }))),
    [group],
  );

  const hasFiles = (event: DragEvent) => acceptsFiles && event.dataTransfer.types.includes("Files");

  function editLast() {
    const last = messages?.findLast((m) => m.authorId === selfId && !m.status && !m.deleted);
    if (!last) return false;
    setEditing({ subgroupId: subgroup.id, id: last.id });
    return true;
  }

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (hasFiles(event)) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        composerRef.current?.addFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open groups"
          className="-ml-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <span
          title={direct ? "Direct message" : channelTypeLabel[subgroup.type ?? "text"]}
          className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted sm:flex"
        >
          {direct ? <AtSign aria-hidden className="size-4" /> : <ChannelIcon type={subgroup.type} className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate leading-tight font-semibold">
            {direct ? (
              direct.title
            ) : (
              <>
                <span aria-hidden className="mr-0.5 text-muted sm:hidden">
                  #
                </span>
                {subgroup.name}
              </>
            )}
          </h1>
          {/* The group, then the topic; on phones just the topic (the sidebar says the group). */}
          <p className="truncate text-xs text-muted">
            {direct ? (
              (direct.subtitle ?? "Direct message")
            ) : (
              <>
                <span className={cn(subgroup.topic && "max-sm:hidden")}>{group.name}</span>
                {subgroup.topic && (
                  <>
                    <span aria-hidden className="max-sm:hidden">
                      {" · "}
                    </span>
                    {subgroup.topic}
                  </>
                )}
              </>
            )}
          </p>
        </div>

        {isWiki && (
          <div role="tablist" aria-label="View" className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
            {(["page", "chat"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setTab({ subgroupId: subgroup.id, tab: option })}
                className={cn(
                  "rounded-md px-3 py-1 capitalize transition-colors",
                  view === option ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Calls, then the chat's tools, then its settings and members. Narrow screens fold search,
            browsing and settings into "More". */}
        <div className="flex shrink-0 items-center gap-0.5">
          {(direct || group.role) && (
            <>
              {/* Direct messages ring; a group's channels have drop-in rooms for its members. */}
              <CallButtons subgroupId={subgroup.id} />
              <Divider />
            </>
          )}
          {view === "chat" && (
            <Pins
              key={subgroup.id}
              pins={pins}
              users={users}
              selfId={selfId}
              connected={connected}
              loaded={loaded}
              onLoad={onLoadPins}
              onJump={jumpTo}
              onUnpin={canPin ? (id) => actions.pin(id, false) : undefined}
            />
          )}
          <button
            type="button"
            onClick={onSearch}
            aria-pressed={searching}
            aria-label={t("chat.search")}
            title={t("chat.searchTitle")}
            className={cn(headerButton, "max-md:hidden", searching && pressed)}
          >
            <SearchIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={onSaved}
            aria-pressed={savedOpen}
            aria-label={t("chat.saved")}
            title={t("chat.saved")}
            className={cn(headerButton, "max-md:hidden", savedOpen && pressed)}
          >
            <Bookmark className="size-5" />
          </button>
          {notifyMenu}
          <button
            type="button"
            onClick={onBrowse}
            aria-pressed={browsing}
            aria-label={`Browse events, polls, quizzes, media, files and voice messages in ${group.name}`}
            title={`Events, polls, quizzes, gallery, files and voice messages in ${group.name}`}
            className={cn(headerButton, "max-md:hidden", browsing && pressed)}
          >
            <LayoutGrid className="size-5" />
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t("chat.settings")}
              title={t("chat.settings")}
              className={cn(headerButton, "max-md:hidden")}
            >
              <Settings className="size-5" />
            </button>
          )}
          <span className="md:hidden">
            <ActionMenu
              label={t("chat.more")}
              align="end"
              className="w-60"
              items={[
                { label: searching ? t("search.close") : t("chat.search"), icon: <SearchIcon className="size-4" />, onSelect: onSearch },
                { label: savedOpen ? t("chat.closeSaved") : t("chat.saved"), icon: <Bookmark className="size-4" />, onSelect: onSaved },
                {
                  label: browsing ? t("chat.closeBrowse") : t("chat.browse"),
                  description: t("chat.browseHint"),
                  icon: <LayoutGrid className="size-4" />,
                  onSelect: onBrowse,
                },
                ...(onOpenSettings
                  ? [{ label: t("chat.settings"), icon: <Settings className="size-4" />, onSelect: onOpenSettings }]
                  : []),
              ]}
              trigger={(props) => (
                <button type="button" {...props} aria-label={t("chat.more")} title={t("chat.more")} className={cn(headerButton, "aria-expanded:bg-surface-2")}>
                  <Ellipsis className="size-5" />
                </button>
              )}
            />
          </span>
          <Divider />
          <button
            type="button"
            onClick={onToggleUsers}
            aria-pressed={usersOpen}
            aria-label={t.plural("chat.members", onlineCount)}
            title="Members"
            // The side panel only shows on wide screens (smaller ones open it as a drawer).
            className={cn(headerButton, "gap-1.5 pr-2.5 text-xs font-medium tabular-nums", usersOpen && "lg:bg-surface-2 lg:text-foreground")}
          >
            <UsersIcon className="size-5" />
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full bg-online" />
              {onlineCount}
            </span>
          </button>
        </div>
      </header>

      {onJoin && <JoinBar key={group.id} groupName={group.name} onJoin={onJoin} />}
      <CallBar subgroupId={subgroup.id} />
      {notice && (
        <p role="status" className="flex items-start gap-2 border-b border-border bg-accent/10 px-4 py-2 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-bright" />
          <span className="min-w-0 wrap-break-word">{notice}</span>
        </p>
      )}
      {!connected && (
        <p role="status" className="border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-muted">
          {t("chat.reconnecting")}
        </p>
      )}

      {view === "page" ? (
        <Wiki
          key={subgroup.id}
          subgroup={subgroup}
          page={wikiPage}
          users={users}
          selfId={selfId}
          canEdit={signedIn}
          connected={connected}
          onLoad={onLoadWiki}
          onSave={onSaveWiki}
          emoji={actions.emoji}
          channels={linkable}
        />
      ) : isForum ? (
        <Forum
          key={subgroup.id}
          subgroup={subgroup}
          posts={messages}
          users={users}
          connected={connected}
          openThreadId={openThreadId}
          readOnly={muted ? mutedNotice : undefined}
          onOpen={onOpenThread}
          onLoad={(query, cursor) => chat.loadPosts(id, query, cursor)}
          onRetry={onRetry}
          renderComposer={({ title, tags }, onSent) => (
            <Composer
              ref={composerRef}
              gifs={state.gifs}
              stickers={group.stickers}
              label={t("chat.writePost", { channel: subgroup.name })}
              users={users}
              selfId={selfId}
              canUpload={signedIn}
              held={title ? undefined : t("chat.needsTitle")}
              hint={composerHint}
              draftKey={`forum:${subgroup.id}`}
              onSend={(text, attachments, options) => {
                chat.send(id, text, attachments, undefined, { ...options, title, tags });
                onSent();
              }}
              commands={commands}
              emoji={actions.emoji}
              channels={linkable}
              onPreviewLink={chat.previewLink}
            />
          )}
        />
      ) : (
        <>
          <MessageList
            key={subgroup.id}
            subgroup={subgroup}
            directTitle={direct?.title}
            messages={messages}
            users={users}
            selfId={selfId}
            references={references}
            connected={connected}
            hasMore={hasMore}
            dividerAt={dividerAt}
            readers={state.readReceipts ? state.readPositions[id] : undefined}
            oneOnOne={group.kind === "dm" && (group.members?.length ?? 0) <= 2}
            actions={actions}
            canPin={canPin}
            editingId={editingId}
            openThreadId={openThreadId}
            onEditingChange={(id) => setEditing(id ? { subgroupId: subgroup.id, id } : null)}
            onLoadOlder={onLoadOlder}
            onLookup={onLookup}
            onRetry={onRetry}
            onReply={(message) => setReply({ subgroupId: subgroup.id, message })}
            onOpenThread={onOpenThread}
            onMention={(name) => composerRef.current?.mention(name)}
          />

          <div className="shrink-0 px-4 pb-4">
            {readOnly ? (
              <>
                <div className="h-6 px-1">
                  <TypingIndicator names={typingNames} />
                </div>
                {muted ? (
                  mutedNotice
                ) : (
                  <p className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
                    <Megaphone aria-hidden className="size-4 shrink-0" />
                    <span>
                      Only the group&apos;s owner and admins post in{" "}
                      <span className="font-medium text-foreground">#{subgroup.name}</span>. Reply in
                      a thread to join the conversation.
                    </span>
                  </p>
                )}
              </>
            ) : (
              <>
              <Scheduled subgroupId={subgroup.id} />
              <Composer
                key={subgroup.id}
                ref={composerRef}
                gifs={state.gifs}
                stickers={group.stickers}
                onSchedule={(text, attachments, sendAt) => chat.scheduleMessage(id, text, attachments, sendAt)}
                label={direct ? t("chat.messageDm", { name: direct.title }) : t("chat.message", { channel: subgroup.name })}
                users={users}
                selfId={selfId}
                replyTo={replyTo}
                canUpload={signedIn}
                status={<TypingIndicator names={typingNames} />}
                hint={composerHint}
                draftKey={subgroup.id}
                onCancelReply={() => setReply(null)}
                onSend={onSend}
                onTyping={onTyping}
                onEditLast={editLast}
                commands={commands}
                emoji={actions.emoji}
                channels={linkable}
                onPreviewLink={chat.previewLink}
              />
              </>
            )}
          </div>
        </>
      )}

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-background/85 text-sm font-medium"
        >
          <Upload className="size-8 text-accent-bright" />
          {signedIn ? `Drop files to attach them to #${subgroup.name}` : "Sign in to attach files"}
        </div>
      )}
    </main>
  );
}

type MessageListProps = {
  subgroup: Subgroup;
  /** A direct message's title: its start says who it's with. */
  directTitle?: string;
  messages?: ChatMessage[];
  users: Record<string, User>;
  selfId: string;
  references: Record<string, MessageType | null>;
  connected: boolean;
  hasMore: boolean;
  /** Messages after this time (from others) get a "New messages" divider. */
  dividerAt?: number;
  /** How far others have read this channel (member id → ms), for "Seen by". */
  readers?: Record<string, number>;
  /** A one-on-one conversation: "Seen" says enough. */
  oneOnOne: boolean;
  actions: MessageActions;
  canPin: boolean;
  editingId: string | null;
  openThreadId?: string;
  onEditingChange: (id: string | null) => void;
  onLoadOlder: (beforeId: string) => Promise<void>;
  onLookup: (ids: string[]) => void;
  onRetry: (message: ChatMessage) => void;
  /** Put "@name" in the composer (from an author's menu). */
  onMention: (name: string) => void;
  onReply: (message: MessageType) => void;
  onOpenThread: (message: MessageType) => void;
};

function replyTarget(message: MessageType) {
  return message.attachments?.find((a) => a.type === "reply")?.messageId;
}

/** Scroll to a rendered message, focus it and briefly highlight it. */
/** The open channel's composer (one at a time), for actions from outside the chat. */
let activeComposer: RefObject<ComposerHandle | null> | null = null;

/** Put "@name" in the open channel's message box, if there is one (e.g. from the members panel). */
export function mentionInComposer(name: string) {
  activeComposer?.current?.mention(name);
}

export function jumpTo(id: string) {
  const el = document.getElementById(`message-${id}`);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.focus({ preventScroll: true });
  el.classList.remove("message-flash");
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add("message-flash");
  el.addEventListener("animationend", () => el.classList.remove("message-flash"), { once: true });
}

/** Under your latest message: who has read up to it ("Seen" in a one-on-one). */
function SeenBy({
  messages,
  readers,
  users,
  selfId,
  oneOnOne,
}: {
  messages: ChatMessage[];
  readers?: Record<string, number>;
  users: Record<string, User>;
  selfId: string;
  oneOnOne: boolean;
}) {
  const last = messages.findLast((m) => !m.system && !m.status && !m.deleted);
  if (!last || last.authorId !== selfId || !readers) return null;
  const names = Object.entries(readers)
    .filter(([id, at]) => id !== selfId && at >= last.createdAt)
    .map(([id]) => authorName(users[id], id));
  if (names.length === 0) return null;
  const text = oneOnOne
    ? "Seen"
    : names.length <= 3
      ? `Seen by ${names.join(", ")}`
      : `Seen by ${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return (
    <p className="px-4 pt-0.5 text-right text-[11px] text-muted" title={oneOnOne ? undefined : names.join(", ")}>
      {text}
    </p>
  );
}

/** Whether `message` continues `prev`'s run (same author, shortly after): hide its avatar and name. */
export function continuesRun(prev: MessageType | undefined, message: MessageType) {
  return (
    prev !== undefined &&
    // System messages are their own line: neither joins a run.
    !prev.system &&
    !message.system &&
    isSameDay(prev.createdAt, message.createdAt) &&
    prev.authorId === message.authorId &&
    message.createdAt - prev.createdAt < GROUP_WINDOW &&
    // Replies, pins and thread roots keep their header so the extra line sits above the author.
    !message.attachments?.some((a) => a.type === "reply") &&
    !message.pinned &&
    !prev.thread
  );
}

function MessageList({
  subgroup,
  directTitle,
  messages,
  users,
  selfId,
  references,
  connected,
  hasMore,
  dividerAt,
  readers,
  oneOnOne,
  actions,
  canPin,
  editingId,
  openThreadId,
  onEditingChange,
  onLoadOlder,
  onLookup,
  onRetry,
  onReply,
  onOpenThread,
  onMention,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  // The "New" divider is above the visible area (so the banner offers to jump to it).
  const [dividerAbove, setDividerAbove] = useState(false);
  // The banner was dismissed for this divider.
  const [dismissedAt, setDismissedAt] = useState<number>();
  const [deleting, setDeleting] = useState<MessageType | null>(null);
  // First message from someone else after the read position captured when
  // the channel was opened.
  const dividerIndex =
    dividerAt === undefined
      ? -1
      : (messages ?? []).findIndex(
          (m) => !m.status && !m.system && m.authorId !== selfId && m.createdAt > dividerAt,
        );
  // What arrived since the divider, from others.
  const unreadSince =
    dividerIndex < 0 ? 0 : (messages ?? []).slice(dividerIndex).filter((m) => !m.system && m.authorId !== selfId).length;
  // Follow new messages only while the reader is already at the bottom.
  const pinnedRef = useRef(true);
  // While scrolled up: the newest message when the reader left the bottom,
  // to count what arrived since.
  const [awayFrom, setAwayFrom] = useState<string | null>(null);
  const last = messages?.at(-1);
  const byId = useMemo(() => new Map(messages?.map((m) => [m.id, m])), [messages]);

  // Reply targets older than the loaded history get fetched by id.
  const missing = new Set<string>();
  for (const message of messages ?? []) {
    const target = replyTarget(message);
    if (target && !byId.has(target) && !(target in references)) missing.add(target);
  }
  const missingKey = [...missing].join(",");
  useEffect(() => {
    if (connected && missingKey) onLookup(missingKey.split(","));
  }, [connected, missingKey, onLookup]);

  // Only a new message at the END moves the view; older pages are prepended
  // without changing `last`, so they never yank the reader to the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current || last?.authorId === selfId) el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.authorId, selfId]);

  // Older history: load when the reader nears the top, and keep their place
  // by restoring the distance from the bottom after the page is prepended.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const anchorRef = useRef<{ height: number; top: number; firstId: string } | null>(null);
  const first = messages?.find((m) => !m.status);

  async function loadOlder() {
    const el = scrollRef.current;
    if (!el || !first || !hasMore || loadingOlder) return;
    anchorRef.current = { height: el.scrollHeight, top: el.scrollTop, firstId: first.id };
    setLoadingOlder(true);
    await onLoadOlder(first.id);
    setLoadingOlder(false);
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    if (first?.id !== anchor.firstId) {
      el.scrollTop = el.scrollHeight - anchor.height + anchor.top;
      anchorRef.current = null;
    } else if (!loadingOlder) {
      anchorRef.current = null; // request failed or returned nothing
    }
  }, [first?.id, loadingOlder]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }

  const awayIndex = awayFrom && messages ? messages.findIndex((m) => m.id === awayFrom) : -1;
  const arrived =
    awayIndex >= 0 && messages ? messages.slice(awayIndex + 1).filter((m) => m.authorId !== selfId).length : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          pinnedRef.current = atBottom;
          // Only on change: this runs on every scroll frame.
          if (atBottom !== (awayFrom === null)) setAwayFrom(atBottom ? null : (last?.id ?? null));
          const divider = dividerRef.current;
          const above = Boolean(divider && divider.offsetTop + divider.offsetHeight < el.scrollTop);
          if (above !== dividerAbove) setDividerAbove(above);
          if (el.scrollTop < 300) void loadOlder();
        }}
        role="log"
        aria-label={`Messages in #${subgroup.name}`}
        className="flex-1 overflow-y-auto"
      >
        {!messages ? (
          <MessagesSkeleton />
        ) : (
          <div className="flex min-h-full flex-col justify-end pt-6 pb-2">
            {hasMore ? (
              // Scrolling up loads these automatically; the button is for keyboards.
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="rounded-full px-3 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:hover:bg-transparent"
                >
                  {loadingOlder ? "Loading older messages…" : "Load older messages"}
                </button>
              </div>
            ) : (
              <ChannelStart subgroup={subgroup} directTitle={directTitle} />
            )}

            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt);
              const target = replyTarget(message);
              const replyTo = target
                ? {
                    original: byId.get(target) ?? references[target],
                    onJump: byId.has(target) ? () => jumpTo(target) : undefined,
                  }
                : undefined;
              return (
                <Fragment key={message.id}>
                  {newDay && <DayDivider at={message.createdAt} />}
                  {index === dividerIndex && (
                    <div
                      ref={dividerRef}
                      role="separator"
                      aria-label="New messages"
                      className="my-2 flex items-center gap-3 px-4 text-[11px] font-semibold text-danger"
                    >
                      <span className="h-px flex-1 bg-danger/60" />
                      <span className="rounded-full bg-danger-strong px-2 py-px text-[10px] tracking-wide text-white uppercase">
                        New
                      </span>
                    </div>
                  )}
                  <Message
                    message={message}
                    users={users}
                    selfId={selfId}
                    replyTo={replyTo}
                    compact={continuesRun(prev, message)}
                    highlighted={openThreadId === message.id}
                    editing={editingId === message.id}
                    onEditingChange={(on) => onEditingChange(on ? message.id : null)}
                    onRetry={onRetry}
                    onReply={onReply}
                    onOpenThread={onOpenThread}
                    onEdit={actions.edit}
                    // System messages are the channel's: only moderators remove them.
                    canDelete={(message.authorId === selfId && !message.system) || actions.canRemove(message.authorId)}
                    onDelete={(target, skipConfirm) => {
                      if (skipConfirm) void actions.remove(target.id);
                      else setDeleting(target);
                    }}
                    onReact={actions.react}
                    onVote={actions.vote}
                    onEditEvent={actions.editEvent}
                    onPin={canPin ? actions.pin : undefined}
                    onReport={actions.report}
                    onRsvp={actions.rsvp}
                    onForward={actions.forward}
                    onAnswerQuiz={(id, quiz, option) => actions.answerQuiz(subgroup.id, id, quiz, option)}
                    saved={actions.isSaved(message.id)}
                    onSave={actions.save}
                    onLoadHistory={actions.history}
                    onMarkUnread={(id) => actions.markUnread(subgroup.id, id)}
                    emoji={actions.emoji}
                    blocked={actions.isBlocked(message.authorId)}
                    onJump={jumpTo}
                    onMention={onMention}
                  />
                </Fragment>
              );
            })}
            <SeenBy messages={messages} readers={readers} users={users} selfId={selfId} oneOnOne={oneOnOne} />
          </div>
        )}
      </div>

      {dividerIndex >= 0 && dividerAbove && dismissedAt !== dividerAt && (
        <div className="absolute inset-x-3 top-2 z-10 flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground shadow-lg">
          <button
            type="button"
            onClick={() => {
              const divider = dividerRef.current;
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              divider?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:underline"
          >
            <ArrowUp aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {unreadSince} new {unreadSince === 1 ? "message" : "messages"} since{" "}
              {formatTime(dividerAt!)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDismissedAt(dividerAt)}
            className="shrink-0 rounded px-1.5 py-0.5 hover:bg-white/15"
          >
            Mark as read
          </button>
        </div>
      )}

      {awayFrom !== null && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-lg transition-colors",
            arrived > 0
              ? "border-accent bg-accent text-accent-foreground hover:opacity-90"
              : "border-border bg-surface text-foreground hover:bg-surface-2",
          )}
        >
          <ArrowDown aria-hidden className="size-3.5" />
          {arrived > 0 ? `${arrived > 99 ? "99+" : arrived} new ${arrived === 1 ? "message" : "messages"}` : "Jump to latest"}
        </button>
      )}

      <DeleteDialog message={deleting} selfId={selfId} onClose={() => setDeleting(null)} onDelete={actions.remove} />
    </div>
  );
}

export function DayDivider({ at }: { at: number }) {
  return (
    <div role="separator" aria-label={formatDay(at)} className="relative my-4 flex items-center justify-center px-4">
      <span aria-hidden className="absolute inset-x-4 h-px bg-border" />
      <span className="relative rounded-full border border-border bg-background px-3 py-0.5 text-[11px] font-semibold text-muted">
        {formatDay(at)}
      </span>
    </div>
  );
}

/** Shown while previewing a group you're not in (it isn't in your sidebar until you join). */
function JoinBar({ groupName, onJoin }: { groupName: string; onJoin: () => Promise<string | undefined> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div role="status" className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-sm">
      <p className="min-w-0 flex-1">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            You&apos;re previewing <span className="font-medium">{groupName}</span>. Join to keep it in your sidebar.
          </>
        )}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await onJoin());
          setBusy(false);
        }}
        className="h-8 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Joining…" : "Join"}
      </button>
    </div>
  );
}

function ChannelStart({ subgroup, directTitle }: { subgroup: Subgroup; directTitle?: string }) {
  if (directTitle) {
    return (
      <div className="px-4 pb-2">
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-surface-2">
          <AtSign aria-hidden className="size-7 text-muted" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{directTitle}</h2>
        <p className="mt-1 text-sm text-muted">
          This is the start of your conversation. Only the people in it can see it.
        </p>
      </div>
    );
  }
  const intro =
    subgroup.type === "announcement"
      ? "News and updates from admins. Reply in a thread to discuss."
      : subgroup.type === "wiki"
        ? "Talk about this channel's page here. Switch to the Page tab to read or edit it."
        : subgroup.type === "voice"
          ? "Picking this channel in the sidebar joins its call. Chat here while you talk."
          : "This is the start of the channel.";
  return (
    <div className="px-4 pb-2">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-surface-2">
        <ChannelIcon type={subgroup.type} className="size-7 text-muted" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Welcome to #{subgroup.name}</h2>
      <p className="mt-1 text-sm text-muted">{subgroup.topic ? `${subgroup.topic}. ${intro}` : intro}</p>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex min-h-full flex-col justify-end gap-5 p-4" aria-busy>
      {[72, 48, 64].map((width, i) => (
        <div key={i} className="flex gap-3">
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
            <div className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${width}%` }} />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}

export function TypingIndicator({ names }: { names: string[] }) {
  const t = useT();
  let text = "";
  if (names.length === 1) text = t("chat.typing.one", { name: names[0] });
  else if (names.length === 2) text = t("chat.typing.two", { first: names[0], second: names[1] });
  else if (names.length > 2) text = t("chat.typing.many");

  return (
    <p aria-live="polite" className="flex h-6 min-w-0 items-center gap-1.5 text-xs text-muted">
      {text && (
        <>
          <span aria-hidden className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="typing-dot size-1 rounded-full bg-current"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <span className="truncate">{text}…</span>
        </>
      )}
    </p>
  );
}
