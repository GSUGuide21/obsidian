"use client";

import { createContext, useContext, type DragEvent } from "react";

/**
 * What's being dragged in the sidebar: one of your groups (into your own
 * order), or a channel of a group you manage (`groupId`, into the order
 * everyone sees).
 */
export type DragItem = { kind: "group"; id: string } | { kind: "channel"; id: string; groupId: string };

/** "before"/"after": the pointer's half of the target; "inside": dropped onto a header. */
export type DropPosition = "before" | "after" | "inside";

type DndState = {
  drag: DragItem | null;
  setDrag: (item: DragItem | null) => void;
  over: { key: string; position: DropPosition } | null;
  setOver: (over: { key: string; position: DropPosition } | null) => void;
  /** Whether you may rearrange the group's channels (you manage it). */
  canArrange: (groupId: string) => boolean;
};

export const SidebarDnd = createContext<DndState | null>(null);

/** Whether channels may be dropped into the group (to tell drop targets what to accept). */
export function useCanArrange(groupId: string) {
  return useContext(SidebarDnd)?.canArrange(groupId) ?? false;
}

/** Props that make an element draggable; none when rearranging isn't allowed. */
export function useDraggable(item: DragItem) {
  const dnd = useContext(SidebarDnd);
  if (!dnd || (item.kind === "channel" && !dnd.canArrange(item.groupId))) return {};
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      // Firefox only starts a drag when some data is set.
      event.dataTransfer.setData("text/plain", item.id);
      dnd.setDrag(item);
    },
    onDragEnd: () => {
      dnd.setDrag(null);
      dnd.setOver(null);
    },
  };
}

/**
 * Props for a drop target, plus where an indicator should show. `accepts`
 * decides which drags it takes; `halves` (per drag) picks before/after by
 * the pointer, otherwise the drop is "inside".
 */
export function useDropTarget(
  key: string,
  accepts: (item: DragItem) => boolean,
  onDrop: (item: DragItem, position: DropPosition) => void,
  halvesFor: (item: DragItem) => boolean = () => true,
) {
  const dnd = useContext(SidebarDnd);
  const active = Boolean(dnd?.drag && accepts(dnd.drag) && dnd.drag.id !== key);
  const position = active && dnd?.over?.key === key ? dnd.over.position : null;

  if (!dnd?.drag || !active) return { props: {}, position: null };
  const halves = halvesFor(dnd.drag);
  return {
    position,
    props: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const next: DropPosition = !halves ? "inside" : event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        if (dnd.over?.key !== key || dnd.over.position !== next) dnd.setOver({ key, position: next });
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (dnd.over?.key === key) dnd.setOver(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const item = dnd.drag;
        const at = dnd.over?.key === key ? dnd.over.position : halves ? "before" : "inside";
        dnd.setDrag(null);
        dnd.setOver(null);
        if (item) onDrop(item, at);
      },
    },
  };
}

/** The accent line or highlight showing where a drop will land. */
export function DropIndicator({ position }: { position: DropPosition | null }) {
  if (!position) return null;
  if (position === "inside") {
    return <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent ring-inset" />;
  }
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-accent ${position === "before" ? "-top-px" : "-bottom-px"}`}
    />
  );
}
