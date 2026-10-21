import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One suggestion while typing: a person (@), an emoji (:) or a channel (#). */
export type Suggestion = {
  key: string;
  label: string;
  /** Shown before the label: an avatar, the emoji, a "#". */
  icon: ReactNode;
  /** Shown after it, quieter (e.g. an emoji's shortcode). */
  hint?: string;
  /** What replaces the typed query. */
  insert: string;
};

type SuggestionMenuProps = {
  id: string;
  /** The listbox's accessible name, e.g. "Mention someone". */
  label: string;
  items: Suggestion[];
  activeIndex: number;
  onPick: (item: Suggestion) => void;
  onHover: (index: number) => void;
};

export const mentionOptionId = (menuId: string, index: number) => `${menuId}-option-${index}`;

/** What can complete the word being typed; arrows and Enter (or Tab) pick, as in the composer. */
export default function SuggestionMenu({ id, label, items, activeIndex, onPick, onHover }: SuggestionMenuProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      className="absolute right-0 bottom-full left-0 z-20 mb-2 max-w-xs rounded-xl border border-border bg-surface p-1 shadow-xl"
    >
      {items.map((item, index) => (
        <li
          key={item.key}
          id={mentionOptionId(id, index)}
          role="option"
          aria-selected={index === activeIndex}
          // Keep focus in the textarea while picking with the mouse.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(item);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
            index === activeIndex && "bg-surface-2",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && <span className="shrink-0 text-xs text-muted">{item.hint}</span>}
        </li>
      ))}
    </ul>
  );
}
