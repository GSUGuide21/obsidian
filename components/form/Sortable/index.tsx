"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SortableContext, useSortable } from "./Context";
import { SortableItem } from "./SortableItem";
import type { SortableContextType, SortableProps } from "./types";

export { SortableItem, useSortable };
export type * from "./types";

/**
 * A list to put in order, top to bottom. It's controlled: `items` is the order
 * (ids), `onChange` gets the new one, and each id needs a <Sortable.Item>.
 * Items move by their handles, with a pointer (mouse or touch) or the keyboard;
 * moves are announced to screen readers.
 */
function SortableRoot({ items, onChange, disabled = false, className, children, ...props }: SortableProps) {
  const elements = useRef(new Map<string, HTMLElement>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const instructionsId = useId();

  const context: SortableContextType = {
    items,
    move: (id, to) => {
      const from = items.indexOf(id);
      if (from < 0 || to < 0 || to >= items.length || from === to) return;
      const next = [...items];
      next.splice(from, 1);
      next.splice(to, 0, id);
      onChange(next);
    },
    register: (id, element) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    elementOf: (id) => elements.current.get(id),
    dragging,
    setDragging,
    announce: setAnnouncement,
    instructionsId,
    disabled,
  };

  return (
    <SortableContext value={context}>
      <ul {...props} className={cn("flex flex-col gap-1.5", className)}>
        {children}
      </ul>
      <p id={instructionsId} hidden>
        Up and down arrows move it one place; Home and End move it to the start or end.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </SortableContext>
  );
}

/** `<Sortable items onChange>` holds the order; each `<Sortable.Item id label>` is one entry. */
export const Sortable = Object.assign(SortableRoot, { Item: SortableItem });

export default Sortable;
