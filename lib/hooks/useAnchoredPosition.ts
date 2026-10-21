"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const GAP = 4;
/** Room kept from the window's edges. */
const MARGIN = 8;

export type Anchoring = {
  /** Which side of the anchor it prefers; it flips when the other has more room. Default "bottom". */
  side?: "bottom" | "top";
  /** Line up its left edge with the anchor's ("start", default) or its right edge ("end"). */
  align?: "start" | "end";
  /** At least as wide as the anchor, wider if its content needs (select lists), up to the window's edge. */
  matchWidth?: boolean;
  /** The tallest it gets. Default 320. */
  maxHeight?: number;
};

function place(anchor: HTMLElement, { side = "bottom", align = "start", matchWidth = false, maxHeight = 320 }: Anchoring) {
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  const enough = Math.min(maxHeight, 160);
  const up = side === "top" ? !(above < enough && below > above) : below < enough && above > below;
  const horizontal: CSSProperties = matchWidth
    ? { left: rect.left, minWidth: rect.width, maxWidth: window.innerWidth - rect.left - MARGIN }
    : align === "end"
      ? { right: Math.max(MARGIN, window.innerWidth - rect.right), maxWidth: rect.right - MARGIN }
      : { left: Math.max(MARGIN, rect.left), maxWidth: window.innerWidth - Math.max(MARGIN, rect.left) - MARGIN };
  return {
    position: "fixed",
    ...horizontal,
    maxHeight: Math.min(maxHeight, up ? above : below),
    ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
  } satisfies CSSProperties;
}

/**
 * Where a popup (a menu, a select's list) goes next to its anchor, fixed to
 * the window and following the anchor as things scroll or resize. Render it
 * into `container` (a portal): the page root, or the open dialog the anchor
 * is in. Outside its ancestors, no scrolling panel can clip it and no
 * frosted (backdrop-filter) panel can become what it's placed against.
 */
export function useAnchoredPosition(anchorRef: RefObject<HTMLElement | null>, anchoring: Anchoring = {}) {
  const [position, setPosition] = useState<{ style: CSSProperties; container: HTMLElement } | null>(null);
  const { side, align, matchWidth, maxHeight } = anchoring;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    // A modal dialog is in the top layer: anything outside it can't be clicked.
    const container = anchor.closest<HTMLElement>("dialog[open]") ?? document.body;
    const update = () => setPosition({ style: place(anchor, { side, align, matchWidth, maxHeight }), container });
    update();
    // Scrolling anything (capture) or resizing moves the anchor; so does it growing (a tags box).
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [anchorRef, side, align, matchWidth, maxHeight]);

  return position;
}
