"use client";

import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { VolumeOff, X } from "lucide-react";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { serverCommands } from "@/lib/chat/commands";
import { authorName, formatDateTime, isSameDay } from "@/lib/chat/format";
import { DEFAULT_BOT_ID } from "@/lib/commands";
import type { Attachment, Message as MessageType, Subgroup, User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { continuesRun, DayDivider, useUntil, type MessageActions } from "../Chat";
import Composer from "../Chat/Composer";
import DeleteDialog from "../Chat/DeleteDialog";
import Message from "../Chat/Message";

type ThreadProps = {
  subgroup: Subgroup;
  rootId: string;
  /** `undefined` while loading, `null` if the root no longer exists. */
  root: MessageType | null | undefined;
  users: Record<string, User>;
  actions: MessageActions;
  signedIn: boolean;
  /** Can pin and unpin the root: moderators and up (anyone in a direct message). */
  canPin: boolean;
  groupName: string;
  /** Where the thread is, under its title; "#channel" unless given (e.g. a direct message's name). */
  place?: string;
  /** When you're muted in this group: you can't reply until then (ms). */
  mutedUntil?: number;
  onClose: () => void;
  className?: string;
};

/** Side panel with a message and the replies in its thread. */
export default function Thread({
  subgroup,
  rootId,
  root,
  users,
  actions,
  signedIn,
  canPin,
  groupName,
  place,
  mutedUntil,
  onClose,
  className,
}: ThreadProps) {
  const { state, loadThread, send, retry: onRetry, previewLink } = useChatContext();
  const { selfId } = state;
  const connected = state.status === "ready";
  // `undefined` until loaded.
  const replies = state.threads[rootId];
  const hasMore = state.threadHasMore[rootId] ?? false;
  const onLoad = () => loadThread(rootId);
  const onSend = (text: string, attachments: Attachment[], options?: { preview?: boolean }) =>
    send(subgroup.id, text, attachments, rootId, options);
  const group = state.groups.find((g) => g.id === subgroup.groupId);
  const defaultBot = users[DEFAULT_BOT_ID]?.name;
  const commands = useMemo(() => serverCommands(group, defaultBot), [group, defaultBot]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MessageType | null>(null);
  const load = useEffectEvent(onLoad);
  const muted = useUntil(mutedUntil);

  // Load when opened, and reload after reconnecting (replies may have been missed).
  useEffect(() => {
    if (connected) load();
  }, [rootId, connected]);

  // Follow new replies while at the bottom, and always for your own.
  const last = replies?.at(-1);
  const rootLoaded = root !== undefined;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && (nearBottomRef.current || last?.authorId === selfId)) el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.authorId, selfId, rootLoaded]);

  const rootName = root ? authorName(users[root.authorId], root.authorId) : "";
  const count = replies?.filter((m) => !m.status && !m.deleted).length ?? root?.thread?.count ?? 0;

  function editLast() {
    const mine = replies?.findLast((m) => m.authorId === selfId && !m.status && !m.deleted);
    if (!mine) return false;
    setEditingId(mine.id);
    return true;
  }

  const onDelete = (target: MessageType, skipConfirm: boolean) => {
    if (skipConfirm) void actions.remove(target.id);
    else setDeleting(target);
  };

  return (
    <aside
      aria-label="Thread"
      className={cn(
        "fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-border lg:bg-surface",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <h2 className="leading-tight font-semibold">Thread</h2>
          <p className="truncate text-xs text-muted">{place ?? `#${subgroup.name}`}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          title="Close thread"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        role="log"
        aria-label={rootName ? `Thread on ${rootName}'s message` : "Thread"}
        className="flex-1 overflow-y-auto pb-2"
      >
        {root === undefined ? (
          <div className="space-y-2 p-4" aria-busy>
            <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
            <span className="sr-only">Loading thread</span>
          </div>
        ) : root === null ? (
          <p className="p-4 text-sm text-muted">This message no longer exists.</p>
        ) : (
          <>
            <div className="pt-2">
              <Message
                message={root}
                users={users}
                selfId={selfId}
                compact={false}
                editing={editingId === root.id}
                onEditingChange={(on) => setEditingId(on ? root.id : null)}
                onRetry={onRetry}
                onEdit={actions.edit}
                canDelete={root.authorId === selfId || actions.canRemove(root.authorId)}
                onDelete={onDelete}
                onReact={actions.react}
                onVote={actions.vote}
                onEditEvent={actions.editEvent}
                onPin={canPin ? actions.pin : undefined}
                onReport={actions.report}
                onRsvp={actions.rsvp}
                onForward={actions.forward}
                onAnswerQuiz={(id, quiz, option) => actions.answerQuiz(subgroup.id, id, quiz, option)}
                saved={actions.isSaved(root.id)}
                onSave={actions.save}
                emoji={actions.emoji}
                blocked={actions.isBlocked(root.authorId)}
              />
            </div>
            <div role="separator" className="my-3 flex items-center gap-3 px-4 text-xs font-medium text-muted">
              {count > 0 ? `${count} ${count === 1 ? "reply" : "replies"}` : "No replies yet"}
              <span className="h-px flex-1 bg-border" />
            </div>
            {hasMore && (
              <p className="px-4 pb-2 text-xs text-muted">Showing the most recent replies.</p>
            )}
            {replies?.map((message, index) => {
              const prev = replies[index - 1];
              const newDay = prev ? !isSameDay(prev.createdAt, message.createdAt) : !isSameDay(root.createdAt, message.createdAt);
              return (
                <Fragment key={message.id}>
                  {newDay && <DayDivider at={message.createdAt} />}
                  <Message
                    message={message}
                    users={users}
                    selfId={selfId}
                    compact={continuesRun(prev, message)}
                    editing={editingId === message.id}
                    onEditingChange={(on) => setEditingId(on ? message.id : null)}
                    onRetry={onRetry}
                    onEdit={actions.edit}
                    canDelete={message.authorId === selfId || actions.canRemove(message.authorId)}
                    onDelete={onDelete}
                    onReact={actions.react}
                    onVote={actions.vote}
                    onEditEvent={actions.editEvent}
                    onReport={actions.report}
                    onRsvp={actions.rsvp}
                    onForward={actions.forward}
                    onAnswerQuiz={(id, quiz, option) => actions.answerQuiz(subgroup.id, id, quiz, option)}
                    saved={actions.isSaved(message.id)}
                    onSave={actions.save}
                    emoji={actions.emoji}
                    blocked={actions.isBlocked(message.authorId)}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      {root && muted && (
        <div className="shrink-0 px-4 pb-4">
          <p className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            <VolumeOff aria-hidden className="size-4 shrink-0" />
            <span>
              You&apos;re muted in {groupName} until{" "}
              <span className="font-medium text-foreground">{formatDateTime(mutedUntil!)}</span>.
            </span>
          </p>
        </div>
      )}
      {root && !muted && (
        <div className="shrink-0 px-4 pb-4">
          <Composer
            key={rootId}
            label={rootName ? `Reply to ${rootName}…` : "Reply in thread…"}
            users={users}
            selfId={selfId}
            canUpload={signedIn}
            draftKey={`thread:${rootId}`}
            gifs={state.gifs}
            onSend={onSend}
            onEditLast={editLast}
            commands={commands}
            onPreviewLink={previewLink}
          />
        </div>
      )}

      <DeleteDialog message={deleting} selfId={selfId} onClose={() => setDeleting(null)} onDelete={actions.remove} />
    </aside>
  );
}
