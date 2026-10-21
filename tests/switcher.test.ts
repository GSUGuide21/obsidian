import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchScore, rank } from "../lib/chat/switcher.ts";

describe("quick switcher matching", () => {
  it("prefers the whole name, then its start, a word's start, anywhere, then letters in order", () => {
    const scores = [
      matchScore("general", "general"),
      matchScore("general", "gen"),
      matchScore("game night", "night"),
      matchScore("general", "ner"),
      matchScore("general", "gnrl"),
    ];
    assert.deepEqual([...scores].sort((a, b) => b - a), scores);
    assert.ok(scores.every((score) => score > 0));
  });

  it("ignores case, accents and a leading # or @", () => {
    assert.equal(matchScore("Café", "cafe"), 100);
    assert.equal(matchScore("design", "#Design"), 100);
    assert.equal(matchScore("Ana", "@ana"), 100);
  });

  it("doesn't match what isn't there", () => {
    assert.equal(matchScore("general", "random"), 0);
    assert.equal(matchScore("general", "lareneg"), 0);
  });

  it("matches everything when nothing's typed", () => {
    assert.equal(matchScore("anything", "  "), 1);
  });
});

describe("ranking", () => {
  const items = [
    { label: "random", keywords: ["Obsidian HQ"] },
    { label: "general", keywords: ["Obsidian HQ"] },
    { label: "Design", keywords: [] },
    { label: "ui-kit", keywords: ["Design"] },
  ];

  it("puts better matches first and drops the rest", () => {
    assert.deepEqual(rank(items, "des").map((i) => i.label), ["Design", "ui-kit"]);
  });

  it("counts a keyword match for less than a name match", () => {
    assert.deepEqual(rank(items, "design").map((i) => i.label), ["Design", "ui-kit"]);
    assert.deepEqual(rank(items, "hq").map((i) => i.label), ["random", "general"]);
  });

  it("keeps the given order for ties, and stops at the limit", () => {
    assert.deepEqual(rank(items, "").map((i) => i.label), ["random", "general", "Design", "ui-kit"]);
    assert.equal(rank(items, "", 2).length, 2);
  });
});
