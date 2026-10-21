"use client";

import { useCallback, useEffect, useState } from "react";

/** Collapsed sidebar sections: group ids, and "groupId/category" for categories. */
export const COLLAPSED_SECTIONS = "obsidian-chat:collapsed";

/** Fired on this page when a set is changed from outside its hook (see renameInPersistentSet). */
const CHANGED = "obsidian-chat:prefs";

function read(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return []; // storage blocked or corrupt: start fresh
  }
}

function write(key: string, items: Iterable<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...items]));
  } catch {
    // Not saved; it still works for this visit.
  }
}

/**
 * A set of strings remembered in this browser (e.g. collapsed sidebar
 * sections). Only for conveniences: it can be empty at any time.
 */
export function usePersistentSet(key: string) {
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(read(key)));

  // Changes made elsewhere: renameInPersistentSet on this page, or another tab.
  useEffect(() => {
    const reload = (event: Event) => {
      const changed = event instanceof StorageEvent ? event.key : (event as CustomEvent<string>).detail;
      if (changed === key) setSet(new Set(read(key)));
    };
    window.addEventListener(CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, [key]);

  const toggle = useCallback(
    (item: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        write(key, next);
        return next;
      });
    },
    [key],
  );

  return [set, toggle] as const;
}

/** Rename `from` to `to` in a remembered set, if it's there (e.g. after a category is renamed). */
export function renameInPersistentSet(key: string, from: string, to: string) {
  const items = read(key);
  if (!items.includes(from)) return;
  write(key, new Set(items.map((item) => (item === from ? to : item))));
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
}
