// Keyboard shortcuts: what each does, the keys for it, and which one a key press is.
// The app-wide ones are handled in components/chat/Core; the rest (the message
// box, the wiki editor) where they apply, and are listed here for the help sheet.

/** The shortcuts Core handles anywhere in the app. Ctrl+K (the quick switcher) is the QuickSwitcher's own. */
export type ShortcutAction =
  | "previous-channel"
  | "next-channel"
  | "previous-unread"
  | "next-unread"
  | "mark-all-read"
  | "search"
  | "settings"
  | "help"
  | "close-panel";

/** A key press, as far as shortcuts care. */
export type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & {
  /** Focus is in a text field (the message box, a search box…), where plain keys type. */
  typing?: boolean;
};

/** Ctrl, or ⌘ on a Mac (either counts, so a Mac keyboard on another system still works). */
const mod = (e: KeyPress) => e.ctrlKey || e.metaKey;

/** Which app-wide shortcut a key press is, if any. */
export function shortcutFor(e: KeyPress): ShortcutAction | undefined {
  const key = e.key;
  if (e.altKey && !mod(e) && (key === "ArrowUp" || key === "ArrowDown")) {
    const down = key === "ArrowDown";
    if (e.shiftKey) return down ? "next-unread" : "previous-unread";
    return down ? "next-channel" : "previous-channel";
  }
  if (key === "Escape" && e.shiftKey && !mod(e) && !e.altKey) return "mark-all-read";
  if (mod(e) && !e.altKey) {
    if (e.shiftKey && key.toLowerCase() === "f") return "search";
    if (!e.shiftKey && key === ",") return "settings";
    if (key === "/" || key === "?") return "help";
  }
  // Plain keys only count while you're not typing.
  if (!e.typing && !mod(e) && !e.altKey) {
    if (key === "?") return "help";
    if (key === "Escape" && !e.shiftKey) return "close-panel";
  }
  return undefined;
}

/** Whether focus is somewhere that takes typing (where plain-key shortcuts stand down). */
export function isTyping(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  const field = element.closest("input, textarea, select");
  if (!field) return false;
  // Checkboxes, radios and buttons don't take text.
  return !(field instanceof HTMLInputElement) || !["checkbox", "radio", "button", "submit", "range", "color"].includes(field.type);
}

/**
 * The channel to go to from `current`, in sidebar order: the next or previous
 * one, or (with `unread`) the next or previous one with unread messages.
 * Wraps around; undefined when there's nowhere to go.
 */
export function stepChannel(
  order: readonly string[],
  current: string | null,
  direction: 1 | -1,
  isUnread?: (id: string) => boolean,
): string | undefined {
  if (order.length === 0) return undefined;
  const start = current ? order.indexOf(current) : -1;
  for (let step = 1; step <= order.length; step++) {
    const index = (((start + direction * step) % order.length) + order.length) % order.length;
    const id = order[index];
    if (id === current) return undefined;
    if (!isUnread || isUnread(id)) return id;
  }
  return undefined;
}

/** One line on the help sheet: the keys (each a combination) and what they do. */
export type ShortcutHelp = { keys: string[][]; description: string };

/** Every shortcut, by where it works, for the help sheet. "Mod" shows as Ctrl, or ⌘ on a Mac. */
export const SHORTCUT_HELP: { heading: string; shortcuts: ShortcutHelp[] }[] = [
  {
    heading: "Getting around",
    shortcuts: [
      { keys: [["Mod", "K"]], description: "Jump to a chat or person" },
      { keys: [["Alt", "↑"], ["Alt", "↓"]], description: "Previous or next channel" },
      { keys: [["Alt", "Shift", "↑"], ["Alt", "Shift", "↓"]], description: "Previous or next unread channel" },
      { keys: [["Shift", "Esc"]], description: "Mark everything read" },
      { keys: [["Mod", "Shift", "F"]], description: "Search messages" },
      { keys: [["Mod", ","]], description: "Settings" },
      { keys: [["Esc"]], description: "Close the side panel" },
      { keys: [["Mod", "/"], ["?"]], description: "These shortcuts" },
    ],
  },
  {
    heading: "Writing messages",
    shortcuts: [
      { keys: [["Enter"]], description: "Send" },
      { keys: [["Shift", "Enter"]], description: "New line" },
      { keys: [["↑"]], description: "Edit your last message (in an empty message box)" },
      { keys: [["Esc"]], description: "Stop replying" },
      { keys: [["@"]], description: "Mention someone" },
      { keys: [[":"]], description: "Emoji (type two letters of its name)" },
      { keys: [["#"]], description: "Link a channel" },
      { keys: [["/"]], description: "Slash commands" },
    ],
  },
  {
    heading: "Formatting messages",
    shortcuts: [
      { keys: [["Mod", "B"]], description: "Bold" },
      { keys: [["Mod", "I"]], description: "Italic" },
      { keys: [["Mod", "E"]], description: "Code" },
      { keys: [["Mod", "Shift", "X"]], description: "Strikethrough" },
      { keys: [["Mod", "Shift", "H"]], description: "Spoiler" },
    ],
  },
  {
    heading: "Messages",
    shortcuts: [{ keys: [["Shift", "Click"]], description: "Delete without asking (on the delete button)" }],
  },
  {
    heading: "Wiki pages",
    shortcuts: [
      { keys: [["Mod", "Enter"]], description: "Save the page" },
      { keys: [["Mod", "B"]], description: "Bold" },
      { keys: [["Mod", "I"]], description: "Italic" },
      { keys: [["Mod", "E"]], description: "Code" },
      { keys: [["Mod", "Shift", "X"]], description: "Strikethrough" },
      { keys: [["Mod", "Shift", "H"]], description: "Spoiler" },
      { keys: [[":"], ["#"]], description: "Emoji, or link a channel" },
      { keys: [["Mod", "Z"]], description: "Undo" },
      { keys: [["Mod", "Shift", "Z"]], description: "Redo" },
      { keys: [["Esc"]], description: "Stop editing (when nothing changed)" },
    ],
  },
];
