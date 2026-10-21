// The quick switcher's matching (Ctrl+K): how well each chat or person matches what was typed.

/** Something to jump to, by its name and anything else it's known by (e.g. its group's name). */
export type Searchable = { label: string; keywords?: string[] };

function normalize(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Every character of `query`, in order, somewhere in `text` ("gnrl" in "general"). */
function isSubsequence(query: string, text: string) {
  let at = 0;
  for (const char of text) if (char === query[at]) at++;
  return at === query.length;
}

/**
 * How well `text` matches `query` (0: not at all): the whole name, then its
 * start, the start of one of its words, anywhere in it, and last its letters
 * in order. Case and accents don't count, and a leading "#" or "@" is ignored.
 */
export function matchScore(text: string, query: string) {
  const q = normalize(query).replace(/^[#@]+/, "");
  if (!q) return 1;
  const t = normalize(text).replace(/^[#@]+/, "");
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s_\-.,]+/).some((word) => word.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return isSubsequence(q.replace(/\s+/g, ""), t) ? 10 : 0;
}

/**
 * The items matching `query`, best first (ties keep their order), at most
 * `limit`. A match on a keyword counts for less than one on the name.
 */
export function rank<T extends Searchable>(items: readonly T[], query: string, limit = 50): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: Math.max(matchScore(item.label, query), ...(item.keywords ?? []).map((k) => matchScore(k, query) / 2)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
