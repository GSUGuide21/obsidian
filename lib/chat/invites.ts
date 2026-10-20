"use client";

// An invite link opens the app at "/?invite=CODE". The code is taken out of
// the address bar right away and kept for this tab, so it survives signing in
// (which leaves the page) and is offered once the chat is connected.

const KEY = "obsidian-chat:invite";
const CODE = /^[A-Za-z0-9_-]{8,32}$/;

/** Move an invite code from the URL into this tab's storage. */
export function captureInvite() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("invite");
  if (code === null) return;
  url.searchParams.delete("invite");
  window.history.replaceState(window.history.state, "", url);
  if (!CODE.test(code)) return;
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // Storage blocked: the code is lost, as if the link was mistyped.
  }
}

/** The invite waiting to be offered, if any. */
export function pendingInvite() {
  try {
    const code = sessionStorage.getItem(KEY);
    return code && CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function clearInvite() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, then.
  }
}
