"use client";

// Message links and clicked push notifications open the app at
// "/?open=CHANNEL&message=ID&thread=ROOT" (see messageLink). Like invites, the
// target is taken out of the address bar right away and kept for this tab, so
// it survives signing in (which leaves the page) and opens once the chat is connected.

const KEY = "obsidian-chat:open";
const ID = /^[\w-]{1,128}$/;

export type OpenTarget = { subgroupId: string; messageId?: string; threadId?: string };

/** Move a message link's target from the URL into this tab's storage. */
export function captureOpenLink() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const subgroupId = url.searchParams.get("open");
  if (subgroupId === null) return;
  const messageId = url.searchParams.get("message");
  const threadId = url.searchParams.get("thread");
  for (const key of ["open", "message", "thread"]) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url);
  if (![subgroupId, messageId ?? "x", threadId ?? "x"].every((id) => ID.test(id))) return;
  const target: OpenTarget = { subgroupId, ...(messageId && { messageId }), ...(threadId && { threadId }) };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(target));
  } catch {
    // Storage blocked: the link just opens the app.
  }
}

/** The link waiting to be opened, if any; taking it forgets it. */
export function takeOpenLink(): OpenTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const target = raw ? (JSON.parse(raw) as Partial<OpenTarget>) : null;
    return typeof target?.subgroupId === "string" ? (target as OpenTarget) : null;
  } catch {
    return null;
  }
}
