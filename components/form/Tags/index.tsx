"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import { inputVariants } from "../Input/variants";
import type { TagsProps } from "./types";

export type * from "./types";

/** A chip with a remove button (none while `onRemove` is absent). */
export function Tag({ children, label, onRemove }: { children: ReactNode; label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface py-0.5 pr-1 pl-2 text-xs font-medium ring-1 ring-border">
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-foreground pointer-coarse:p-1"
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Free-form tags: type one and press Enter or a comma to add it; Backspace in
 * the empty box removes the last. Pasting a comma-separated list adds each.
 * Controlled with `value`, or uncontrolled with `defaultValue`.
 */
export function Tags({
  value,
  defaultValue,
  onChange,
  name,
  placeholder,
  disabled = false,
  max,
  maxLength,
  normalize = (tag) => tag,
  allowDuplicates = false,
  id,
  className,
  ...aria
}: TagsProps) {
  const [tags, setTags] = useControllable(value, defaultValue ?? [], onChange);
  const [draft, setDraft] = useState("");
  const full = max !== undefined && tags.length >= max;

  /** Add what's typed (several, for a pasted list); returns whether all of it fit. */
  function add(text: string) {
    const next = [...tags];
    for (const part of text.split(",")) {
      const tag = normalize(part.trim().replace(/\s+/g, " ")).slice(0, maxLength);
      if (!tag || (!allowDuplicates && next.includes(tag))) continue;
      if (max !== undefined && next.length >= max) return false;
      next.push(tag);
    }
    if (next.length !== tags.length) setTags(next);
    return true;
  }

  function remove(index: number) {
    setTags(tags.filter((_, i) => i !== index));
  }

  return (
    <div
      className={cn(
        inputVariants({ size: "auto", frame: true }),
        "flex min-h-10 cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5",
        className,
      )}
      onPointerDown={(event) => {
        // Clicking the box (not a chip's button) puts the cursor in the text box.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          event.currentTarget.querySelector("input")?.focus();
        }
      }}
    >
      {tags.map((tag, index) => (
        <Tag key={`${tag}-${index}`} label={tag} onRemove={disabled ? undefined : () => remove(index)}>
          {tag}
        </Tag>
      ))}
      <input
        {...aria}
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={full ? `At most ${max}` : tags.length === 0 ? placeholder : undefined}
        maxLength={maxLength}
        enterKeyHint="enter"
        autoComplete="off"
        onChange={(event) => {
          const text = event.target.value;
          // A typed comma (or a pasted list) adds what's before it.
          if (text.includes(",")) {
            const last = text.lastIndexOf(",");
            if (add(text.slice(0, last))) setDraft(text.slice(last + 1).trimStart());
            return;
          }
          setDraft(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && draft.trim()) {
            event.preventDefault();
            if (add(draft)) setDraft("");
          } else if (event.key === "Backspace" && !draft && tags.length > 0) {
            event.preventDefault();
            remove(tags.length - 1);
          }
        }}
        onBlur={() => {
          if (draft.trim() && add(draft)) setDraft("");
        }}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted"
      />
      {name && tags.map((tag, index) => <input key={`${tag}-${index}`} type="hidden" name={name} value={tag} />)}
    </div>
  );
}

export default Tags;
