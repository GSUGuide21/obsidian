// Spoilers: "||hidden text||" in a message is covered until someone clicks it.
// A remark plugin finds them in the parsed Markdown (so formatting inside
// works, and code is left alone); previews and notifications hide them as text.

/** The bits of mdast this needs (kept local so the plugin has no type dependencies). */
type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };

/** Properties the rendered element carries, so the Markdown renderer knows to draw a spoiler. */
export const SPOILER_PROPERTY = "data-spoiler";

const MARK = "||";

const text = (value: string): Node => ({ type: "text", value });

function spoiler(children: Node[]): Node {
  return {
    type: "spoiler",
    children,
    data: { hName: "span", hProperties: { [SPOILER_PROPERTY]: "" } },
  };
}

/** Wrap "||…||" runs among a parent's children (and its descendants') in spoiler nodes. */
function wrap(parent: Node) {
  const children = parent.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== "text") {
      // Inline and fenced code show exactly what was typed.
      if (child.type !== "inlineCode" && child.type !== "code") wrap(child);
      continue;
    }
    const value = child.value ?? "";
    const open = value.indexOf(MARK);
    if (open < 0) continue;

    // Closed in the same text node.
    const close = value.indexOf(MARK, open + MARK.length);
    if (close > open + MARK.length) {
      const replaced = [text(value.slice(0, open)), spoiler([text(value.slice(open + MARK.length, close))])];
      const rest = value.slice(close + MARK.length);
      children.splice(i, 1, ...replaced.filter((n) => n.type !== "text" || n.value), text(rest));
      // Carry on from the rest of this text (which may hold another spoiler).
      i += replaced[0].value ? 1 : 0;
      continue;
    }
    if (close === open + MARK.length) continue; // "||||": nothing to hide

    // Closed in a later text sibling, with formatting (bold, links…) between.
    const end = children.findIndex((n, j) => j > i && n.type === "text" && (n.value ?? "").includes(MARK));
    if (end < 0) continue;
    const last = children[end].value ?? "";
    const at = last.indexOf(MARK);
    const inner = [text(value.slice(open + MARK.length)), ...children.slice(i + 1, end), text(last.slice(0, at))].filter(
      (n) => n.type !== "text" || n.value,
    );
    const before = text(value.slice(0, open));
    children.splice(i, end - i + 1, ...[before, spoiler(inner)].filter((n) => n.type !== "text" || n.value), text(last.slice(at + MARK.length)));
    i += before.value ? 1 : 0;
  }
  parent.children = children.filter((n) => n.type !== "text" || n.value);
}

/** The remark plugin: add it to remarkPlugins. */
export function remarkSpoiler() {
  return (tree: Node) => wrap(tree);
}

/** Text with its spoilers hidden, for previews, notifications and anything else shown before someone chooses to look. */
export function hideSpoilers(value: string) {
  return value.replace(/\|\|(?!\|)([\s\S]+?)\|\|/g, "[spoiler]");
}
