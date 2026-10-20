"use client";

import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "../Context";
import type { SortableItemProps } from "../types";

/**
 * One item of a <Sortable>, moved by its handle: drag it, or focus it and use
 * the up/down arrows, Home and End.
 */
export function SortableItem({ id, label, disabled: ownDisabled, className, children, ...props }: SortableItemProps) {
  const sortable = useSortable();
  const index = sortable.items.indexOf(id);
  const count = sortable.items.length;
  const disabled = sortable.disabled || ownDisabled;
  const dragging = sortable.dragging === id;

  function moveTo(to: number) {
    if (to < 0 || to >= count || to === index) return;
    sortable.move(id, to);
    sortable.announce(`${label}, position ${to + 1} of ${count}.`);
  }

  return (
    <li
      {...props}
      ref={(node) => sortable.register(id, node)}
      data-dragging={dragging || undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pr-3 pl-1 text-sm",
        dragging && "relative z-10 border-accent bg-surface shadow-lg",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        aria-describedby={sortable.instructionsId}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); // no text selection while dragging
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          sortable.setDragging(id);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          // Its place is after every other item whose middle is above the pointer.
          let to = 0;
          for (const other of sortable.items) {
            const rect = other === id ? undefined : sortable.elementOf(other)?.getBoundingClientRect();
            if (rect && event.clientY > rect.top + rect.height / 2) to++;
          }
          if (to !== index) sortable.move(id, to);
        }}
        onPointerUp={() => {
          if (!dragging) return;
          sortable.setDragging(null);
          sortable.announce(`${label}, dropped at position ${index + 1} of ${count}.`);
        }}
        onPointerCancel={() => sortable.setDragging(null)}
        onKeyDown={(event) => {
          const to =
            event.key === "ArrowUp" ? index - 1
            : event.key === "ArrowDown" ? index + 1
            : event.key === "Home" ? 0
            : event.key === "End" ? count - 1
            : null;
          if (to === null) return;
          event.preventDefault();
          moveTo(to);
        }}
        className={cn(
          "shrink-0 touch-none rounded p-1 text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40 pointer-coarse:p-2",
          !disabled && "cursor-grab hover:text-foreground active:cursor-grabbing",
        )}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

export default SortableItem;
