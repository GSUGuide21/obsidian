"use client";

import { useCallback, useState } from "react";

function read(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return []; // storage blocked or corrupt: start fresh
  }
}

/**
 * A set of strings remembered in this browser (e.g. collapsed sidebar
 * sections). Only for conveniences: it can be empty at any time.
 */
export function usePersistentSet(key: string) {
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(read(key)));

  const toggle = useCallback(
    (item: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // Not saved; it still works for this visit.
        }
        return next;
      });
    },
    [key],
  );

  return [set, toggle] as const;
}
