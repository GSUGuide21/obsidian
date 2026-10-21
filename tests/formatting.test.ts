import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchEmoji, filterEmoji } from "../lib/chat/emoji.ts";
import { codeBlock, link, shortcutMark, toggleLinePrefix, toggleMark, type Edit } from "../lib/chat/formatting.ts";

/** "a [b] c": text with the selection in brackets, and back. */
function edit(marked: string): Edit {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { text: marked.replace("[", "").replace("]", ""), start, end };
}
function show({ text, start, end }: Edit) {
  return `${text.slice(0, start)}[${text.slice(start, end)}]${text.slice(end)}`;
}

describe("toggleMark", () => {
  it("wraps the selection", () => {
    assert.equal(show(toggleMark(edit("say [hello] there"), "bold")), "say **[hello]** there");
  });

  it("puts marks in with the caret between them when nothing's selected", () => {
    assert.equal(show(toggleMark(edit("x []"), "code")), "x `[]`");
  });

  it("keeps spaces at the edges outside", () => {
    assert.equal(show(toggleMark(edit("say[ hello ]there"), "italic")), "say _[hello]_ there");
  });

  it("unwraps when the marks are just outside, or inside the selection", () => {
    assert.equal(show(toggleMark(edit("say **[hello]** there"), "bold")), "say [hello] there");
    assert.equal(show(toggleMark(edit("say [||secret||] there"), "spoiler")), "say [secret] there");
  });
});

describe("line formats", () => {
  it("quotes every line the selection touches, and unquotes them", () => {
    const quoted = toggleLinePrefix(edit("one\ntw[o\nth]ree"), "> ");
    assert.equal(quoted.text, "one\n> two\n> three");
    assert.equal(toggleLinePrefix(quoted, "> ").text, "one\ntwo\nthree");
  });

  it("puts code blocks on lines of their own", () => {
    assert.equal(show(codeBlock(edit("see [x = 1] here"))), "see \n```\n[x = 1]\n```\n here");
  });

  it("makes links with the url selected to type over", () => {
    assert.equal(show(link(edit("read [the docs]"))), "read [the docs]([url])");
  });
});

describe("shortcutMark", () => {
  const press = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    shortcutMark({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });

  it("knows Ctrl or ⌘ with the format's key", () => {
    assert.equal(press("b", { ctrlKey: true }), "bold");
    assert.equal(press("I", { metaKey: true }), "italic");
    assert.equal(press("X", { ctrlKey: true, shiftKey: true }), "strikethrough");
  });

  it("ignores plain keys and other combinations", () => {
    assert.equal(press("b"), undefined);
    assert.equal(press("x", { ctrlKey: true }), undefined);
    assert.equal(press("b", { ctrlKey: true, altKey: true }), undefined);
  });
});

describe("searchEmoji", () => {
  it("puts custom emoji first, then shortcodes starting with the query", () => {
    const found = searchEmoji("thu", { thumbs_party: "/e.png" });
    assert.deepEqual(found[0], { kind: "custom", name: "thumbs_party", url: "/e.png" });
    assert.deepEqual(found[1], { kind: "emoji", emoji: "👍", name: "thumbsup" });
  });

  it("finds emoji by their keywords", () => {
    assert.ok(searchEmoji("celebrate").some((s) => s.kind === "emoji" && s.emoji === "🎉"));
  });

  it("needs something to search for", () => {
    assert.deepEqual(searchEmoji(""), []);
  });

  it("filters the picker by name or keyword", () => {
    assert.ok(filterEmoji("pizza").some((e) => e.emoji === "🍕"));
    assert.ok(filterEmoji("").length > 300);
  });
});
