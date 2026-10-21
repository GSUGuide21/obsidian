"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, MessagesSquare, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import { useChatContext } from "@/components/chat/Core/ChatContext";
import { authorName, formatPreviewTime } from "@/lib/chat/format";
import { safeUrl } from "@/lib/chat/url";
import {
  COLLECTION_TYPES,
  type Attachment as AttachmentType,
  type CollectionKind,
  type Group,
  type Message,
  type User,
} from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import type { MessageActions } from "../Chat";
import Attachment from "../Chat/Message/Attachment";
import Picture from "../Chat/Message/Attachment/Image";

const TABS: { kind: CollectionKind; label: string; empty: string }[] = [
  { kind: "events", label: "Events", empty: "No events in this group yet." },
  { kind: "polls", label: "Polls", empty: "No polls in this group yet." },
  { kind: "quizzes", label: "Quizzes", empty: "No quizzes in this group yet." },
  { kind: "media", label: "Gallery", empty: "No photos or videos in this group yet." },
  { kind: "files", label: "Files", empty: "No files in this group yet." },
  { kind: "voice", label: "Voice", empty: "No voice messages in this group yet." },
];

type BrowseProps = {
  group: Group;
  /** The channel being shown, so its messages can be jumped to in place. */
  activeId: string;
  users: Record<string, User>;
  actions: MessageActions;
  /** Go to a message: its thread, or its place in its channel. */
  onOpen: (message: Message) => void;
  onClose: () => void;
};

/** Side panel listing a group's events, polls, quizzes and media, across its channels. */
export default function Browse({ group, activeId, users, actions, onOpen, onClose }: BrowseProps) {
  const { state, loadCollection } = useChatContext();
  const { selfId } = state;
  const connected = state.status === "ready";
  /** The group's loaded list of a kind; absent until fetched. */
  const collection = (kind: CollectionKind) => state.collections[`${group.id}/${kind}`];
  const onLoad = (kind: CollectionKind) => loadCollection(group.id, kind);
  const channelName = (id: string) => group.subgroups.find((s) => s.id === id)?.name ?? "deleted-channel";
  const openLabel = (message: Message) =>
    message.threadId
      ? "Open its thread"
      : message.subgroupId === activeId
        ? "Jump to message"
        : `Go to #${channelName(message.subgroupId)}`;
  const [kind, setKind] = useState<CollectionKind>("events");
  const load = useEffectEvent(onLoad);
  // Load each tab when shown, and again after reconnecting (things may have changed).
  useEffect(() => {
    if (connected) load(kind);
  }, [kind, connected]);

  const tab = TABS.find((t) => t.kind === kind)!;
  const list = collection(kind);
  const types = COLLECTION_TYPES[kind];
  // Deleted messages lose their attachments; drop them once a patch says so.
  const messages = list?.messages.filter((m) => !m.deleted && m.attachments?.some((a) => types.includes(a.type)));

  return (
    <aside
      aria-label="Browse channel"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-border lg:bg-surface"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <h2 className="leading-tight font-semibold">Browse</h2>
          <p className="truncate text-xs text-muted">All channels in {group.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close browse"
          title="Close"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Show"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 text-xs font-medium"
      >
        {TABS.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="tab"
            aria-selected={kind === option.kind}
            onClick={() => setKind(option.kind)}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              kind === option.kind ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab.label} className="flex-1 overflow-y-auto p-3">
        {!messages ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-2" />
            ))}
            <span className="sr-only">Loading</span>
          </div>
        ) : messages.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted">{tab.empty}</p>
        ) : kind === "media" ? (
          <Gallery messages={messages} openLabel={openLabel} onOpen={onOpen} />
        ) : (
          <ul className="space-y-4">
            {(kind === "events" ? eventOrder(messages) : messages).map((message) => (
              <li key={message.id}>
                <Source
                  message={message}
                  users={users}
                  channel={channelName(message.subgroupId)}
                  openLabel={openLabel(message)}
                  onOpen={() => onOpen(message)}
                />
                <div className="mt-1.5 space-y-2">
                  {/* Polls are addressed by their index in the full attachment list. */}
                  {message.attachments!.map((attachment, index) =>
                    types.includes(attachment.type) ? (
                      <Attachment
                        key={index}
                        attachment={attachment}
                        poll={
                          attachment.type === "poll"
                            ? {
                                votes: message.pollVotes?.[index],
                                selfId,
                                users,
                                onVote: (option, chosen) => actions.vote(message.id, index, option, chosen),
                              }
                            : undefined
                        }
                        quiz={
                          attachment.type === "quiz"
                            ? {
                                answer: message.quizAnswers?.[index],
                                onAnswer: (option) => actions.answerQuiz(message.subgroupId, message.id, index, option),
                              }
                            : undefined
                        }
                      />
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {list?.hasMore && (
          <p className="mt-4 text-center text-xs text-muted">Showing the 100 most recent.</p>
        )}
      </div>
    </aside>
  );
}

/** Upcoming events (soonest first), then past ones (most recent first). */
function eventOrder(messages: Message[]) {
  const now = Date.now();
  const start = (m: Message) =>
    Math.min(...(m.attachments ?? []).flatMap((a) => (a.type === "event" ? [a.startTime] : [])));
  const upcoming = messages.filter((m) => start(m) >= now).sort((a, b) => start(a) - start(b));
  const past = messages.filter((m) => start(m) < now).sort((a, b) => start(b) - start(a));
  return [...upcoming, ...past];
}

/** Who posted it, where and when, with a way to get to the message. */
function Source({
  message,
  users,
  channel,
  openLabel,
  onOpen,
}: {
  message: Message;
  users: Record<string, User>;
  channel: string;
  openLabel: string;
  onOpen: () => void;
}) {
  const author = users[message.authorId];
  const name = authorName(author, message.authorId);
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} color={author?.color ?? "#6b7280"} src={author?.avatarUrl} size="xs" className="size-5" />
      <span className="truncate text-xs font-semibold">{name}</span>
      <span className="shrink-0 truncate text-[11px] text-muted">#{channel}</span>
      <time dateTime={new Date(message.createdAt).toISOString()} className="shrink-0 text-[11px] text-muted">
        {formatPreviewTime(message.createdAt)}
      </time>
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        title={openLabel}
        className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
      >
        {message.threadId ? <MessagesSquare className="size-3.5" /> : <ArrowRight className="size-3.5" />}
      </button>
    </div>
  );
}

/** Photos and videos as a grid; photos open full size, videos play in place. */
function Gallery({
  messages,
  openLabel,
  onOpen,
}: {
  messages: Message[];
  openLabel: (message: Message) => string;
  onOpen: (message: Message) => void;
}) {
  const items = messages.flatMap((message) =>
    (message.attachments ?? []).flatMap((attachment, index): { message: Message; attachment: AttachmentType; key: string }[] =>
      attachment.type === "image" || attachment.type === "video"
        ? [{ message, attachment, key: `${message.id}-${index}` }]
        : [],
    ),
  );
  return (
    <ul className="grid grid-cols-3 gap-2">
      {items.map(({ message, attachment, key }) => (
        <li key={key} className="group/media relative">
          {attachment.type === "image" ? (
            <Picture attachment={{ ...attachment, thumbnail: true }} />
          ) : attachment.type === "video" && safeUrl(attachment.src) ? (
            <video
              src={safeUrl(attachment.src)}
              controls
              preload="metadata"
              playsInline
              aria-label={attachment.alt ?? attachment.caption ?? "Video"}
              className="aspect-square w-28 rounded-xl border border-border bg-black object-cover"
            />
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(message)}
            aria-label={openLabel(message)}
            title={openLabel(message)}
            className="absolute top-1 right-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover/media:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            {message.threadId ? <MessagesSquare className="size-3.5" /> : <ArrowRight className="size-3.5" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
