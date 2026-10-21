import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEditor } from "lexical";
import { $exportWikiMarkdown, $importWikiMarkdown, richEditBlocker, splitTableRow, WIKI_NODES } from "../lib/chat/wikiMarkdown.ts";

/** The Markdown after a trip through the editor. */
function roundTrip(markdown: string) {
  const editor = createEditor({ nodes: WIKI_NODES, onError: (error) => { throw error; } });
  editor.update(() => $importWikiMarkdown(markdown), { discrete: true });
  return editor.getEditorState().read(() => $exportWikiMarkdown());
}

describe("wiki Markdown in the editor", () => {
  it("keeps what the editor can show", () => {
    const page = [
      "# Title",
      "",
      "Some **bold**, *italic*, ~~struck~~ and `code`, with a [link](https://example.com).",
      "",
      "## Lists",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "- [ ] todo",
      "- [x] done",
      "",
      "> A quote",
      "",
      "---",
      "",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");
    assert.equal(roundTrip(page), page);
  });

  it("keeps tables, with formatting and pipes in their cells", () => {
    const table = [
      "Before",
      "",
      "| Name | Notes |",
      "| --- | --- |",
      "| **Ana** | Uses a \\| b |",
      "| Ben | [site](https://example.com) |",
      "",
      "After",
    ].join("\n");
    assert.equal(roundTrip(table), table);
  });

  it("pads short rows to the table's width", () => {
    assert.equal(roundTrip("| a | b |\n| --- | --- |\n| 1 |"), "| a | b |\n| --- | --- |\n| 1 |  |");
  });

  it("keeps line breaks within a paragraph", () => {
    assert.equal(roundTrip("line one\nline two"), "line one\nline two");
  });
});

describe("splitTableRow", () => {
  it("splits cells and reads escaped pipes", () => {
    assert.deepEqual(splitTableRow("| a | b \\| c |  |"), ["a", "b | c", ""]);
  });
});

describe("richEditBlocker", () => {
  it("allows pages the editor can show", () => {
    assert.equal(richEditBlocker("# Hi\n\n- a\n- b\n\n```\n<div>|a|\n|---|\n```"), undefined);
    assert.equal(richEditBlocker("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nText"), undefined);
  });

  it("names what the editor would lose", () => {
    assert.equal(richEditBlocker("| a | b |\n| :-- | --: |\n| 1 | 2 |"), "aligned table columns");
    assert.equal(richEditBlocker("| not | a table |"), "lines that look like table rows");
    assert.equal(richEditBlocker("![logo](https://x/y.png)"), "images");
    assert.equal(richEditBlocker("Text[^1]\n\n[^1]: note"), "footnotes");
    assert.equal(richEditBlocker("[docs]: https://example.com"), "reference links");
    assert.equal(richEditBlocker("Title\n====="), "underlined headings");
    assert.equal(richEditBlocker("a <b>bold</b> word"), "HTML");
  });
});

describe("wiki fonts, sizes and spoilers", () => {
  it("keep their place through the editor", () => {
    const page = [
      "A {{size=large:big}} word and a {{font=serif:serif}} one.",
      "",
      "Both: {{font=mono|size=small:tiny code-ish}}.",
      "",
      "A ||secret|| and a ||{{size=huge:loud secret}}||.",
    ].join("\n");
    assert.equal(roundTrip(page), page);
  });

  it("nest with bold and italic", () => {
    assert.equal(roundTrip("**{{size=large:bold and big}}**"), "**{{size=large:bold and big}}**");
    assert.equal(roundTrip("{{size=large:**bold and big**}}"), "**{{size=large:bold and big}}**");
    assert.equal(roundTrip("*||hidden||*"), "*||hidden||*");
  });

  it("go through tables", () => {
    // In a table, a spoiler's bars are escaped so they don't split the cell.
    const table = ["| a | b |", "| --- | --- |", "| {{size=large:big}} | \\|\\|secret\\|\\| |"].join("\n");
    assert.equal(roundTrip(table), table);
  });

  it("leave styles they don't know as text", () => {
    assert.equal(roundTrip("{{color=red:nope}}"), "{{color=red:nope}}");
    assert.equal(roundTrip("{{size=gigantic:nope}}"), "{{size=gigantic:nope}}");
  });
});
