import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryOrder,
  hasCategory,
  mainChannel,
  moveCategory,
  moveChannel,
  moveGroup,
  sections,
  stepCategory,
  stepChannel,
  visualOrder,
} from "../lib/chat/order.ts";
import type { Group, Subgroup } from "../lib/chat/types/groups.ts";

const channel = (id: string, extra: Partial<Subgroup> = {}): Subgroup => ({
  id,
  groupId: "g",
  name: id,
  type: "text",
  ...extra,
});

const group = (subgroups: Subgroup[]): Group => ({ id: "g", name: "G", color: "#000000", type: "text", subgroups });

describe("sidebar order", () => {
  const list = [channel("a", { category: "Voice" }), channel("b"), channel("c", { category: "Voice" }), channel("d")];

  it("puts uncategorized channels first, then categories by first appearance", () => {
    const { loose, categories } = sections(list);
    assert.deepEqual(loose.map((s) => s.id), ["b", "d"]);
    assert.deepEqual(categories.map(([name, items]) => [name, items.map((s) => s.id)]), [["Voice", ["a", "c"]]]);
    assert.deepEqual(visualOrder(list).map((s) => s.id), ["b", "d", "a", "c"]);
  });

  it("opens a group at its first uncategorized text channel", () => {
    assert.equal(mainChannel(group(list))?.id, "b");
    assert.equal(mainChannel(group([channel("v", { type: "voice" }), channel("t", { category: "X" })]))?.id, "t");
    assert.equal(mainChannel(group([channel("v", { type: "voice" })]))?.id, "v");
    assert.equal(mainChannel(group([])), undefined);
  });
});

describe("moving channels", () => {
  const groups = [group([channel("a"), channel("b"), channel("c", { category: "X" })])];

  it("places a channel before another, listing the whole group", () => {
    assert.deepEqual(moveChannel(groups, "b", "g", undefined, "a"), { id: "b", groupId: "g", order: ["b", "a", "c"] });
  });

  it("moves into a category at its end", () => {
    assert.deepEqual(moveChannel(groups, "a", "g", "X", null), { id: "a", groupId: "g", category: "X", order: ["b", "c", "a"] });
  });

  it("steps within a section and stops at its edges", () => {
    assert.deepEqual(stepChannel(groups, groups[0].subgroups[1], -1)?.order, ["b", "a", "c"]);
    assert.equal(stepChannel(groups, groups[0].subgroups[0], -1), null);
    assert.equal(stepChannel(groups, groups[0].subgroups[2], 1), null);
  });

  it("returns null for a group that doesn't exist", () => {
    assert.equal(moveChannel(groups, "a", "missing", undefined, null), null);
  });
});

describe("moving groups", () => {
  it("moves a group before another, or to the end", () => {
    const list = [{ id: "x" }, { id: "y" }, { id: "z" }] as Group[];
    assert.deepEqual(moveGroup(list, "z", "x"), ["z", "x", "y"]);
    assert.deepEqual(moveGroup(list, "x", null), ["y", "z", "x"]);
  });
});

describe("categories", () => {
  const withCategories = (subgroups: Subgroup[], categories: string[]): Group => ({ ...group(subgroups), categories });
  const list = [channel("a", { category: "Games" }), channel("b"), channel("c", { category: "Work" }), channel("d", { category: "Games" })];

  it("follows the stored order, empty ones included, then unlisted ones in use", () => {
    const g = withCategories(list, ["Empty", "Work"]);
    assert.deepEqual(categoryOrder(g), ["Empty", "Work", "Games"]);
    assert.deepEqual(sections(g.subgroups, g.categories).categories.find(([name]) => name === "Empty"), ["Empty", []]);
    assert.deepEqual(visualOrder(g.subgroups, g.categories).map((s) => s.id), ["b", "c", "a", "d"]);
  });

  it("matches names regardless of case", () => {
    assert.ok(hasCategory(withCategories(list, []), "games"));
    assert.ok(!hasCategory(withCategories(list, []), "Music"));
  });

  it("moves a category with its channels", () => {
    const move = moveCategory(withCategories(list, []), "Work", "Games");
    assert.deepEqual(move, { categories: ["Work", "Games"], order: ["b", "c", "a", "d"] });
    assert.equal(moveCategory(withCategories(list, []), "Nope", null), null);
  });

  it("steps up and down, and not past either end", () => {
    const g = withCategories(list, ["Games", "Work", "Empty"]);
    assert.deepEqual(stepCategory(g, "Games", 1)?.categories, ["Work", "Games", "Empty"]);
    assert.deepEqual(stepCategory(g, "Empty", -1)?.categories, ["Games", "Empty", "Work"]);
    assert.equal(stepCategory(g, "Games", -1), null);
    assert.equal(stepCategory(g, "Empty", 1), null);
  });

  it("drops a channel at the end of an empty category", () => {
    const g = withCategories(list, ["Empty"]);
    const move = moveChannel([g], "b", "g", "Empty", null);
    assert.equal(move?.category, "Empty");
    assert.equal(move?.order.at(-1), "b");
  });
});
