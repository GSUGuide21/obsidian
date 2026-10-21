import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shortcutFor, stepChannel, type KeyPress } from "../lib/chat/shortcuts.ts";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcutFor", () => {
  it("moves between channels with Alt and the arrows", () => {
    assert.equal(shortcutFor(press("ArrowDown", { altKey: true })), "next-channel");
    assert.equal(shortcutFor(press("ArrowUp", { altKey: true })), "previous-channel");
    assert.equal(shortcutFor(press("ArrowDown", { altKey: true, shiftKey: true })), "next-unread");
    // Even while typing: they're modified keys.
    assert.equal(shortcutFor(press("ArrowUp", { altKey: true, typing: true })), "previous-channel");
  });

  it("takes Ctrl or ⌘ for the rest", () => {
    assert.equal(shortcutFor(press("F", { ctrlKey: true, shiftKey: true })), "search");
    assert.equal(shortcutFor(press("f", { metaKey: true, shiftKey: true })), "search");
    assert.equal(shortcutFor(press(",", { ctrlKey: true })), "settings");
    assert.equal(shortcutFor(press("/", { ctrlKey: true })), "help");
    assert.equal(shortcutFor(press("Escape", { shiftKey: true })), "mark-all-read");
  });

  it("leaves plain keys to whatever you're typing in", () => {
    assert.equal(shortcutFor(press("?")), "help");
    assert.equal(shortcutFor(press("?", { typing: true })), undefined);
    assert.equal(shortcutFor(press("Escape")), "close-panel");
    assert.equal(shortcutFor(press("Escape", { typing: true })), undefined);
    assert.equal(shortcutFor(press("k", { ctrlKey: true })), undefined); // the quick switcher's
    assert.equal(shortcutFor(press("a")), undefined);
  });
});

describe("stepChannel", () => {
  const order = ["a", "b", "c", "d"];

  it("steps and wraps around", () => {
    assert.equal(stepChannel(order, "b", 1), "c");
    assert.equal(stepChannel(order, "d", 1), "a");
    assert.equal(stepChannel(order, "a", -1), "d");
    assert.equal(stepChannel(order, null, 1), "a");
  });

  it("finds the next unread one, or nowhere", () => {
    const unread = new Set(["a", "c"]);
    assert.equal(stepChannel(order, "c", 1, (id) => unread.has(id)), "a");
    assert.equal(stepChannel(order, "a", 1, () => false), undefined);
    assert.equal(stepChannel([], "a", 1), undefined);
  });
});
