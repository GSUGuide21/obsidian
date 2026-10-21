// Wiki pages are stored as Markdown and edited in a rich text editor (Lexical).
// This is the bridge: the nodes the editor uses, the Markdown it reads and
// writes, and which pages it can't edit without losing something (those are
// edited as Markdown instead).

import { $convertFromMarkdownString, $convertToMarkdownString, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, CHECK_LIST, CODE, HEADING, INLINE_CODE, isTableRowDivider, ITALIC_STAR, ITALIC_UNDERSCORE, LINK, ORDERED_LIST, QUOTE, STRIKETHROUGH, UNORDERED_LIST, type ElementTransformer, type TextMatchTransformer, type Transformer } from "@lexical/markdown";
import { $isTextNode, getStyleObjectFromCSS } from "lexical";
import { FONTS, parseStyle, SIZES, STYLED_PATTERN, wrapStyled, type Font, type Size, type TextStyle } from "./styledText.ts";
import { CodeHighlightNode, CodeNode } from "@lexical/code-core";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $createHorizontalRuleNode, $isHorizontalRuleNode, HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";

/** Every node the wiki editor can hold. */
export const WIKI_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  TableNode,
  TableRowNode,
  TableCellNode,
];

/** "---" on its own line: a horizontal rule (Lexical has no Markdown transformer for it). */
const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode();
    if (isImport || parent.getNextSibling() !== null) parent.replace(rule);
    else parent.insertBefore(rule);
    rule.selectNext();
  },
  type: "element",
};

// ---------------------------------------------------------------------------
// Fonts, sizes and spoilers: kept on text as CSS in the editor (its "style"),
// and in the page as "{{font=…|size=…:text}}" and "||text||" (see styledText.ts).
// ---------------------------------------------------------------------------

/** Marks spoiler text in the editor (globals.css draws it). */
const SPOILER_CSS = "--spoiler";

export type WikiTextStyle = TextStyle & { spoiler?: boolean };

/** What a text node's CSS says, in the page's terms (anything else in it is ignored). */
export function readTextStyle(css: string): WikiTextStyle {
  const style = getStyleObjectFromCSS(css);
  const font = (Object.keys(FONTS) as Font[]).find((f) => FONTS[f].css === style["font-family"]);
  const size = (Object.keys(SIZES) as Size[]).find((s) => SIZES[s].css === style["font-size"]);
  return { ...(font && { font }), ...(size && { size }), ...(style[SPOILER_CSS] === "1" && { spoiler: true }) };
}

/** The CSS for a style, to put on a text node. */
export function textStyleCss(style: WikiTextStyle) {
  return [
    style.font && `font-family: ${FONTS[style.font].css}`,
    style.size && `font-size: ${SIZES[style.size].css}`,
    style.spoiler && `${SPOILER_CSS}: 1`,
  ]
    .filter(Boolean)
    .join("; ");
}

/** The editor's CSS property names for each part of a style (for $patchStyleText). */
export const STYLE_PROPERTIES = { font: "font-family", size: "font-size", spoiler: SPOILER_CSS } as const;

/**
 * Styled text, both ways: written as "{{…:text}}" (inside "||…||" for a
 * spoiler, inside the bold or italic marks), read back from the same. Lexical
 * goes on parsing inside what this returns, so formats and spoilers nest either way.
 */
const STYLED: TextMatchTransformer = {
  dependencies: [],
  export: (node, _exportChildren, exportFormat) => {
    if (!$isTextNode(node) || node.hasFormat("code")) return null;
    const style = readTextStyle(node.getStyle());
    if (!style.font && !style.size && !style.spoiler) return null;
    const text = wrapStyled(node.getTextContent(), style);
    return exportFormat(node, style.spoiler ? `||${text}||` : text);
  },
  importRegExp: STYLED_PATTERN,
  regExp: new RegExp(`${STYLED_PATTERN.source}$`),
  replace: (node, match) => {
    const style = parseStyle(match[1]);
    if (!style) return;
    node.setTextContent(match[2]);
    node.setStyle(textStyleCss({ ...readTextStyle(node.getStyle()), ...style }));
    return node;
  },
  trigger: "}",
  type: "text-match",
};

/** "||text||": a spoiler (written by STYLED, read here). */
const SPOILER: TextMatchTransformer = {
  dependencies: [],
  importRegExp: /\|\|(?!\|)(.+?)\|\|/,
  regExp: /\|\|(?!\|)([^|]+)\|\|$/,
  replace: (node, match) => {
    node.setTextContent(match[1]);
    node.setStyle(textStyleCss({ ...readTextStyle(node.getStyle()), spoiler: true }));
    return node;
  },
  trigger: "|",
  type: "text-match",
};

/** What a table cell can hold: one line of inline formatting (GFM cells can't hold blocks). */
const CELL_TRANSFORMERS: Transformer[] = [
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  LINK,
  STYLED,
  SPOILER,
];

/** "| a | b |": a table row (the divider under the header row is one too). */
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;

/** A row's cells, trimmed, with "\|" read as a pipe inside a cell. */
export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (inner[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += inner[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function $tableCell(markdown: string) {
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  $convertFromMarkdownString(markdown, CELL_TRANSFORMERS, cell);
  return cell;
}

/**
 * GFM tables: a header row, the "| --- |" divider, then the body. Each line
 * is read on its own: a row joins the table just before it (or starts one),
 * and the divider makes the row above it the header. Written back with the
 * first row as the header, every row as wide as the widest.
 */
const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node) => {
    if (!$isTableNode(node)) return null;
    const rows = node
      .getChildren()
      .filter($isTableRowNode)
      .map((row) =>
        row
          .getChildren()
          .filter($isTableCellNode)
          .map((cell) => $convertToMarkdownString(CELL_TRANSFORMERS, cell).replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|")),
      );
    if (rows.length === 0) return null;
    const width = Math.max(...rows.map((cells) => cells.length));
    const line = (cells: string[]) => `| ${[...cells, ...Array(width - cells.length).fill("")].join(" | ")} |`;
    const [header, ...body] = rows;
    return [line(header), line(Array(width).fill("---")), ...body.map(line)].join("\n");
  },
  regExp: TABLE_ROW,
  replace: (parent, _children, match, isImport) => {
    // Only when reading a page: typing "| a |" in the editor stays text.
    if (!isImport) return false;
    const previous = parent.getPreviousSibling();
    if (isTableRowDivider(match[0])) {
      if (!$isTableNode(previous)) return false;
      for (const cell of previous.getFirstChild<TableRowNode>()?.getChildren() ?? []) {
        if ($isTableCellNode(cell)) cell.setHeaderStyles(TableCellHeaderStates.ROW);
      }
      parent.remove();
      return;
    }
    const row = $createTableRowNode();
    for (const cell of splitTableRow(match[0])) row.append($tableCell(cell));
    if ($isTableNode(previous)) {
      previous.append(row);
      parent.remove();
    } else {
      parent.replace($createTableNode().append(row));
    }
  },
  type: "element",
};

/**
 * The Markdown the editor reads and writes, which is also what typing it
 * does ("## " makes a heading, "**bold**" bold…). Only what the page renderer
 * shows (GFM, plus spoilers and the fonts and sizes of styledText.ts): no ==highlight==. Check lists come before plain ones, which
 * would otherwise take their "- [ ]".
 */
export const WIKI_TRANSFORMERS: Transformer[] = [
  HEADING,
  TABLE,
  QUOTE,
  CHECK_LIST,
  UNORDERED_LIST,
  ORDERED_LIST,
  HORIZONTAL_RULE,
  CODE,
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  LINK,
  STYLED,
  SPOILER,
];

/** Put a page's Markdown into the editor (call inside an editor update). */
export function $importWikiMarkdown(markdown: string) {
  $convertFromMarkdownString(markdown, WIKI_TRANSFORMERS);
}

/** The editor's content as Markdown (call inside an editor read or update). */
export function $exportWikiMarkdown() {
  return $convertToMarkdownString(WIKI_TRANSFORMERS);
}

/**
 * Why the rich editor can't edit this page without losing something, if it
 * can't: Markdown it has no way to show (images, footnotes, reference links,
 * setext headings, raw HTML, aligned table columns). Those pages are edited as Markdown.
 */
export function richEditBlocker(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  let fenced = false;
  // Between a table's divider and its last row.
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    // Tables are fine, except aligned columns (the editor has no alignment) and
    // lines that only look like rows, which would turn into tables.
    if (TABLE_ROW.test(line)) {
      const header = i + 1 < lines.length && isTableRowDivider(lines[i + 1]);
      if (header && lines[i + 1].includes(":")) return "aligned table columns";
      if (!header && !inTable) return "lines that look like table rows";
      if (header) {
        inTable = true;
        i++; // the divider
      }
      continue;
    }
    inTable = false;
    if (/!\[[^\]]*\]\([^)]*\)/.test(line)) return "images";
    if (/\[\^[^\]]+\]/.test(line)) return "footnotes";
    if (/^\s{0,3}\[[^\]^]+\]:\s*\S/.test(line)) return "reference links";
    if (/^\s{0,3}(=+|-+)\s*$/.test(line) && i > 0 && lines[i - 1].trim() && !/^\s*([-*+]|\d+\.)\s/.test(lines[i - 1])) {
      return "underlined headings";
    }
    if (/<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i.test(line.replace(/`[^`]*`/g, ""))) return "HTML";
  }
  return undefined;
}
