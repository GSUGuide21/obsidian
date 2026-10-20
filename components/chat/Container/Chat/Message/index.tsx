"use client";

import { useId, useState } from "react";
import {
  Ban,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  CornerUpLeft,
  Flag,
  Forward,
  Hash,
  Info,
  MessageSquareDot,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  ShieldBan,
  ShieldCheck,
  SmilePlus,
  Trash,
  UserMinus,
  UserPlus,
  UserX,
  type LucideIcon,
} from "lucide-react";
import Dialog from "@/components/Dialog";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import EventForm from "@/components/chat/Container/Chat/Composer/EventForm";
import UserMenu from "@/components/chat/UserMenu";
import TextArea from "@/components/form/TextArea";
import { authorName, formatDateTime, formatRelative, formatTime, summarize, systemText } from "@/lib/chat/format";
import ForwardDialog from "../ForwardDialog";
import {
  MAX_MESSAGE_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  type EventAttachment,
  type Message as MessageType,
  type SystemEvent,
  type ThreadSummary,
  type User,
} from "@/lib/chat/types";
import type { ChatMessage } from "@/lib/chat/useChat";
import { cn } from "@/lib/utils";
import Attachment from "./Attachment";
import Mention from "./Attachment/Mention";
import Reply from "./Attachment/Reply";
import MarkdownText from "./Markdown";
import Reactions, { EmojiPicker } from "./Reactions";

/** Resolves to an error message, or undefined on success. */
type Action<A extends unknown[]> = (...args: A) => Promise<string | undefined>;

type MessageProps = {
  message: ChatMessage;
  users: Record<string, User>;
  selfId: string;
  /** The replied-to message, resolved by the list (see Reply for the states). */
  replyTo?: { original: MessageType | null | undefined; onJump?: () => void };
  /** Continuation of the previous author's run: hide avatar and name. */
  compact: boolean;
  /** Its thread is open in the side panel. */
  highlighted?: boolean;
  /** Held by the list, so only one message is edited at a time. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRetry: (message: ChatMessage) => void;
  /** Quote-reply in the channel. Absent inside threads. */
  onReply?: (message: MessageType) => void;
  /** Open this message's thread. Absent inside threads. */
  onOpenThread?: (message: MessageType) => void;
  onEdit: Action<[id: string, text: string]>;
  /** Your own messages, and others' when you can moderate them. */
  canDelete: boolean;
  /** `skipConfirm` when shift-clicked. */
  onDelete: (message: MessageType, skipConfirm: boolean) => void;
  onReact: Action<[id: string, emoji: string]>;
  onVote: Action<[id: string, poll: number, option: number | null]>;
  /** Replace an event in the message; offered to whoever can delete it (its author and moderators). */
  onEditEvent?: Action<[id: string, index: number, event: EventAttachment]>;
  /** Absent where pinning isn't allowed (guests, thread replies). */
  onPin?: Action<[id: string, pinned: boolean]>;
  /** Flag it for moderators; absent where nobody moderates (direct messages). */
  onReport?: Action<[id: string, reason?: string]>;
  /** Answer Going (or not) to an event in it. */
  onRsvp?: Action<[id: string, index: number, going: boolean]>;
  /** Forward it to another chat. */
  onForward?: Action<[id: string, subgroupId: string]>;
  /** Answer the quiz at `quiz` in it (once; the server grades it). */
  onAnswerQuiz?: Action<[id: string, quiz: number, option: number]>;
  /** You saved it for later. */
  saved?: boolean;
  /** Save it for later, or un-save it. */
  onSave?: Action<[id: string, saved: boolean]>;
  /** Mark its channel unread from here on; absent in threads. */
  onMarkUnread?: Action<[id: string]>;
  /** The group's custom emoji (name → image URL), for ":name:" in text and reactions. */
  emoji?: Record<string, string>;
  /** You blocked its author: it shows collapsed until you choose to see it. */
  blocked?: boolean;
  /** Scroll to another message in the list (e.g. the one a system message says was pinned). */
  onJump?: (messageId: string) => void;
  /** Put "@name" in the composer (from the author's menu). */
  onMention?: (name: string) => void;
};

export default function Message({
  message,
  users,
  selfId,
  replyTo,
  compact,
  highlighted,
  editing,
  onEditingChange,
  onRetry,
  onReply,
  onOpenThread,
  onEdit,
  canDelete,
  onDelete,
  onReact,
  onVote,
  onEditEvent,
  onPin,
  onReport,
  onRsvp,
  onForward,
  onAnswerQuiz,
  saved = false,
  onSave,
  onMarkUnread,
  emoji,
  blocked = false,
  onJump,
  onMention,
}: MessageProps) {
  const [picking, setPicking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  // The event (by attachment index) open in the manage dialog.
  const [managing, setManaging] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string>();

  const author = users[message.authorId];
  const name = authorName(author, message.authorId);

  if (message.system) {
    return (
      <SystemLine
        message={message}
        event={message.system}
        name={name}
        nameOf={(id) => authorName(users[id], id)}
        onDelete={canDelete ? (skipConfirm) => onDelete(message, skipConfirm) : undefined}
        onJump={onJump}
      />
    );
  }
  const time = formatTime(message.createdAt);
  const dateTime = new Date(message.createdAt).toISOString();
  const mine = message.authorId === selfId;
  const confirmed = !message.status;

  // Someone you blocked: one quiet line, until you ask to see it.
  if (blocked && !revealed && !message.deleted) {
    return (
      <div
        id={`message-${message.id}`}
        tabIndex={-1}
        className={cn("flex scroll-mt-4 items-center gap-3 px-4 text-sm text-muted italic outline-none", compact ? "py-0.5 dense:py-0" : "mt-2 py-1 dense:mt-0.5")}
      >
        <span className="flex w-9 shrink-0 justify-center">
          <ShieldBan aria-hidden className="size-4" />
        </span>
        <span>
          Message from someone you blocked ·{" "}
          <button type="button" onClick={() => setRevealed(true)} className="font-medium not-italic text-accent-bright hover:underline">
            Show
          </button>
        </span>
      </div>
    );
  }

  const attachments = message.attachments ?? [];
  const mentions = attachments.filter((a) => a.type === "mention");
  const mentionsSelf = !message.deleted && mentions.some((m) => m.userId === selfId);
  // "@Name" written in the text becomes a chip in place; mentions that aren't
  // in the text are shown as chips before it.
  const named = mentions.flatMap((m) => {
    const user = users[m.userId];
    return user ? [{ userId: m.userId, name: user.name }] : [];
  });
  const lowerText = message.text.toLowerCase();
  const leading = mentions.filter((m) => {
    const user = users[m.userId];
    return !user || !lowerText.includes(`@${user.name.toLowerCase()}`);
  });
  // Keep each attachment's index in the full list: polls are addressed by it.
  const body = attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ attachment }) => attachment.type !== "mention" && attachment.type !== "reply" && attachment.type !== "forward");
  const forwarded = attachments.find((a) => a.type === "forward");

  async function run(action: Promise<string | undefined>) {
    setActionError(await action);
  }

  const managed = managing === null ? undefined : attachments[managing];
  const canManageEvents = confirmed && canDelete && Boolean(onEditEvent);

  return (
    <article
      id={`message-${message.id}`}
      tabIndex={-1}
      className={cn(
        "group relative flex scroll-mt-4 gap-3 px-4 outline-none transition-colors hover:bg-surface/60",
        compact ? "py-0.5 dense:py-0" : "mt-2 pt-1.5 pb-0.5 dense:mt-0.5 dense:pt-0.5",
        mentionsSelf && "border-l-2 border-accent bg-accent/5 pl-3.5 hover:bg-accent/10",
        message.pinned && !mentionsSelf && "bg-warning/5 hover:bg-warning/10",
        (editing || highlighted) && "bg-accent/8 hover:bg-accent/10",
      )}
    >
      {compact ? (
        <time
          dateTime={dateTime}
          className="w-9 shrink-0 text-right text-[10px] leading-6 whitespace-nowrap text-muted opacity-0 group-hover:opacity-100"
        >
          {time}
        </time>
      ) : (
        <UserMenu userId={message.authorId} onMention={onMention}>
          {(props) =>
            props ? (
              <button type="button" {...props} aria-label={`${name}: options`} className="mt-0.5 self-start rounded-full">
                <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} />
              </button>
            ) : (
              <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} className="mt-0.5" />
            )
          }
        </UserMenu>
      )}

      <div className="min-w-0 flex-1">
        {message.pinned && !message.deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-warning">
            <Pin aria-hidden className="size-3 fill-current" />
            Pinned{message.pinned.by && users[message.pinned.by] && <> by {users[message.pinned.by].name}</>}
          </p>
        )}
        {saved && !message.deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-accent-bright">
            <Bookmark aria-hidden className="size-3 fill-current" />
            Saved for later
          </p>
        )}
        {forwarded && !message.deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted">
            <Forward aria-hidden className="size-3" />
            Forwarded from {authorName(users[forwarded.authorId], forwarded.authorId)}
          </p>
        )}
        {replyTo && !message.deleted && (
          <Reply
            original={replyTo.original}
            author={replyTo.original ? users[replyTo.original.authorId] : undefined}
            onJump={replyTo.onJump}
          />
        )}
        {compact ? (
          <span className="sr-only">{name}</span>
        ) : (
          <header className="flex items-baseline gap-2">
            <UserMenu userId={message.authorId} onMention={onMention}>
              {(props) =>
                props ? (
                  <button type="button" {...props} className="truncate font-semibold hover:underline">
                    {name}
                  </button>
                ) : (
                  <span className="truncate font-semibold">{name}</span>
                )
              }
            </UserMenu>
            {author?.role === "bot" && <Badge>Bot</Badge>}
            {author?.role === "admin" && <Badge>Admin</Badge>}
            <time dateTime={dateTime} className="shrink-0 text-xs text-muted" title={formatDateTime(message.createdAt)}>
              {time}
            </time>
          </header>
        )}

        {message.deleted ? (
          <p className="flex items-center gap-1.5 text-sm text-muted italic">
            <Ban aria-hidden className="size-3.5" />
            {message.deletedBy ? "Removed by a moderator" : "Message deleted"}
          </p>
        ) : editing ? (
          <EditBox
            initial={message.text}
            onCancel={() => onEditingChange(false)}
            onSave={async (text) => {
              const error = await onEdit(message.id, text);
              if (!error) onEditingChange(false);
              return error;
            }}
          />
        ) : (
          (message.text || leading.length > 0) && (
            <div className={cn("min-w-0 wrap-break-word", message.status === "sending" && "opacity-60")}>
              {leading.length > 0 && (
                <p className="leading-6">
                  {leading.map((mention, index) => (
                    <Mention
                      key={`${mention.userId}-${index}`}
                      attachment={mention}
                      user={users[mention.userId]}
                      isSelf={mention.userId === selfId}
                    />
                  ))}
                </p>
              )}
              {message.text && (
                <MarkdownText text={message.text} mentions={named} users={users} selfId={selfId} emoji={emoji} />
              )}
              {message.editedAt && (
                <span
                  className="text-[11px] text-muted"
                  title={`Edited ${formatDateTime(message.editedAt)}`}
                >
                  (edited)
                </span>
              )}
            </div>
          )
        )}

        {!message.deleted && body.length > 0 && (
          <div className={cn("mt-1.5 flex flex-wrap items-start gap-2", message.status === "sending" && "opacity-60")}>
            {body.map(({ attachment, index }) => (
              <Attachment
                key={index}
                attachment={attachment}
                onManageEvent={attachment.type === "event" && canManageEvents ? () => setManaging(index) : undefined}
                rsvp={
                  attachment.type === "event" && confirmed && onRsvp
                    ? { selfId, users, onRsvp: (going) => onRsvp(message.id, index, going) }
                    : undefined
                }
                poll={
                  attachment.type === "poll" && confirmed
                    ? {
                        votes: message.pollVotes?.[index],
                        selfId,
                        users,
                        onVote: (option) => onVote(message.id, index, option),
                      }
                    : undefined
                }
                quiz={
                  attachment.type === "quiz" && confirmed && onAnswerQuiz
                    ? {
                        answer: message.quizAnswers?.[index],
                        onAnswer: (option) => onAnswerQuiz(message.id, index, option),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {!message.deleted && message.reactions && (
          <Reactions
            reactions={message.reactions}
            users={users}
            selfId={selfId}
            custom={emoji}
            onToggle={(emoji) => void run(onReact(message.id, emoji))}
          />
        )}

        {message.thread && onOpenThread && (
          <ThreadLink thread={message.thread} users={users} onOpen={() => onOpenThread(message)} />
        )}

        {actionError && (
          <p role="alert" className="mt-0.5 text-xs text-danger">
            {actionError}
          </p>
        )}

        {message.status === "failed" && (
          <p className="flex items-center gap-2 text-xs text-danger">
            {message.error ?? "Couldn't send this message."}
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCw aria-hidden className="size-3" />
              Retry
            </button>
          </p>
        )}
      </div>

      {confirmed && !message.deleted && !editing && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={cn(
            "absolute -top-3 right-4 z-10 flex rounded-lg border border-border bg-surface p-0.5 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
            picking ? "opacity-100" : "opacity-0",
          )}
        >
          <ToolbarButton label="Add reaction" onClick={() => setPicking((open) => !open)} expanded={picking}>
            <SmilePlus className="size-4" />
          </ToolbarButton>
          {onReply && (
            <ToolbarButton label={`Reply to ${name}`} onClick={() => onReply(message)}>
              <CornerUpLeft className="size-4" />
            </ToolbarButton>
          )}
          {onOpenThread && (
            <ToolbarButton label="Reply in thread" onClick={() => onOpenThread(message)}>
              <MessagesSquare className="size-4" />
            </ToolbarButton>
          )}
          {onForward && (
            <ToolbarButton label="Forward message" onClick={() => setForwarding(true)}>
              <Forward className="size-4" />
            </ToolbarButton>
          )}
          {onPin && (
            <ToolbarButton
              label={message.pinned ? "Unpin message" : "Pin message"}
              onClick={() => void run(onPin(message.id, !message.pinned))}
            >
              {message.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </ToolbarButton>
          )}
          {onSave && (
            <ToolbarButton
              label="Save for later"
              title={saved ? "Saved (click to remove)" : "Save for later"}
              pressed={saved}
              onClick={() => void run(onSave(message.id, !saved))}
            >
              {saved ? <BookmarkCheck className="size-4 text-accent-bright" /> : <Bookmark className="size-4" />}
            </ToolbarButton>
          )}
          {onMarkUnread && (
            <ToolbarButton label="Mark unread from here" onClick={() => void run(onMarkUnread(message.id))}>
              <MessageSquareDot className="size-4" />
            </ToolbarButton>
          )}
          {(mine || canDelete || (onReport && !mine)) && <span aria-hidden className="mx-0.5 my-1 w-px bg-border" />}
          {onReport && !mine && (
            <ToolbarButton label={`Report ${name}'s message`} title="Report to moderators" onClick={() => setReporting(true)}>
              <Flag className="size-4" />
            </ToolbarButton>
          )}
          {mine && (
            <ToolbarButton label="Edit message" onClick={() => onEditingChange(true)}>
              <Pencil className="size-4" />
            </ToolbarButton>
          )}
          {canDelete && (
            <ToolbarButton
              label={mine ? "Delete message" : `Remove ${name}'s message`}
              title={mine ? "Delete (Shift+click to skip confirmation)" : "Remove as a moderator (Shift+click to skip confirmation)"}
              danger
              onClick={(event) => onDelete(message, event.shiftKey)}
            >
              <Trash className="size-4" />
            </ToolbarButton>
          )}
          {picking && (
            <EmojiPicker
              onPick={(picked) => void run(onReact(message.id, picked))}
              onClose={() => setPicking(false)}
              custom={emoji}
              className="absolute top-full right-0 mt-1"
            />
          )}
        </div>
      )}
      {onForward && forwarding && (
        <ForwardDialog
          preview={summarize(message)}
          onForward={(subgroupId) => onForward(message.id, subgroupId)}
          onClose={() => setForwarding(false)}
        />
      )}
      {onReport && reporting && (
        <ReportDialog
          authorName={name}
          onSubmit={(reason) => onReport(message.id, reason)}
          onClose={() => setReporting(false)}
        />
      )}
      {onEditEvent && managing !== null && managed?.type === "event" && (
        <EventManager
          event={managed}
          onSave={(event) => onEditEvent(message.id, managing, event)}
          onClose={() => setManaging(null)}
        />
      )}
    </article>
  );
}

/** Flag a message for the group's moderators, with an optional reason. */
function ReportDialog({
  authorName,
  onSubmit,
  onClose,
}: {
  authorName: string;
  /** Resolves to an error message. */
  onSubmit: (reason?: string) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const id = useId();

  async function submit() {
    setBusy(true);
    setError(undefined);
    const failure = await onSubmit(reason.trim() || undefined);
    setBusy(false);
    if (failure) setError(failure);
    else setSent(true);
  }

  return (
    <Dialog open title={sent ? "Report sent" : `Report ${authorName}'s message`} onClose={onClose}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm">
            Thanks. The group&apos;s moderators will review it. {authorName} isn&apos;t told who reported them.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
          <p className="text-sm text-muted">
            The group&apos;s moderators see the message as it is now, even if it&apos;s edited or deleted later.
          </p>
          <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              What&apos;s wrong with it? <span className="font-normal text-muted">(optional)</span>
            </label>
            <TextArea
              id={id}
              autoFocus
              rows={3}
              maxLength={MAX_REPORT_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Spam, harassment, off-topic…"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-9 rounded-lg bg-danger-strong px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Report"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Edit an event, or cancel or restore it. */
function EventManager({
  event,
  onSave,
  onClose,
}: {
  event: EventAttachment;
  /** Resolves to an error message. */
  onSave: (event: EventAttachment) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save(next: EventAttachment) {
    const failure = await onSave(next);
    if (!failure) onClose();
    return failure;
  }

  async function toggleCancelled() {
    setBusy(true);
    const { cancelled, ...rest } = event;
    setError(await save(cancelled ? rest : { ...rest, cancelled: true }));
    setBusy(false);
  }

  return (
    <Dialog open title="Manage event" onClose={onClose}>
      <EventForm
        initial={event}
        submitLabel="Save changes"
        // Editing keeps a cancelled event cancelled.
        onSubmit={(next) => save(event.cancelled ? { ...next, cancelled: true } : next)}
        onCancel={onClose}
      />
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 text-xs text-muted">
          {event.cancelled
            ? "This event is cancelled. Restoring it brings back its reminders and Discover listing."
            : "Cancelling keeps the event in the chat, marked as cancelled, and stops its reminders."}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleCancelled()}
          className={cn(
            "h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50",
            event.cancelled ? "bg-surface-2 hover:bg-surface-2/70" : "bg-danger/15 text-danger hover:bg-danger/25",
          )}
        >
          {event.cancelled ? "Restore event" : "Cancel event"}
        </button>
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const SYSTEM_ICONS: Record<SystemEvent["type"], LucideIcon> = {
  member_join: UserPlus,
  member_leave: UserMinus,
  message_pin: Pin,
  channel_create: Hash,
  channel_rename: Pencil,
  channel_topic: Info,
  member_kick: UserX,
  member_ban: Ban,
  member_role: ShieldCheck,
};

/** A system message: one quiet line, "Ana pinned a message · 2:14 PM". */
function SystemLine({
  message,
  event,
  name,
  nameOf,
  onDelete,
  onJump,
}: {
  message: MessageType;
  event: SystemEvent;
  name: string;
  /** Names the member a kick or ban is about. */
  nameOf: (memberId: string) => string;
  /** Moderators only. `skipConfirm` when shift-clicked. */
  onDelete?: (skipConfirm: boolean) => void;
  onJump?: (messageId: string) => void;
}) {
  const Icon = SYSTEM_ICONS[event.type];
  return (
    <div
      id={`message-${message.id}`}
      tabIndex={-1}
      role="note"
      className="group relative flex scroll-mt-4 items-center gap-3 px-4 py-1 text-sm text-muted outline-none"
    >
      <span className="flex w-9 shrink-0 justify-center">
        <Icon
          aria-hidden
          className={cn(
            "size-4",
            event.type === "member_join" && "text-online",
            (event.type === "member_kick" || event.type === "member_ban") && "text-danger",
            event.type === "member_role" && "text-accent-bright",
          )}
        />
      </span>
      <p className="min-w-0 flex-1 wrap-break-word">
        <span className="font-medium text-foreground">{name}</span> {systemText(event, nameOf)}
        {event.type === "message_pin" && onJump && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => onJump(event.messageId)}
              className="font-medium text-accent-bright hover:underline"
            >
              See message
            </button>
          </>
        )}
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          title={formatDateTime(message.createdAt)}
          className="ml-2 text-xs"
        >
          {formatTime(message.createdAt)}
        </time>
      </p>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => onDelete(e.shiftKey)}
          aria-label="Remove this notice"
          title="Remove this notice (Shift+click to skip confirmation)"
          className="rounded-md p-1 text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger pointer-coarse:opacity-100"
        >
          <Trash className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-accent/15 px-1 text-[10px] font-semibold tracking-wide text-accent-bright uppercase">
      {children}
    </span>
  );
}

/** "[avatars] 3 replies  Last reply 5m ago  >" under a thread root. */
function ThreadLink({
  thread,
  users,
  onOpen,
}: {
  thread: ThreadSummary;
  users: Record<string, User>;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/thread mt-1 -ml-1 flex max-w-full items-center gap-2 rounded-lg border border-transparent py-1 pr-2 pl-1 text-xs transition-colors hover:border-border hover:bg-surface"
    >
      <span className="flex -space-x-1.5">
        {thread.participants.map((id) => {
          const user = users[id];
          return (
            <Avatar
              key={id}
              name={authorName(user, id)}
              color={user?.color ?? "#6b7280"}
              src={user?.avatarUrl}
              size="xs"
              className="size-5 rounded-md ring-2 ring-background"
            />
          );
        })}
      </span>
      <span className="font-semibold text-accent-bright group-hover/thread:underline">
        {thread.count} {thread.count === 1 ? "reply" : "replies"}
      </span>
      <time dateTime={new Date(thread.lastAt).toISOString()} className="truncate text-muted">
        Last reply {formatRelative(thread.lastAt)}
      </time>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted opacity-0 group-hover/thread:opacity-100" />
    </button>
  );
}

function ToolbarButton({
  label,
  title,
  danger,
  expanded,
  pressed,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  danger?: boolean;
  expanded?: boolean;
  /** A toggle that's on (e.g. saved). */
  pressed?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={pressed}
      title={title ?? label}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Inline editor: Enter saves, Shift+Enter adds a line, Escape cancels. */
function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // Several lists (channel and thread) can each have a message in edit mode.
  const id = useId();

  async function save() {
    const trimmed = text.trim();
    if (trimmed === initial.trim()) return onCancel();
    setSaving(true);
    const failure = await onSave(trimmed);
    setSaving(false);
    setError(failure);
  }

  return (
    <div className="mt-0.5">
      <label htmlFor={id} className="sr-only">
        Edit message
      </label>
      <TextArea
        id={id}
        autoFocus
        autoResize
        maxHeight={240}
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        value={text}
        disabled={saving}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
          }
        }}
        className="text-[15px]"
      />
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>
          Escape to{" "}
          <button type="button" onClick={onCancel} className="text-accent-bright hover:underline">
            cancel
          </button>{" "}
          · Enter to{" "}
          <button type="button" onClick={() => void save()} className="text-accent-bright hover:underline">
            save
          </button>
        </span>
        {error && (
          <span role="alert" className="text-danger">
            {error}
          </span>
        )}
      </p>
    </div>
  );
}
