// Attachment URLs come from other users, so only http(s) and same-origin
// paths are ever rendered as links or media sources (never `javascript:`).
export function safeUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function fileName(value?: string) {
  if (!value) return "File";
  try {
    const last = new URL(value, window.location.origin).pathname.split("/").pop();
    return (last && decodeURIComponent(last)) || "File";
  } catch {
    return "File";
  }
}

/**
 * A link that opens a message for anyone who can see it: its channel, and
 * its thread when it's a reply (the same "?open=" link push notifications use).
 */
export function messageLink(origin: string, message: { id: string; subgroupId: string; threadId?: string }) {
  const url = new URL("/", origin);
  url.searchParams.set("open", message.subgroupId);
  url.searchParams.set("message", message.id);
  if (message.threadId) url.searchParams.set("thread", message.threadId);
  return url.href;
}
