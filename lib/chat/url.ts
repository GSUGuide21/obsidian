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
