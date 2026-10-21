import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromMarkdown } from "mdast-util-from-markdown";
import { hideSpoilers, remarkSpoiler } from "../lib/chat/spoiler.ts";

type Node = { type: string; value?: string; children?: Node[] };

/** A paragraph's inline content after the plugin, as a compact string: spoilers in [[…]], bold in **…**. */
function render(markdown: string) {
  const tree = fromMarkdown(markdown) as unknown as Node;
  remarkSpoiler()(tree);
  const show = (node: Node): string => {
    const inner = node.children?.map(show).join("") ?? "";
    if (node.type === "text") return node.value ?? "";
    if (node.type === "spoiler") return `[[${inner}]]`;
    if (node.type === "strong") return `**${inner}**`;
    if (node.type === "inlineCode") return `\`${node.value}\``;
    return inner;
  };
  return show(tree);
}

describe("remarkSpoiler", () => {
  it("covers what's between the bars", () => {
    assert.equal(render("The butler ||did it||."), "The butler [[did it]].");
  });

  it("handles several in one line", () => {
    assert.equal(render("||a|| and ||b||"), "[[a]] and [[b]]");
  });

  it("keeps formatting inside a spoiler", () => {
    assert.equal(render("||the **big** twist|| ends it"), "[[the **big** twist]] ends it");
  });

  it("finds spoilers inside formatting", () => {
    assert.equal(render("**||bold secret||**"), "**[[bold secret]]**");
  });

  it("leaves code, empty bars and unclosed bars alone", () => {
    assert.equal(render("`||not a spoiler||`"), "`||not a spoiler||`");
    assert.equal(render("a |||| b"), "a |||| b");
    assert.equal(render("a || b"), "a || b");
  });
});

describe("hideSpoilers", () => {
  it("replaces spoilers in previews", () => {
    assert.equal(hideSpoilers("The butler ||did it|| again"), "The butler [spoiler] again");
    assert.equal(hideSpoilers("no secrets || here"), "no secrets || here");
  });
});
