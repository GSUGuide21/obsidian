"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Search } from "lucide-react";
import { EMOJI_CATEGORIES, filterEmoji } from "@/lib/chat/emoji";
import { cn } from "@/lib/utils";

type ComposerEmojiPickerProps = {
  /** The group's custom emoji (name → image URL), listed first. */
  custom?: Record<string, string>;
  /** An emoji, or ":name:" for a custom one. */
  onPick: (value: string) => void;
  onClose: () => void;
  /** Above its button (the message box, at the bottom) or below it (the wiki's toolbar, at the top). */
  placement?: "above" | "below";
};

/**
 * Emoji to put in a message: search by name, or browse by category (the
 * group's own first). Stays open so several can be added; Escape or a click
 * outside closes it.
 */
export default function ComposerEmojiPicker({ custom = {}, onPick, onClose, placement = "above" }: ComposerEmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(Object.keys(custom).length > 0 ? "custom" : EMOJI_CATEGORIES[0].id);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    searchRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element;
      // Its own button toggles it; let that click do the closing.
      if (!rootRef.current?.contains(target) && !target.closest?.("[data-emoji-toggle]")) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const customs = Object.entries(custom).filter(([name]) => !needle || name.includes(needle));
  const standard = needle ? filterEmoji(needle) : (EMOJI_CATEGORIES.find((c) => c.id === category)?.emoji ?? []);
  const showCustom = needle ? customs.length > 0 : category === "custom";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Add an emoji"
      className={cn(
        "absolute left-0 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-surface shadow-xl",
        placement === "above" ? "bottom-full mb-2" : "top-full mt-1",
      )}
    >
      <div className="relative border-b border-border p-2">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search emoji"
          placeholder="Search emoji"
          className="h-8 w-full rounded-lg bg-surface-2 pr-2 pl-8 text-sm outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </div>

      {!needle && (
        <div role="tablist" aria-label="Emoji categories" className="flex gap-0.5 border-b border-border px-1.5 py-1">
          {Object.keys(custom).length > 0 && (
            <CategoryTab label="This group's emoji" selected={category === "custom"} onSelect={() => setCategory("custom")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded emoji */}
              <img src={Object.values(custom)[0]} alt="" className="size-4" />
            </CategoryTab>
          )}
          {EMOJI_CATEGORIES.map((c) => (
            <CategoryTab key={c.id} label={c.label} selected={category === c.id} onSelect={() => setCategory(c.id)}>
              {c.emoji[0].emoji}
            </CategoryTab>
          ))}
        </div>
      )}

      <div className="h-56 overflow-y-auto p-1.5">
        {showCustom && (
          <>
            {needle && <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">This group</p>}
            <div className="grid grid-cols-8 gap-0.5">
              {customs.map(([name, src]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onPick(`:${name}:`)}
                  aria-label={`:${name}:`}
                  title={`:${name}:`}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded emoji */}
                  <img src={src} alt="" className="size-6" />
                </button>
              ))}
            </div>
          </>
        )}
        {(needle || category !== "custom") && (
          <>
            {needle && customs.length > 0 && standard.length > 0 && (
              <p className="px-1 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Emoji</p>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {standard.map((e) => (
                <button
                  key={e.emoji}
                  type="button"
                  onClick={() => onPick(e.emoji)}
                  aria-label={e.name.replace(/_/g, " ")}
                  title={`:${e.name}:`}
                  className="flex size-8 items-center justify-center rounded-md text-xl hover:bg-surface-2"
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          </>
        )}
        {needle && customs.length === 0 && standard.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No emoji match “{query.trim()}”.</p>
        )}
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-lg transition-colors",
        selected ? "bg-surface-2" : "opacity-60 hover:bg-surface-2 hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}
