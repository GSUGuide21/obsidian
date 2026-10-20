import { useSyncExternalStore } from "react";

export type Identity = {
  id: string;
  name: string;
  /** One of AVATAR_COLORS; the server picks one from the id when absent. */
  color?: string;
  avatarUrl?: string;
  bio?: string;
};

const STORAGE_KEY = "obsidian-chat:identity";
const listeners = new Set<() => void>();

// Kept in memory as well so the app still works when storage is blocked.
// `undefined` means "not read yet".
let current: Identity | null | undefined;

function load(): Identity | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Identity).id === "string" &&
      typeof (parsed as Identity).name === "string"
    ) {
      return parsed as Identity;
    }
  } catch {
    // Storage unavailable or corrupt: treat as signed out.
  }
  return null;
}

function getSnapshot() {
  if (current === undefined) current = load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveIdentity(identity: Identity | null) {
  current = identity;
  try {
    if (identity) localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: the in-memory copy still works for this tab.
  }
  listeners.forEach((listener) => listener());
}

/** `undefined` during server render and hydration, then the stored identity or `null`. */
export function useIdentity() {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
