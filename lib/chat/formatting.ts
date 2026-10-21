// Formatting in the composer: wrapping the selection in Markdown (bold,
// italic, code, strikethrough, spoiler, links) or prefixing its lines (quotes,
// lists), and undoing it when it's already there. Pure: the composer applies
// the text and selection it returns.

/** Text with a selection (start ≤ end, as in a textarea). */
export type Edit = { text: string; start: number; end: number };

/** How each inline format is written around the selection. */
export const MARKS = {
  bold: "**",
  italic: "_",
  strikethrough: "~~",
  code: "`",
  spoiler: "||",
} as const;

export type Mark = keyof typeof MARKS;

/**
 * Wrap the selection in `mark`, or unwrap it if it's wrapped already (the
 * marks just outside it, or at its own ends). With nothing selected, the
 * marks go in with the caret between them. Spaces at the selection's edges
 * stay outside, so "**word **" doesn't happen.
 */
export function toggleMark({ text, start, end }: Edit, mark: Mark): Edit {
  const m = MARKS[mark];
  // Already wrapped, just outside the selection.
  if (text.slice(start - m.length, start) === m && text.slice(end, end + m.length) === m) {
    return {
      text: text.slice(0, start - m.length) + text.slice(start, end) + text.slice(end + m.length),
      start: start - m.length,
      end: end - m.length,
    };
  }
  const selected = text.slice(start, end);
  // Already wrapped, inside the selection.
  if (selected.length >= m.length * 2 && selected.startsWith(m) && selected.endsWith(m)) {
    const inner = selected.slice(m.length, -m.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const from = start + leading;
  const to = Math.max(from, end - trailing);
  const core = text.slice(from, to);
  return {
    text: text.slice(0, from) + m + core + m + text.slice(to),
    start: from + m.length,
    end: from + m.length + core.length,
  };
}

/** A code block around the selection (on lines of its own), or an empty one with the caret inside. */
export function codeBlock({ text, start, end }: Edit): Edit {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const open = `${before && !before.endsWith("\n") ? "\n" : ""}\`\`\`\n`;
  const close = `\n\`\`\``;
  const after = text.slice(end);
  const next = `${before}${open}${selected}${close}${after && !after.startsWith("\n") ? "\n" : ""}${after}`;
  const from = before.length + open.length;
  return { text: next, start: from, end: from + selected.length };
}

/** A Markdown link: the selection becomes its text, and "url" is selected to type over. */
export function link({ text, start, end }: Edit): Edit {
  const label = text.slice(start, end) || "text";
  const inserted = `[${label}](url)`;
  const urlStart = start + label.length + 3;
  return { text: text.slice(0, start) + inserted + text.slice(end), start: urlStart, end: urlStart + 3 };
}

/**
 * Prefix every line the selection touches ("> " for a quote, "- " for a
 * list), or take it off if they all have it.
 */
export function toggleLinePrefix({ text, start, end }: Edit, prefix: "> " | "- "): Edit {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const all = lines.every((line) => line.startsWith(prefix));
  const changed = lines.map((line) => (all ? line.slice(prefix.length) : prefix + line));
  const block = changed.join("\n");
  const shift = all ? -prefix.length : prefix.length;
  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    start: Math.max(lineStart, start + shift),
    end: lineStart + block.length - (lineEnd - end),
  };
}

/** Keyboard shortcuts for formatting, as key (lowercase) plus whether Shift is held. Ctrl, or ⌘ on a Mac. */
export const FORMAT_SHORTCUTS: { mark: Mark; key: string; shift: boolean }[] = [
  { mark: "bold", key: "b", shift: false },
  { mark: "italic", key: "i", shift: false },
  { mark: "code", key: "e", shift: false },
  { mark: "strikethrough", key: "x", shift: true },
  { mark: "spoiler", key: "h", shift: true },
];

/** The format a key press asks for, if it's one of FORMAT_SHORTCUTS. */
export function shortcutMark(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  return FORMAT_SHORTCUTS.find((s) => s.key === key && s.shift === event.shiftKey)?.mark;
}
