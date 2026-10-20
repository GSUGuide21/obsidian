"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { customEmojiName, type Reaction, type User } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** Quick-pick set; any single emoji is accepted by the server. */
export const EMOJI_CHOICES: [emoji: string, label: string][] = [
  ["👍", "thumbs up"], ["❤️", "heart"], ["😂", "laughing"], ["🎉", "party"],
  ["😮", "surprised"], ["😢", "sad"], ["🔥", "fire"], ["👀", "eyes"],
  ["🙏", "thank you"], ["✅", "check"], ["👏", "clap"], ["🚀", "rocket"],
  ["💯", "hundred"], ["🤔", "thinking"], ["😍", "heart eyes"], ["😅", "sweat smile"],
  ["👎", "thumbs down"], ["🙌", "raised hands"], ["✨", "sparkles"], ["💡", "idea"],
  ["😎", "cool"], ["🥳", "celebrate"], ["😬", "grimace"], ["🫡", "salute"],
];

type EmojiPickerProps = {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** The group's custom emoji (name → image URL), offered first as ":name:". */
  custom?: Record<string, string>;
  className?: string;
};

/** A reaction: an emoji, or a group's custom emoji (":name:") as its image. */
export function ReactionEmoji({ emoji, custom, className }: { emoji: string; custom?: Record<string, string>; className?: string }) {
  const name = customEmojiName(emoji);
  const src = name ? custom?.[name] : undefined;
  if (name) {
    // A custom emoji since removed from the group shows by name.
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element -- uploaded emoji
      <img src={src} alt={emoji} className={cn("inline size-4", className)} />
    ) : (
      <span className="text-[11px]">{emoji}</span>
    );
  }
  return <>{emoji}</>;
}

export function EmojiPicker({ onPick, onClose, custom, className }: EmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Callers pass inline functions; an Effect Event keeps this effect from
  // re-running (and stealing focus) on every render.
  const close = useEffectEvent(onClose);

  useEffect(() => {
    rootRef.current?.querySelector("button")?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Add a reaction"
      className={cn("z-30 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-xl", className)}
    >
      {Object.entries(custom ?? {}).map(([name, src]) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            onPick(`:${name}:`);
            onClose();
          }}
          aria-label={`React with :${name}:`}
          title={`:${name}:`}
          className="flex size-7 items-center justify-center rounded-md hover:bg-surface-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded emoji */}
          <img src={src} alt="" className="size-5" />
        </button>
      ))}
      {EMOJI_CHOICES.map(([emoji, label]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onPick(emoji);
            onClose();
          }}
          aria-label={`React with ${label}`}
          title={label}
          className="flex size-7 items-center justify-center rounded-md text-lg hover:bg-surface-2"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

type ReactionsProps = {
  reactions: Reaction[];
  users: Record<string, User>;
  selfId: string;
  onToggle: (emoji: string) => void;
  /** The group's custom emoji (name → image URL). */
  custom?: Record<string, string>;
};

/** Reaction chips under a message: count, highlighted if you reacted, click to toggle. */
export default function Reactions({ reactions, users, selfId, onToggle, custom }: ReactionsProps) {
  const [picking, setPicking] = useState(false);
  if (reactions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map(({ emoji, userIds }) => {
        const mine = userIds.includes(selfId);
        const names = userIds.map((id) => (id === selfId ? "You" : (users[id]?.name ?? "Someone")));
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            aria-pressed={mine}
            aria-label={`${emoji} ${userIds.length}: ${names.join(", ")}. ${mine ? "Remove your reaction" : "React"}`}
            title={names.join(", ")}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
              mine ? "border-accent bg-accent/15 text-foreground" : "border-border bg-surface hover:border-muted",
            )}
          >
            <span className="text-sm leading-none">
              <ReactionEmoji emoji={emoji} custom={custom} />
            </span>
            <span className="font-medium tabular-nums">{userIds.length}</span>
          </button>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPicking((open) => !open)}
          aria-label="Add reaction"
          aria-expanded={picking}
          className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-1.5 text-muted hover:border-muted hover:text-foreground"
        >
          <SmilePlus className="size-3.5" />
        </button>
        {picking && (
          <EmojiPicker
            onPick={onToggle}
            onClose={() => setPicking(false)}
            custom={custom}
            className="absolute bottom-full left-0 mb-1"
          />
        )}
      </div>
    </div>
  );
}
