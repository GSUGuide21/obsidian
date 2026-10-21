import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { forumFilter, likePattern, parseForumCursor, quoted, searchWords } from "../lib/server/search.ts";

/**
 * A logic tree as PostgREST reads one (or=(…), and(…)): operators wrap
 * comma-separated items in parentheses; an item is a nested tree or
 * column.operator.value, and a double-quoted value is taken whole, with
 * backslash escapes. Returns the conditions it finds, with their values unquoted.
 */
type Tree = { op: string; items: (Tree | { column: string; operator: string; value: string })[] };

function parseTree(text: string): Tree {
  let at = 0;
  const expect = (char: string) => {
    if (text[at] !== char) throw new Error(`expected ${char} at ${at} in ${text}`);
    at++;
  };
  const tree = (): Tree => {
    const op = /^(and|or)/.exec(text.slice(at))?.[1];
    if (!op) throw new Error(`expected and/or at ${at}`);
    at += op.length;
    expect("(");
    const items: Tree["items"] = [];
    for (;;) {
      items.push(/^(and|or)\(/.test(text.slice(at)) ? tree() : condition());
      if (text[at] === ",") at++;
      else break;
    }
    expect(")");
    return { op, items };
  };
  const condition = () => {
    const head = /^([\w]+)\.([\w]+)\./.exec(text.slice(at));
    if (!head) throw new Error(`expected column.operator. at ${at} in ${text}`);
    at += head[0].length;
    let value = "";
    if (text[at] === '"') {
      at++;
      while (text[at] !== '"') {
        if (at >= text.length) throw new Error("unterminated quote");
        if (text[at] === "\\") at++;
        value += text[at++];
      }
      at++;
    } else {
      while (at < text.length && !",()".includes(text[at])) value += text[at++];
    }
    return { column: head[1], operator: head[2], value };
  };
  const result = tree();
  if (at !== text.length) throw new Error(`trailing text at ${at} in ${text}`);
  return result;
}

describe("quoted", () => {
  it("escapes backslashes and double quotes", () => {
    assert.equal(quoted('a"b\\c'), '"a\\"b\\\\c"');
  });
});

describe("searchWords", () => {
  it("lowercases, splits on whitespace and drops repeats", () => {
    assert.deepEqual(searchWords("  Bug  bug report "), ["bug", "report"]);
    assert.equal(searchWords("a b c d e f g h i j").length, 8);
  });
});

describe("parseForumCursor", () => {
  it("reads what forum:posts hands out", () => {
    assert.deepEqual(parseForumCursor("2026-10-20T12:34:56.123456+00:00|post-12345678"), {
      at: "2026-10-20T12:34:56.123456+00:00",
      id: "post-12345678",
    });
  });

  it("refuses anything else", () => {
    assert.equal(parseForumCursor("not a cursor"), null);
    assert.equal(parseForumCursor("2026-10-20T12:34:56Z|id),or(id.gt.0"), null);
    assert.equal(parseForumCursor(42), null);
  });
});

describe("forumFilter", () => {
  it("is nothing without words or a cursor", () => {
    assert.equal(forumFilter("active_at", []), undefined);
  });

  it("needs every word, in the title or the text", () => {
    const tree = parseTree(forumFilter("active_at", ["bug", "report"])!);
    assert.equal(tree.op, "and");
    assert.equal(tree.items.length, 2);
    for (const [i, word] of ["bug", "report"].entries()) {
      assert.deepEqual(tree.items[i], {
        op: "or",
        items: [
          { column: "title", operator: "ilike", value: `%${word}%` },
          { column: "body", operator: "ilike", value: `%${word}%` },
        ],
      });
    }
  });

  it("keeps words with PostgREST's reserved characters whole", () => {
    for (const word of ["a,b", "f(x)", 'say"hi"', "back\\slash", "v1.2:3", "100%_done"]) {
      const tree = parseTree(forumFilter("created_at", [word])!);
      const [title, body] = (tree.items[0] as Tree).items;
      assert.deepEqual(title, { column: "title", operator: "ilike", value: likePattern(word) });
      assert.deepEqual(body, { column: "body", operator: "ilike", value: likePattern(word) });
    }
  });

  it("pages past the cursor in the chosen order, ids breaking ties", () => {
    const at = "2026-10-20T12:34:56.123456+00:00";
    const tree = parseTree(forumFilter("active_at", ["x"], { at, id: "post-12345678" })!);
    assert.deepEqual(tree.items[1], {
      op: "or",
      items: [
        { column: "active_at", operator: "lt", value: at },
        {
          op: "and",
          items: [
            { column: "active_at", operator: "eq", value: at },
            { column: "id", operator: "lt", value: "post-12345678" },
          ],
        },
      ],
    });
  });

  it("goes out as a single or= parameter", () => {
    // Offline: the query builder only makes the URL; nothing is sent.
    const client = createClient("http://localhost:54321", "test-key", { auth: { persistSession: false } });
    const filter = forumFilter("active_at", ["a,b", "c"], { at: "2026-10-20T12:34:56+00:00", id: "post-12345678" })!;
    const query = client.from("messages").select("*").eq("channel_id", "forum").or(filter);
    const params = (query as unknown as { url: URL }).url.searchParams;
    assert.deepEqual(params.getAll("or"), [`(${filter})`]);
    assert.doesNotThrow(() => parseTree(params.get("or")!.slice(1, -1)));
  });
});
