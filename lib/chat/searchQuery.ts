// Search filters typed into the search box: "from:ada has:image before:2026-10-01 launch".
// Parsed here, in the browser, so names resolve against the people and channels
// you know and dates are your local days; the server gets ids and timestamps.

import type { Group, SearchHas, Subgroup, User } from "./types";
import { SEARCH_HAS } from "./types/messages.ts";

export { SEARCH_HAS, type SearchHas };

/** The filters, with a short example each, as the search panel suggests them. */
export const SEARCH_FILTERS = [
  { key: "from", example: "from:name", description: "Sent by someone (from:me for you)" },
  { key: "in", example: "in:#channel", description: "In one channel" },
  { key: "has", example: "has:image", description: `With ${SEARCH_HAS.join(", ")}` },
  { key: "before", example: "before:2026-10-01", description: "Sent before a day" },
  { key: "after", example: "after:2026-10-01", description: "Sent after a day" },
  { key: "on", example: "on:2026-10-01", description: "Sent on a day" },
] as const;

type FilterKey = (typeof SEARCH_FILTERS)[number]["key"];

const KEYS = new Set<string>(SEARCH_FILTERS.map((f) => f.key));

export type ParsedSearch = {
  /** The words left to match in the text. */
  text: string;
  /** Names as typed after from:, lowercased. */
  from: string[];
  /** The channel name after in: (without "#"), lowercased; the last one wins. */
  in?: string;
  has: SearchHas[];
  /** Sent at or after this (ms). */
  since?: number;
  /** Sent before this (ms). */
  until?: number;
  /** Filters that couldn't be read, as typed (e.g. "has:gifs", "before:soon"). */
  invalid: string[];
};

/** Local midnight at the start of a "YYYY-MM-DD" day (the day after, with `offset` 1); undefined if it isn't one. */
function day(value: string, offset = 0) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const start = new Date(year, month, date);
  // Rejects 2026-02-31 and the like, which Date would roll over.
  if (start.getFullYear() !== year || start.getMonth() !== month || start.getDate() !== date) return undefined;
  return new Date(year, month, date + offset).getTime();
}

/** Split into words, keeping "quoted phrases" and key:"quoted values" together. */
function tokens(query: string) {
  return query.match(/[a-z]+:"[^"]*"|"[^"]*"|\S+/gi) ?? [];
}

const unquote = (value: string) => value.replace(/^"([\s\S]*)"$/, "$1").trim();

/**
 * The filters in a search and the words left. Anything that only looks like
 * a filter (an unknown key, "https://…") stays in the text.
 */
export function parseSearch(query: string): ParsedSearch {
  const parsed: ParsedSearch = { text: "", from: [], has: [], invalid: [] };
  const words: string[] = [];
  for (const token of tokens(query)) {
    const match = /^([a-z]+):([\s\S]+)$/i.exec(token);
    const key = match?.[1].toLowerCase();
    if (!match || !key || !KEYS.has(key)) {
      words.push(unquote(token));
      continue;
    }
    const value = unquote(match[2]);
    const ok = apply(parsed, key as FilterKey, value);
    if (!ok) parsed.invalid.push(token);
  }
  parsed.text = words.filter(Boolean).join(" ");
  return parsed;
}

function apply(parsed: ParsedSearch, key: FilterKey, value: string) {
  const lower = value.toLowerCase();
  switch (key) {
    case "from":
      if (!lower) return false;
      parsed.from.push(lower.replace(/^@/, ""));
      return true;
    case "in":
      if (!lower.replace(/^#/, "")) return false;
      parsed.in = lower.replace(/^#/, "");
      return true;
    case "has": {
      // A few plurals and synonyms people reach for.
      const aliases: Record<string, SearchHas> = { links: "link", images: "image", photo: "image", gif: "image", files: "file", polls: "poll", events: "event" };
      const kind = (SEARCH_HAS as readonly string[]).includes(lower) ? (lower as SearchHas) : aliases[lower];
      if (!kind) return false;
      if (!parsed.has.includes(kind)) parsed.has.push(kind);
      return true;
    }
    case "before": {
      const at = day(value);
      if (at === undefined) return false;
      parsed.until = Math.min(parsed.until ?? Infinity, at);
      return true;
    }
    case "after": {
      // After the day: from the start of the next one.
      const at = day(value, 1);
      if (at === undefined) return false;
      parsed.since = Math.max(parsed.since ?? -Infinity, at);
      return true;
    }
    case "on": {
      const start = day(value);
      const end = day(value, 1);
      if (start === undefined || end === undefined) return false;
      parsed.since = Math.max(parsed.since ?? -Infinity, start);
      parsed.until = Math.min(parsed.until ?? Infinity, end);
      return true;
    }
  }
}

/** Whether a search has anything to search by: enough text, or a filter. */
export function hasSearchTerms(parsed: ParsedSearch, minLength: number) {
  return (
    parsed.text.length >= minLength ||
    parsed.from.length > 0 ||
    parsed.in !== undefined ||
    parsed.has.length > 0 ||
    parsed.since !== undefined ||
    parsed.until !== undefined
  );
}

/** The people "from:" names: anyone whose name matches exactly, else starts with it ("me" is you). */
export function resolveAuthors(names: string[], users: Record<string, User>, selfId: string) {
  const ids = new Set<string>();
  const unknown: string[] = [];
  const all = Object.values(users);
  for (const name of names) {
    if (name === "me") {
      ids.add(selfId);
      continue;
    }
    const exact = all.filter((u) => u.name.toLowerCase() === name);
    const found = exact.length ? exact : all.filter((u) => u.name.toLowerCase().startsWith(name));
    if (found.length === 0) unknown.push(name);
    for (const user of found) ids.add(user.id);
  }
  return { ids: [...ids], unknown };
}

/** The channel "in:" names, among the groups being searched (exact name first, then one starting with it). */
export function resolveChannel(name: string, groups: Pick<Group, "subgroups">[]): Subgroup | undefined {
  const channels = groups.flatMap((g) => g.subgroups);
  return (
    channels.find((s) => s.name.toLowerCase() === name) ??
    channels.find((s) => s.name.toLowerCase().startsWith(name))
  );
}
