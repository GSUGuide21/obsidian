"use client";

// Unsent text per channel or thread, kept in this browser so switching
// channels or reloading doesn't lose it. A convenience: storage can be
// unavailable or cleared at any time, and then drafts just aren't kept.

const PREFIX = "obsidian-chat:draft:";
const MAX_DRAFT_LENGTH = 4000;

export function readDraft(key: string | undefined) {
  if (!key) return "";
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

/** Save the draft; empty text forgets it. */
export function writeDraft(key: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(PREFIX + key, text.slice(0, MAX_DRAFT_LENGTH));
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // Not saved; it still works for this visit.
  }
}
