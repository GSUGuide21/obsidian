// Moderation and network-safety rules shared by the server and the client.
// server.mts imports this file by path under Node's type stripping, so it may
// only `import type`, and only use syntax that strips cleanly.

import type { Attachment } from "./types";

/**
 * The words people wrote inside attachments (poll and quiz questions and
 * options, event details, media captions and descriptions), for the word
 * filter. Links, files and mentions carry none of their own.
 */
export function attachmentText(attachments: readonly Attachment[]) {
  return attachments
    .flatMap((a) => {
      switch (a.type) {
        case "poll":
        case "quiz":
          return [a.question, ...a.options];
        case "event":
          return [a.title, a.description, a.location];
        case "image":
        case "video":
        case "audio":
        case "voice":
          return [a.caption, a.alt];
        default:
          return [];
      }
    })
    .filter((text): text is string => Boolean(text))
    .join("\n");
}

/** Slow mode choices, in seconds between each member's messages (0: off). */
export const SLOW_MODES = [0, 5, 10, 30, 60, 300, 900, 3600] as const;

export function isSlowMode(value: unknown): value is (typeof SLOW_MODES)[number] {
  return typeof value === "number" && (SLOW_MODES as readonly number[]).includes(value);
}

/** "30 seconds", "5 minutes", "1 hour". */
export function formatSlowMode(seconds: number) {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  if (seconds < 3600) return `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`;
  return `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`;
}

export const MAX_BLOCKED_WORDS = 100;
export const MAX_BLOCKED_WORD_LENGTH = 40;

/** Lowercased, compatibility-normalized and with runs of whitespace collapsed, so "ＢＡＤ" matches "bad". */
function normalize(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A group's blocked words from what a manager typed (one per line or comma
 * separated): normalized, deduplicated, in order. Null if there are too many
 * or one is too long.
 */
export function cleanBlockedWords(input: unknown): string[] | null {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\n,]/) : null;
  if (!raw) return null;
  const words: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const word = normalize(item);
    if (!word) continue;
    if (word.length > MAX_BLOCKED_WORD_LENGTH) return null;
    if (!words.includes(word)) words.push(word);
  }
  return words.length <= MAX_BLOCKED_WORDS ? words : null;
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The first blocked word or phrase the text contains, as a whole word (so
 * "ass" doesn't catch "class"), ignoring case; undefined if none.
 */
export function findBlockedWord(text: string, words: readonly string[]) {
  if (words.length === 0 || !text) return undefined;
  const haystack = normalize(text);
  return words.find((word) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escape(word).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "u").test(haystack),
  );
}

/**
 * Whether an IP address is somewhere a link preview must never be fetched
 * from: loopback, private and link-local networks, carrier-grade NAT, the
 * unspecified and broadcast addresses, multicast and IPv6 equivalents
 * (including IPv4-mapped ones). Anything unparseable counts as private.
 */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some((part) => Number(part) > 255)) return true;
    return (
      a === 0 || // "this" network
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast, reserved, broadcast
    );
  }

  if (!address.includes(":")) return true;
  if (address === "::" || address === "::1") return true;
  const first = parseInt(address.split(":")[0] || "0", 16);
  if (Number.isNaN(first)) return true;
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 // multicast
  );
}
