"use client";

import { createContext, useContext } from "react";
import type { SortableContextType } from "./types";

export const SortableContext = createContext<SortableContextType | null>(null);

/** The list's order and moves, for its items. */
export function useSortable() {
  const context = useContext(SortableContext);
  if (!context) throw new Error("<Sortable.Item> must be rendered inside <Sortable>.");
  return context;
}
