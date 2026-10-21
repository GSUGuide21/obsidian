import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSearchTerms, parseSearch, resolveAuthors, resolveChannel } from "../lib/chat/searchQuery.ts";
import type { Subgroup, User } from "../lib/chat/types";

const user = (id: string, name: string) => ({ id, name }) as User;
const channel = (id: string, name: string) => ({ id, name, groupId: "g", type: "text" }) as Subgroup;

describe("parseSearch", () => {
  it("separates filters from the words", () => {
    const parsed = parseSearch("launch from:ada has:image in:#general plans");
    assert.equal(parsed.text, "launch plans");
    assert.deepEqual(parsed.from, ["ada"]);
    assert.deepEqual(parsed.has, ["image"]);
    assert.equal(parsed.in, "general");
    assert.deepEqual(parsed.invalid, []);
  });

  it("reads quoted names and phrases", () => {
    const parsed = parseSearch('from:"Ada Lovelace" "big news"');
    assert.deepEqual(parsed.from, ["ada lovelace"]);
    assert.equal(parsed.text, "big news");
  });

  it("reads days as local midnights", () => {
    const parsed = parseSearch("before:2026-10-20 after:2026-10-01");
    assert.equal(parsed.until, new Date(2026, 9, 20).getTime());
    // After the 1st: from the start of the 2nd.
    assert.equal(parsed.since, new Date(2026, 9, 2).getTime());
    const on = parseSearch("on:2026-02-28");
    assert.equal(on.since, new Date(2026, 1, 28).getTime());
    assert.equal(on.until, new Date(2026, 2, 1).getTime());
  });

  it("flags filters it can't read, and keeps lookalikes as text", () => {
    const parsed = parseSearch("has:gifs before:2026-02-31 https://example.com note:this");
    assert.deepEqual(parsed.has, []);
    assert.deepEqual(parsed.invalid, ["has:gifs", "before:2026-02-31"]);
    assert.equal(parsed.text, "https://example.com note:this");
  });

  it("knows a few synonyms", () => {
    assert.deepEqual(parseSearch("has:photo has:links").has, ["image", "link"]);
  });
});

describe("hasSearchTerms", () => {
  it("needs enough text, or any filter", () => {
    assert.equal(hasSearchTerms(parseSearch("a"), 2), false);
    assert.equal(hasSearchTerms(parseSearch("ab"), 2), true);
    assert.equal(hasSearchTerms(parseSearch("has:poll"), 2), true);
  });
});

describe("resolveAuthors", () => {
  const users = { a: user("a", "Ada Lovelace"), b: user("b", "Adam"), c: user("c", "Grace") };

  it("prefers exact names, then names starting with it", () => {
    assert.deepEqual(resolveAuthors(["adam"], users, "c").ids, ["b"]);
    assert.deepEqual(resolveAuthors(["ad"], users, "c").ids.sort(), ["a", "b"]);
  });

  it("knows you as me, and says who it couldn't find", () => {
    assert.deepEqual(resolveAuthors(["me", "zed"], users, "c"), { ids: ["c"], unknown: ["zed"] });
  });
});

describe("resolveChannel", () => {
  it("finds a channel among the groups searched", () => {
    const groups = [{ subgroups: [channel("1", "general"), channel("2", "Game Night")] }];
    assert.equal(resolveChannel("game night", groups)?.id, "2");
    assert.equal(resolveChannel("gen", groups)?.id, "1");
    assert.equal(resolveChannel("random", groups), undefined);
  });
});
