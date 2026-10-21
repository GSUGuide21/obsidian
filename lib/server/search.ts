// Search: messages containing every word, as substrings (served by a trigram
// index on `body`), and the filters forums list their posts with.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

/** `%word%`, with LIKE's wildcards in the word matched literally. */
export function likePattern(word: string) {
  return `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** The distinct words of a search, lowercased: at most `max` of them. */
export function searchWords(query: string, max = 8) {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, max);
}

/**
 * A value in a PostgREST logic tree (or=/and=): double-quoted, so commas,
 * dots and parentheses in it are just characters, with backslashes and
 * double quotes escaped.
 */
export function quoted(value: string) {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/** Where the previous page of a forum ended: the last post's timestamp (as the database has it) and id. */
export type ForumCursor = { at: string; id: string };

/** A cursor as "forum:posts" hands it out ("<timestamp>|<id>"), or null if it isn't one. */
export function parseForumCursor(value: unknown): ForumCursor | null {
  if (typeof value !== "string") return null;
  const match = /^([\d\-:.T +]{10,40})\|([\w-]{8,64})$/.exec(value);
  return match && !Number.isNaN(Date.parse(match[1])) ? { at: match[1], id: match[2] } : null;
}

/**
 * The one `or` filter a forum page needs, as a PostgREST logic tree: every
 * word in the title or the text, and (with a cursor) only posts after it in
 * `column`'s order, newest first with ids breaking ties. A single
 * `and(...)` inside or=(...), so the conditions can't be combined any other way.
 * Undefined when there's nothing to filter by.
 */
export function forumFilter(column: "active_at" | "created_at", words: string[], cursor?: ForumCursor | null) {
  const parts = words.map((word) => {
    const pattern = quoted(likePattern(word));
    return `or(title.ilike.${pattern},body.ilike.${pattern})`;
  });
  if (cursor) {
    const at = quoted(cursor.at);
    parts.push(`or(${column}.lt.${at},and(${column}.eq.${at},id.lt.${cursor.id}))`);
  }
  return parts.length ? `and(${parts.join(",")})` : undefined;
}
