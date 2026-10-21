"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Clock, CornerUpLeft, Hash, Mic, SendHorizontal, Smile, Type, X } from "lucide-react";
import Avatar from "@/components/chat/GroupList/Group/Avatar";
import Dialog from "@/components/Dialog";
import TextArea from "@/components/form/TextArea";
import { summarize } from "@/lib/chat/format";
import { createId } from "@/lib/chat/id";
import { runCommand, suggestCommands, type Command } from "@/lib/chat/commands";
import type { LinkableChannel } from "@/lib/chat/channelLinks";
import { readDraft, writeDraft } from "@/lib/chat/drafts";
import { searchEmoji } from "@/lib/chat/emoji";
import { shortcutMark, toggleMark, type Edit } from "@/lib/chat/formatting";
import { usePersistentSet } from "@/lib/chat/prefs";
import { externalAttachments } from "@/lib/chat/links";
import {
  INLINE_UPLOAD_TYPES,
  MAX_MESSAGE_LENGTH,
  isOnline,
  type Attachment,
  type GifResult,
  type LinkPreview,
  type Message,
  type Sticker,
  type User,
} from "@/lib/chat/types";
import { previewTarget } from "@/lib/chat/unfurl";
import { attachmentFor, uploadFile } from "@/lib/chat/upload";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { cn } from "@/lib/utils";
import LinkCard from "../Message/Attachment/Link";
import AttachMenu, { AttachButtons, type AttachChoice } from "./AttachMenu";
import EventForm from "./EventForm";
import GifPicker from "./GifPicker";
import ComposerEmojiPicker from "./EmojiPicker";
import FormatBar from "./FormatBar";
import SuggestionMenu, { mentionOptionId, type Suggestion } from "./MentionMenu";
import OptionsForm from "./OptionsForm";
import ScheduleForm from "./ScheduleForm";
import StickerPicker from "./StickerPicker";
import Tray, { type Draft } from "./Tray";
import VoiceRecorder from "./VoiceRecorder";

// Together with one reply, a few mentions and auto-detected video links,
// this stays under the server's attachment limit.
const MAX_DRAFTS = 10;
const MAX_MENTIONS = 5;
/** Show the remaining-characters count once this close to the limit. */
const COUNT_FROM = MAX_MESSAGE_LENGTH - 200;

type SuggestKind = "mention" | "emoji" | "channel";

/** The word before the caret that opens suggestions: "@name", ":shortcode" (two letters at least, so "10:30" doesn't) and "#channel". */
const SUGGEST_TRIGGERS: { kind: SuggestKind; pattern: RegExp }[] = [
  { kind: "mention", pattern: /(?:^|\s)@([^\s@]{0,32})$/ },
  { kind: "emoji", pattern: /(?:^|\s):([a-z0-9_+-]{2,32})$/i },
  { kind: "channel", pattern: /(?:^|\s)#([^\s#]{0,32})$/ },
];

const SUGGEST_LABELS: Record<SuggestKind, string> = {
  mention: "Mention someone",
  emoji: "Emoji",
  channel: "Link a channel",
};

export type ComposerHandle = {
  addFiles: (files: File[]) => void;
  /** Put "@name " at the cursor (it becomes a mention when sent) and focus the box. */
  mention: (name: string) => void;
};

type ComposerProps = {
  ref?: Ref<ComposerHandle>;
  /** Accessible name and placeholder, e.g. "Message #general". */
  label: string;
  users: Record<string, User>;
  selfId: string;
  replyTo?: { message: Message; authorName: string };
  /** Guests can't upload (files, voice notes); everything else still works. */
  canUpload: boolean;
  /** Shown on the left of the line above the input (e.g. who's typing). */
  status?: ReactNode;
  /** Shown on the right of that line (e.g. "Slow mode: 30 seconds"). */
  hint?: ReactNode;
  /** Where unsent text is kept between visits (a channel or thread id); not kept without it. */
  draftKey?: string;
  onCancelReply?: () => void;
  /** `preview: false`: the link's card was removed while writing; the message gets none. */
  onSend: (text: string, attachments: Attachment[], options?: { preview?: boolean }) => void;
  /** The card a link would get, shown under the box while writing (see useChat's previewLink). */
  onPreviewLink?: (url: string) => Promise<LinkPreview | null | undefined>;
  onTyping?: (typing: boolean) => void;
  /** Arrow Up in an empty composer: edit your last message. Returns whether there was one. */
  onEditLast?: () => boolean;
  /** GIF search is available (the GIF picker and /gif). */
  gifs?: boolean;
  /** The group's sticker pack; the sticker picker shows when it has any. */
  stickers?: Sticker[];
  /** "Send later": schedule the message instead. Resolves to an error message. */
  onSchedule?: (text: string, attachments: Attachment[], sendAt: number) => Promise<string | undefined>;
  /** Commands the server runs here (see serverCommands), suggested after the composer's own. */
  commands?: Command[];
  /** The group's custom emoji (name → image URL), for the picker and ":name:" suggestions. */
  emoji?: Record<string, string>;
  /** The group's channels you can see, for "#channel" suggestions (they become links). */
  channels?: LinkableChannel[];
  /** Why nothing can be sent yet (e.g. a forum post without its title), shown on the send button. */
  held?: string;
};

export default function Composer({
  ref,
  label,
  users,
  selfId,
  replyTo,
  canUpload,
  status,
  hint,
  draftKey,
  onCancelReply = () => {},
  onSend,
  onPreviewLink,
  onTyping = () => {},
  onEditLast,
  gifs = false,
  stickers = [],
  onSchedule,
  commands: serverCommands = [],
  held,
  emoji,
  channels = [],
}: ComposerProps) {
  const [text, setText] = useState(() => readDraft(draftKey));
  // Keep the draft as it's typed (sending empties it, which forgets it).
  useEffect(() => {
    if (draftKey) writeDraft(draftKey, text);
  }, [draftKey, text]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recording, setRecording] = useState(false);
  const [dialog, setDialog] = useState<"poll" | "quiz" | "event" | "gif" | "sticker" | "schedule" | null>(null);
  // What /gif searched for, when it opened the picker.
  const [gifQuery, setGifQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [mention, setMention] = useState<{ kind: SuggestKind; start: number; end: number; query: string } | null>(null);
  const [pickingEmoji, setPickingEmoji] = useState(false);
  // Whether the formatting buttons show, remembered in this browser.
  const [composerPrefs, toggleComposerPref] = usePersistentSet("obsidian-chat:composer");
  const formatting = composerPrefs.has("formatting");
  const [mentionIndex, setMentionIndex] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef(drafts);
  const menuId = useId();
  // The channel and a thread can each have a composer open.
  const inputId = useId();
  const replyId = replyTo?.message.id;
  const canRecord = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Cancel uploads and free previews when leaving the channel.
  useEffect(
    () => () => {
      for (const draft of draftsRef.current) {
        draft.abort?.();
        if (draft.preview) URL.revokeObjectURL(draft.preview);
      }
    },
    [],
  );

  useEffect(() => {
    if (replyId) textRef.current?.focus();
  }, [replyId]);

  // ---- Attachments --------------------------------------------------------

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function hasRoom(count = 1) {
    if (draftsRef.current.length + count <= MAX_DRAFTS) return true;
    setNotice(`You can attach up to ${MAX_DRAFTS} items per message.`);
    return false;
  }

  function startUpload(file: File, voice = false) {
    const key = createId();
    const kind: Draft["kind"] = voice ? "voice" : (INLINE_UPLOAD_TYPES[file.type.split(";")[0]] ?? "file");
    const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
    const handle = uploadFile(file, (progress) => update(key, { progress }));
    const draft: Draft = {
      key,
      kind,
      label: voice ? "Voice message" : file.name,
      progress: 0,
      preview,
      abort: handle.abort,
    };
    draftsRef.current = [...draftsRef.current, draft];
    setDrafts((prev) => [...prev, draft]);

    handle.promise
      .then((result) => attachmentFor(file, result, voice))
      .then(
        (attachment) => update(key, { attachment, progress: 1, abort: undefined }),
        (error: Error) => {
          if (error.name !== "AbortError") update(key, { error: error.message, abort: undefined });
        },
      );
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    if (!canUpload) {
      setNotice("Sign in to attach files.");
      return;
    }
    setNotice(undefined);
    const room = Math.max(0, MAX_DRAFTS - draftsRef.current.length);
    if (files.length > room) setNotice(`You can attach up to ${MAX_DRAFTS} items per message.`);
    files.slice(0, room).forEach((file) => startUpload(file));
    textRef.current?.focus();
  }

  function insertMention(name: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    // A space before it unless it starts the text or follows one.
    const before = start > 0 && !/\s$/.test(text.slice(0, start)) ? " " : "";
    const insert = `${before}@${name} `;
    setText(text.slice(0, start) + insert + text.slice(end));
    const caret = start + insert.length;
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(caret, caret);
    });
  }

  useImperativeHandle(ref, () => ({ addFiles, mention: insertMention }));

  /** A choice from the toolbar (or its "+" menu on narrow screens). */
  function pickAttachment(choice: AttachChoice) {
    setNotice(undefined);
    if (choice === "file") fileRef.current?.click();
    else {
      if (choice === "gif") setGifQuery("");
      setDialog(choice);
    }
  }

  function addAttachment(attachment: Attachment, label: string) {
    setDialog(null);
    if (!hasRoom()) return;
    const draft: Draft = { key: createId(), kind: attachment.type, label, attachment };
    draftsRef.current = [...draftsRef.current, draft];
    setDrafts((prev) => [...prev, draft]);
    textRef.current?.focus();
  }

  function remove(key: string) {
    const draft = drafts.find((d) => d.key === key);
    draft?.abort?.();
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    textRef.current?.focus();
  }

  // ---- Suggestions: @people, :emoji: and #channels -------------------------

  /** What the word before the caret could become: "@ad" a mention, ":smi" an emoji, "#gen" a channel. */
  function syncMention(el: HTMLTextAreaElement) {
    const caret = el.selectionStart;
    const before = caret === el.selectionEnd ? el.value.slice(0, caret) : null;
    const found = before === null ? null : SUGGEST_TRIGGERS.find(({ kind, pattern }) => (kind !== "channel" || channels.length > 0) && pattern.test(before));
    const match = found && before!.match(found.pattern);
    if (!found || !match) {
      if (mention) setMention(null);
      return;
    }
    const query = match[1];
    if (query !== mention?.query || found.kind !== mention?.kind) setMentionIndex(0);
    setMention({ kind: found.kind, start: caret - query.length - 1, end: caret, query });
  }

  const query = mention?.query.toLowerCase() ?? "";
  const candidates: Suggestion[] = !mention
    ? []
    : mention.kind === "mention"
      ? Object.values(users)
          .filter((u) => u.id !== selfId && u.name.toLowerCase().includes(query))
          .sort(
            (a, b) =>
              Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) ||
              Number(isOnline(b)) - Number(isOnline(a)) ||
              a.name.localeCompare(b.name),
          )
          .slice(0, 6)
          .map((user) => ({
            key: user.id,
            label: user.name,
            icon: <Avatar name={user.name} color={user.color} src={user.avatarUrl} size="sm" status={user.status} />,
            insert: `@${user.name} `,
          }))
      : mention.kind === "emoji"
        ? searchEmoji(query, emoji, 6).map((found) =>
            found.kind === "custom"
              ? {
                  key: `custom:${found.name}`,
                  label: `:${found.name}:`,
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded emoji
                  icon: <img src={found.url} alt="" className="size-5" />,
                  hint: "Custom",
                  insert: `:${found.name}: `,
                }
              : { key: found.name, label: `:${found.name}:`, icon: <span className="text-lg">{found.emoji}</span>, insert: found.emoji },
          )
        : channels
            .filter((c) => c.name.toLowerCase().includes(query))
            .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)))
            .slice(0, 6)
            .map((channel) => ({
              key: channel.id,
              label: channel.name,
              icon: <Hash aria-hidden className="size-4 text-muted" />,
              insert: `#${channel.name} `,
            }));
  const menuOpen = candidates.length > 0;
  const activeIndex = Math.min(mentionIndex, candidates.length - 1);

  function pickMention(item: Suggestion) {
    if (!mention) return;
    setText(text.slice(0, mention.start) + item.insert + text.slice(mention.end));
    setMention(null);
    const caret = mention.start + item.insert.length;
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(caret, caret);
    });
  }

  // ---- Emoji and formatting -----------------------------------------------

  /** Change the text and its selection (see lib/chat/formatting.ts), then put the cursor back. */
  function applyEdit(change: (edit: Edit) => Edit) {
    const el = textRef.current;
    const next = change({ text, start: el?.selectionStart ?? text.length, end: el?.selectionEnd ?? text.length });
    if (next.text.length > MAX_MESSAGE_LENGTH) return;
    setText(next.text);
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(next.start, next.end);
    });
  }

  /** Put an emoji (or ":custom:") in at the cursor, replacing any selection. */
  function insertEmoji(value: string) {
    applyEdit(({ text: current, start, end }) => {
      const insert = value.startsWith(":") ? `${value} ` : value;
      return { text: current.slice(0, start) + insert + current.slice(end), start: start + insert.length, end: start + insert.length };
    });
  }

  // ---- Sending ------------------------------------------------------------

  const uploading = drafts.some((d) => !d.attachment && !d.error);
  const failed = drafts.some((d) => d.error);
  const ready = drafts.flatMap((d) => (d.attachment ? [d.attachment] : []));
  const canSend = !held && !uploading && !failed && (text.trim().length > 0 || ready.length > 0);
  const sendHint = held
    ? held
    : uploading
      ? "Wait for uploads to finish"
      : failed
        ? "Remove failed uploads first"
        : "Send message";

  // ---- Slash commands -----------------------------------------------------

  // Escape hides the list for the text as it is; typing on brings it back.
  const [commandsDismissedAt, setCommandsDismissedAt] = useState<string | null>(null);
  const commands =
    menuOpen || commandsDismissedAt === text
      ? []
      : suggestCommands(text, (command) => command.name !== "gif" || gifs, serverCommands);
  const commandsOpen = commands.length > 0;
  const activeCommand = Math.min(commandIndex, commands.length - 1);

  // Keep the highlighted command in view as the arrows move through a long list.
  useEffect(() => {
    if (commandsOpen) document.getElementById(`${menuId}-command-${activeCommand}`)?.scrollIntoView({ block: "nearest" });
  }, [commandsOpen, activeCommand, menuId]);

  function pickCommand(command: Command) {
    setText(`/${command.name}${command.args ? " " : ""}`);
    setCommandIndex(0);
    requestAnimationFrame(() => textRef.current?.focus());
  }

  // ---- Link preview -------------------------------------------------------

  // The link the message's card would be for (as the server picks it), asked
  // about once typing pauses. Removing the card sends the message without one.
  const linkTarget = onPreviewLink ? previewTarget(text) : undefined;
  const settledTarget = useDebounce(linkTarget, 600);
  const [linkCard, setLinkCard] = useState<{ url: string; preview: LinkPreview | null } | null>(null);
  const [removedLink, setRemovedLink] = useState<string | null>(null);

  useEffect(() => {
    if (!settledTarget || !onPreviewLink) return;
    let active = true;
    void onPreviewLink(settledTarget).then((preview) => {
      if (active) setLinkCard({ url: settledTarget, preview: preview ?? null });
    });
    return () => {
      active = false;
    };
  }, [settledTarget, onPreviewLink]);

  const shownCard =
    linkTarget && linkCard && linkCard.url === linkTarget && removedLink !== linkTarget ? linkCard.preview : null;

  // ---- Sending ------------------------------------------------------------

  /** What goes with the text: the reply, mentions named in it, finished uploads and media embeds. */
  function attachmentsFor(body: string): Attachment[] {
    const lower = body.toLowerCase();
    const mentioned: Attachment[] = Object.values(users)
      .filter((u) => lower.includes(`@${u.name.toLowerCase()}`))
      .slice(0, MAX_MENTIONS)
      .map((u) => ({ type: "mention", userId: u.id }));
    return [
      ...(replyTo ? [{ type: "reply" as const, messageId: replyTo.message.id }] : []),
      ...mentioned,
      ...ready,
      ...externalAttachments(body),
    ];
  }

  function submit() {
    if (!canSend) return;
    // A command either becomes the text to send or opens something instead.
    const command = runCommand(text);
    if (command?.kind === "open") {
      if (command.dialog === "gif") setGifQuery(command.query ?? "");
      setDialog(command.dialog);
      setText("");
      onTyping(false);
      return;
    }
    const body = command?.kind === "send" ? command.text : text.trim();
    onSend(body, attachmentsFor(body), linkTarget && removedLink === linkTarget ? { preview: false } : undefined);
    clearSent();
  }

  /** Send a GIF from the picker right away (as a reply, if one's in progress). */
  function sendGif(gif: GifResult) {
    setDialog(null);
    if (held) return setNotice(held);
    onSend("", [
      ...(replyTo ? [{ type: "reply" as const, messageId: replyTo.message.id }] : []),
      { type: "image", src: gif.url, alt: gif.title, ...(gif.width && { width: gif.width }), ...(gif.height && { height: gif.height }) },
    ]);
    if (replyTo) onCancelReply();
    textRef.current?.focus();
  }

  /** Send a sticker from the pack right away, on its own (as a reply, if one's in progress). */
  function sendSticker(sticker: Sticker) {
    setDialog(null);
    if (held) return setNotice(held);
    onSend("", [
      ...(replyTo ? [{ type: "reply" as const, messageId: replyTo.message.id }] : []),
      { type: "sticker", name: sticker.name, url: sticker.url },
    ]);
    if (replyTo) onCancelReply();
    textRef.current?.focus();
  }

  async function schedule(sendAt: number) {
    if (!onSchedule) return undefined;
    const body = text.trim();
    const failure = await onSchedule(body, attachmentsFor(body), sendAt);
    if (failure) return failure;
    setDialog(null);
    clearSent();
    return undefined;
  }

  /** Empty the composer after sending (or scheduling). */
  function clearSent() {
    for (const draft of drafts) if (draft.preview) URL.revokeObjectURL(draft.preview);
    draftsRef.current = [];
    setDrafts([]);
    setText("");
    setMention(null);
    setNotice(undefined);
    setRemovedLink(null);
    onTyping(false);
    if (replyTo) onCancelReply();
  }

  const remaining = MAX_MESSAGE_LENGTH - text.length;

  return (
    <div className="relative">
      {notice && (
        <p role="alert" className="mb-1 px-1 text-xs text-danger">
          {notice}
        </p>
      )}
      <div className="flex h-6 items-center gap-3 px-1 text-xs text-muted">
        <div className="min-w-0 flex-1">{status}</div>
        {hint && <span className="shrink-0">{hint}</span>}
      </div>
      {pickingEmoji && (
        <ComposerEmojiPicker custom={emoji} onPick={insertEmoji} onClose={() => setPickingEmoji(false)} />
      )}
      {menuOpen && (
        <SuggestionMenu
          id={menuId}
          label={SUGGEST_LABELS[mention?.kind ?? "mention"]}
          items={candidates}
          activeIndex={activeIndex}
          onPick={pickMention}
          onHover={setMentionIndex}
        />
      )}
      {commandsOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-2 flex w-md max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <ul id={menuId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1">
            {commands.map((command, index) => {
              // A heading wherever who answers changes: the composer's own, then each bot's.
              const group = command.bot ?? "";
              const heading = index === 0 || (commands[index - 1].bot ?? "") !== group;
              return (
                <li key={`${group}/${command.name}`} role="presentation">
                  {heading && (
                    <p
                      aria-hidden
                      className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase"
                    >
                      {group || "Message"}
                    </p>
                  )}
                  <div
                    id={`${menuId}-command-${index}`}
                    role="option"
                    aria-selected={index === activeCommand}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      pickCommand(command);
                    }}
                    onPointerEnter={() => setCommandIndex(index)}
                    className={cn(
                      "flex cursor-pointer items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                      index === activeCommand && "bg-surface-2",
                    )}
                  >
                    <span className="shrink-0 font-mono font-medium text-foreground">/{command.name}</span>
                    {command.args && <span className="shrink-0 font-mono text-xs text-muted">{command.args}</span>}
                    <span className="ml-auto min-w-0 truncate text-xs text-muted" title={command.description}>
                      {command.description}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p aria-hidden className="flex gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted">
            <span>
              <Key>↑</Key> <Key>↓</Key> to choose
            </span>
            <span>
              <Key>Tab</Key> to insert
            </span>
            <span>
              <Key>Esc</Key> to close
            </span>
          </p>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-border bg-surface shadow-sm transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25"
      >
        {/* What the message goes with: the reply, its link's card, and attachments. */}
        {replyTo && (
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-2 py-1.5 pr-1 pl-2.5 text-xs text-muted">
            <CornerUpLeft aria-hidden className="size-3.5 shrink-0 text-accent-bright" />
            <span className="min-w-0 truncate">
              Replying to <span className="font-medium text-foreground">{replyTo.authorName}</span>
              {summarize(replyTo.message) && <> · {summarize(replyTo.message)}</>}
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
              className="ml-auto rounded-md p-1 hover:bg-surface hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {shownCard && (
          <div className="relative mx-2 mt-2">
            <LinkCard attachment={shownCard} compact />
            <button
              type="button"
              onClick={() => setRemovedLink(linkTarget ?? null)}
              aria-label="Remove the link preview"
              title="Send without a preview"
              className="absolute top-1.5 right-1.5 rounded-md bg-surface p-1 text-muted shadow-sm hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {drafts.length > 0 && <Tray drafts={drafts} onRemove={remove} />}

        {recording ? (
          <div className="p-2">
            <VoiceRecorder
              onDone={(file) => {
                setRecording(false);
                if (hasRoom()) startUpload(file, true);
              }}
              onCancel={() => setRecording(false)}
              onError={(message) => {
                setRecording(false);
                setNotice(message);
              }}
            />
          </div>
        ) : (
          <>
            {formatting && <FormatBar onApply={applyEdit} />}
            <label htmlFor={inputId} className="sr-only">
              {label}
            </label>
            <TextArea
              ref={textRef}
              id={inputId}
              autoResize
              maxHeight={200}
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              value={text}
              placeholder={label}
              aria-autocomplete="list"
              aria-expanded={menuOpen || commandsOpen}
              aria-controls={menuOpen || commandsOpen ? menuId : undefined}
              aria-activedescendant={
                menuOpen
                  ? mentionOptionId(menuId, activeIndex)
                  : commandsOpen
                    ? `${menuId}-command-${activeCommand}`
                    : undefined
              }
              onChange={(event) => {
                setText(event.target.value);
                onTyping(event.target.value.trim().length > 0);
                // Not only on select: replacing all the text (pasting over it) may not move the caret.
                syncMention(event.currentTarget);
              }}
              onSelect={(event) => syncMention(event.currentTarget)}
              onPaste={(event) => {
                const files = [...event.clipboardData.files];
                if (files.length > 0) {
                  event.preventDefault();
                  addFiles(files);
                }
              }}
              onKeyDown={(event) => {
                // Ctrl/⌘+B, I, E, Shift+X, Shift+H: bold, italic, code, strikethrough, spoiler.
                const mark = shortcutMark(event);
                if (mark) {
                  event.preventDefault();
                  applyEdit((edit) => toggleMark(edit, mark));
                  return;
                }
                if (menuOpen) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setMentionIndex((activeIndex + step + candidates.length) % candidates.length);
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    pickMention(candidates[activeIndex]);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMention(null);
                    return;
                  }
                }
                if (commandsOpen) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setCommandIndex((activeCommand + step + commands.length) % commands.length);
                    return;
                  }
                  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                    event.preventDefault();
                    pickCommand(commands[activeCommand]);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setCommandsDismissedAt(text);
                    return;
                  }
                }
                if (event.key === "Escape" && replyTo) {
                  event.preventDefault();
                  onCancelReply();
                  return;
                }
                if (event.key === "ArrowUp" && !text && drafts.length === 0 && onEditLast?.()) {
                  event.preventDefault();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              onBlur={() => {
                onTyping(false);
                setMention(null);
              }}
              className="min-h-11 border-0 bg-transparent px-3.5 pt-3 pb-1 text-[15px] leading-6 focus-visible:ring-0"
            />

            {/* The toolbar: what to add on the left, sending on the right. */}
            <div className="flex items-center gap-1 px-2 pb-2">
              <AttachMenu
                canUpload={canUpload}
                gifs={gifs}
                stickers={stickers.length > 0}
                onPick={pickAttachment}
                className="sm:hidden"
              />
              <AttachButtons
                canUpload={canUpload}
                gifs={gifs}
                stickers={stickers.length > 0}
                onPick={pickAttachment}
                className="hidden sm:flex"
              />
              <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <button
                type="button"
                onClick={() => setPickingEmoji((open) => !open)}
                data-emoji-toggle
                aria-label="Add an emoji"
                aria-expanded={pickingEmoji}
                title="Emoji"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2 aria-expanded:text-foreground"
              >
                <Smile className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => toggleComposerPref("formatting")}
                aria-pressed={formatting}
                aria-label="Formatting"
                title={formatting ? "Hide formatting" : "Show formatting"}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground aria-pressed:bg-surface-2 aria-pressed:text-foreground"
              >
                <Type className="size-4" />
              </button>
              {canRecord && canUpload && (
                <>
                  <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(undefined);
                      setRecording(true);
                    }}
                    aria-label="Record a voice message"
                    title="Record a voice message"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Mic className="size-4" />
                  </button>
                </>
              )}

              <div className="ml-auto flex items-center gap-3">
                {text.length >= COUNT_FROM ? (
                  <span
                    aria-live="polite"
                    className={cn("text-xs tabular-nums", remaining <= 50 ? "font-medium text-danger" : "text-muted")}
                  >
                    <span className="sr-only">Characters left: </span>
                    {remaining}
                  </span>
                ) : (
                  text.trim() && (
                    <p aria-hidden className="hidden text-[11px] text-muted md:block">
                      <Key>Enter</Key> to send · <Key>Shift</Key> + <Key>Enter</Key> for a new line
                    </p>
                  )
                )}
                {/* Send, with "send later" joined to it when there's something to send. */}
                <div className="flex">
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label={sendHint}
                    title={sendHint}
                    className={cn(
                      "flex h-8 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                      onSchedule && canSend ? "rounded-l-lg" : "rounded-lg",
                      canSend
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "cursor-not-allowed bg-surface-2 text-muted",
                    )}
                  >
                    <SendHorizontal aria-hidden className="size-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                  {onSchedule && canSend && (
                    <button
                      type="button"
                      onClick={() => setDialog("schedule")}
                      aria-label="Send later"
                      title="Send later"
                      className="flex h-8 items-center rounded-r-lg border-l border-accent-foreground/25 bg-accent px-2 text-accent-foreground transition-colors hover:bg-accent/90"
                    >
                      <Clock className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </form>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <Dialog open={dialog === "poll"} title="Create a poll" onClose={() => setDialog(null)}>
        <OptionsForm
          onSubmit={(poll) => addAttachment(poll, `Poll: ${poll.question}`)}
          onCancel={() => setDialog(null)}
        />
      </Dialog>
      <Dialog open={dialog === "quiz"} title="Create a quiz" onClose={() => setDialog(null)}>
        <OptionsForm
          quiz
          onSubmit={(quiz) => addAttachment(quiz, `Quiz: ${quiz.question}`)}
          onCancel={() => setDialog(null)}
        />
      </Dialog>
      <Dialog open={dialog === "event"} title="Create an event" onClose={() => setDialog(null)}>
        <EventForm
          onSubmit={(event) => addAttachment(event, event.title)}
          onCancel={() => setDialog(null)}
        />
      </Dialog>
      {gifs && (
        <Dialog open={dialog === "gif"} title="Send a GIF" onClose={() => setDialog(null)} size="lg">
          {dialog === "gif" && <GifPicker initialQuery={gifQuery} onPick={sendGif} />}
        </Dialog>
      )}
      {stickers.length > 0 && (
        <Dialog open={dialog === "sticker"} title="Send a sticker" onClose={() => setDialog(null)}>
          {dialog === "sticker" && <StickerPicker stickers={stickers} onPick={sendSticker} />}
        </Dialog>
      )}
      {onSchedule && (
        <Dialog open={dialog === "schedule"} title="Send later" onClose={() => setDialog(null)}>
          {dialog === "schedule" && <ScheduleForm onSubmit={schedule} onCancel={() => setDialog(null)} />}
        </Dialog>
      )}
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
