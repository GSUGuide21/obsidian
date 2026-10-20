"use client";

import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "@/lib/hooks/useAnchoredPosition";
import { cn } from "@/lib/utils";
import { ListboxItems, type ListboxItemsProps } from "../../Listbox";

type SelectContentProps = ListboxItemsProps & {
  /** What the list opens against: the select's button or text box. */
  anchorRef: RefObject<HTMLElement | null>;
  multiple?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/**
 * A select's popup list, under (or over) its anchor and as wide as it. It's
 * drawn at the page root (see useAnchoredPosition), so nothing clips it.
 * Focus never moves into it: the select points at the active option instead.
 */
export function SelectContent({
  anchorRef,
  multiple,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  ...items
}: SelectContentProps) {
  const position = useAnchoredPosition(anchorRef, { matchWidth: true, maxHeight: 240 });
  if (!position) return null;

  return createPortal(
    <ul
      id={items.listId}
      role="listbox"
      aria-multiselectable={multiple || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      // Clicking the list (e.g. its scrollbar) mustn't take focus from the select.
      onPointerDown={(event) => event.preventDefault()}
      style={position.style}
      className={cn("z-50 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl", className)}
    >
      <ListboxItems {...items} />
    </ul>,
    position.container,
  );
}

export default SelectContent;
