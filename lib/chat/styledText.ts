// Fonts and sizes in wiki pages. Markdown has no way to say either, so pages
// write "{{font=serif|size=large:the text}}"; the wiki editor reads and writes
// it (see lib/chat/wikiMarkdown.ts) and the page renderer draws it. Only the
// fonts and sizes listed here are understood: nothing else gets through as CSS.

export const FONTS = {
  serif: { label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  mono: { label: "Monospace", css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  hand: { label: "Handwriting", css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
} as const;

export const SIZES = {
  small: { label: "Small", css: "0.85em" },
  large: { label: "Large", css: "1.25em" },
  xlarge: { label: "Larger", css: "1.5em" },
  huge: { label: "Huge", css: "2em" },
} as const;

export type Font = keyof typeof FONTS;
export type Size = keyof typeof SIZES;

export type TextStyle = { font?: Font; size?: Size };

/** "{{attributes:text}}": the attributes are "font=…" and "size=…", joined by "|". */
export const STYLED_PATTERN = /\{\{((?:font|size)=[a-z]+(?:\|(?:font|size)=[a-z]+)?):(.+?)\}\}/;

/** A style from "font=serif|size=large"; null if any part isn't one we know. */
export function parseStyle(attributes: string): TextStyle | null {
  const style: TextStyle = {};
  for (const part of attributes.split("|")) {
    const [key, value] = part.split("=");
    if (key === "font" && Object.hasOwn(FONTS, value)) style.font = value as Font;
    else if (key === "size" && Object.hasOwn(SIZES, value)) style.size = value as Size;
    else return null;
  }
  return style;
}

/** "font=serif|size=large" for a style; "" when it has neither. */
export function formatStyle(style: TextStyle) {
  return [style.font && `font=${style.font}`, style.size && `size=${style.size}`].filter(Boolean).join("|");
}

/** Text wrapped in its style, as a page stores it (or as it is, with no style). */
export function wrapStyled(text: string, style: TextStyle) {
  const attributes = formatStyle(style);
  return attributes && text ? `{{${attributes}:${text}}}` : text;
}

/** The properties a rendered styled span carries (read back by the page renderer). */
export const FONT_PROPERTY = "data-font";
export const SIZE_PROPERTY = "data-size";

/** The CSS a rendered span gets for its style. */
export function styleCss(font: unknown, size: unknown) {
  return {
    ...(typeof font === "string" && Object.hasOwn(FONTS, font) && { fontFamily: FONTS[font as Font].css }),
    ...(typeof size === "string" && Object.hasOwn(SIZES, size) && { fontSize: SIZES[size as Size].css }),
  };
}

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };

/** Split each text node's "{{…:…}}" runs into styled spans (code is left alone). */
function wrap(parent: Node) {
  const children = parent.children;
  if (!children) return;
  const next: Node[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      if (child.type !== "inlineCode" && child.type !== "code") wrap(child);
      next.push(child);
      continue;
    }
    let rest = child.value ?? "";
    let match: RegExpExecArray | null;
    while ((match = STYLED_PATTERN.exec(rest))) {
      const style = parseStyle(match[1]);
      if (!style) break;
      if (match.index > 0) next.push({ type: "text", value: rest.slice(0, match.index) });
      next.push({
        type: "styled",
        children: [{ type: "text", value: match[2] }],
        data: {
          hName: "span",
          hProperties: { ...(style.font && { [FONT_PROPERTY]: style.font }), ...(style.size && { [SIZE_PROPERTY]: style.size }) },
        },
      });
      rest = rest.slice(match.index + match[0].length);
    }
    if (rest) next.push({ type: "text", value: rest });
  }
  parent.children = next;
}

/** The remark plugin for pages: add it after remarkSpoiler, so a spoiler can be styled inside. */
export function remarkStyledText() {
  return (tree: Node) => wrap(tree);
}
