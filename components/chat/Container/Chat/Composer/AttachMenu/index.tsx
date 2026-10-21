"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChartBar, Film, ListChecks, Paperclip, Plus, Sticker } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttachChoice = "file" | "gif" | "sticker" | "poll" | "quiz" | "event";

/** `label` in the "+" menu; `action` on the toolbar's icon-only buttons. */
const ITEMS: { choice: AttachChoice; label: string; action: string; icon: typeof Paperclip }[] = [
  { choice: "file", label: "Upload a file", action: "Upload a file", icon: Paperclip },
  { choice: "gif", label: "GIF", action: "Send a GIF", icon: Film },
  { choice: "sticker", label: "Sticker", action: "Send a sticker", icon: Sticker },
  { choice: "poll", label: "Poll", action: "Create a poll", icon: ChartBar },
  { choice: "quiz", label: "Quiz", action: "Create a quiz", icon: ListChecks },
  { choice: "event", label: "Event", action: "Create an event", icon: CalendarDays },
];

const LOCKED_HINT = "Sign in to upload";

type AttachProps = {
  disabled?: boolean;
  /** Guests can't upload; the file option stays visible but disabled. */
  canUpload: boolean;
  /** GIF search is available on this server. */
  gifs?: boolean;
  /** The group has a sticker pack. */
  stickers?: boolean;
  onPick: (choice: AttachChoice) => void;
  className?: string;
};

const available = (gifs: boolean, stickers: boolean) =>
  ITEMS.filter((item) => (item.choice !== "gif" || gifs) && (item.choice !== "sticker" || stickers));

/** The toolbar's icon buttons (wide screens): one click each. */
export function AttachButtons({ disabled, canUpload, gifs = false, stickers = false, onPick, className }: AttachProps) {
  return (
    <div role="group" aria-label="Add to your message" className={cn("flex items-center gap-0.5", className)}>
      {available(gifs, stickers).map(({ choice, action, icon: Icon }) => {
        const locked = choice === "file" && !canUpload;
        return (
          <button
            key={choice}
            type="button"
            disabled={disabled || locked}
            onClick={() => onPick(choice)}
            aria-label={locked ? `${action} (${LOCKED_HINT.toLowerCase()})` : action}
            title={locked ? LOCKED_HINT : action}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/** The same choices behind one "+" button (narrow screens). */
export default function AttachMenu({ disabled, canUpload, gifs = false, stickers = false, onPick, className }: AttachProps) {
  const items = available(gifs, stickers);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Add attachment"
        title="Add attachment"
        className={cn(
          "flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
          open && "bg-surface-2 text-foreground",
        )}
      >
        <Plus className={cn("size-5 transition-transform", open && "rotate-45")} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl">
          {items.map(({ choice, label, icon: Icon }) => {
            const locked = choice === "file" && !canUpload;
            return (
              <button
                key={choice}
                type="button"
                disabled={locked}
                onClick={() => {
                  setOpen(false);
                  onPick(choice);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Icon aria-hidden className={cn("size-4 text-muted", locked && "opacity-50")} />
                <span className={cn(locked && "text-muted")}>
                  {label}
                  {locked && <span className="block text-[11px]">{LOCKED_HINT}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
