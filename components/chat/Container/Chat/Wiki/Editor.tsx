"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  EyeOff,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Smile,
  SquareCode,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Redo2,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  TextQuote,
  Undo2,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type EditorThemeClasses,
  type LexicalEditor,
  type TextFormatType,
  type TextNode,
} from "lexical";
import { $createCodeNode, $isCodeNode } from "@lexical/code-core";
import { getCodeLanguageOptions, normalizeCodeLanguage, registerCodeHighlighting } from "@lexical/code-prism";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findTableNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  INSERT_TABLE_COMMAND,
} from "@lexical/table";
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import type { LinkableChannel } from "@/lib/chat/channelLinks";
import { searchEmoji } from "@/lib/chat/emoji";
import { shortcutMark } from "@/lib/chat/formatting";
import { FONTS, SIZES, type Font, type Size } from "@/lib/chat/styledText";
import { safeUrl } from "@/lib/chat/url";
import {
  $exportWikiMarkdown,
  $importWikiMarkdown,
  readTextStyle,
  STYLE_PROPERTIES,
  WIKI_NODES,
  WIKI_TRANSFORMERS,
} from "@/lib/chat/wikiMarkdown";
import Select from "@/components/form/Select";
import ComposerEmojiPicker from "../Composer/EmojiPicker";
import { cn } from "@/lib/utils";

/**
 * Lexical's classes for each kind of content, matching how the page renders
 * (the "page" variant of MarkdownText), so what you write is what you get.
 */
const THEME: EditorThemeClasses = {
  paragraph: "mt-3 leading-7 first:mt-0",
  heading: {
    h1: "mt-8 mb-3 text-2xl font-bold tracking-tight first:mt-0",
    h2: "mt-7 mb-2 border-b border-border pb-1 text-xl font-semibold tracking-tight first:mt-0",
    h3: "mt-5 mb-1.5 text-lg font-semibold first:mt-0",
    h4: "mt-4 mb-1 font-semibold first:mt-0",
    h5: "mt-4 mb-1 font-semibold first:mt-0",
    h6: "mt-4 mb-1 font-semibold text-muted first:mt-0",
  },
  quote: "my-3 border-l-2 border-accent/50 pl-4 text-muted",
  list: {
    ul: "my-3 list-disc space-y-1 pl-6 leading-7",
    ol: "my-3 list-decimal space-y-1 pl-6 leading-7",
    checklist: "wiki-checklist my-3 space-y-1 leading-7",
    listitem: "pl-0.5",
    listitemChecked: "wiki-check wiki-check-on",
    listitemUnchecked: "wiki-check",
    nested: { listitem: "list-none" },
  },
  link: "text-accent-bright underline underline-offset-2",
  code: "my-3 block overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[13px] leading-5 whitespace-pre",
  hr: "my-6 border-border",
  table: "my-3 w-max min-w-1/2 border-collapse text-sm",
  tableCell: "relative min-w-24 border border-border px-2 py-1 text-left align-top [&_p]:mt-0 [&_p]:leading-6",
  tableCellHeader: "bg-surface-2 font-semibold",
  tableSelection: "[&_td]:bg-accent/10 [&_th]:bg-accent/15",
  tableCellSelected: "bg-accent/15",
  // Prism's tokens, in colors that read in both themes.
  codeHighlight: {
    comment: "text-muted italic",
    prolog: "text-muted",
    doctype: "text-muted",
    cdata: "text-muted",
    punctuation: "text-muted",
    keyword: "text-accent-bright",
    atrule: "text-accent-bright",
    important: "text-accent-bright",
    selector: "text-accent-bright",
    tag: "text-accent-bright",
    builtin: "text-accent-bright",
    string: "text-online",
    char: "text-online",
    "attr-value": "text-online",
    regex: "text-online",
    inserted: "text-online",
    number: "text-warning",
    boolean: "text-warning",
    constant: "text-warning",
    symbol: "text-warning",
    property: "text-warning",
    "attr-name": "text-warning",
    function: "text-danger",
    "class-name": "text-danger",
    deleted: "text-danger",
    operator: "text-foreground",
    variable: "text-foreground",
  },
  text: {
    bold: "font-semibold",
    italic: "italic",
    strikethrough: "line-through",
    code: "rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]",
  },
};

type Heading = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type Block = "paragraph" | Heading | "quote" | "code" | "bullet" | "number" | "check";

const HEADINGS: Heading[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

const BLOCKS: { value: Block; label: string }[] = [
  { value: "paragraph", label: "Text" },
  ...HEADINGS.map((value, index) => ({ value, label: `Heading ${index + 1}` })),
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code block" },
];

type WikiEditorProps = {
  /** The page's Markdown to start from (read once, when the editor opens). */
  initial: string;
  disabled?: boolean;
  /** The page as Markdown, after every change. */
  onChange: (markdown: string) => void;
  /** Ctrl+Enter (⌘+Enter). */
  onSave: () => void;
  /** Escape. */
  onEscape: () => void;
  /** The group's custom emoji (name → image URL), for the picker and ":name:" suggestions. */
  emoji?: Record<string, string>;
  /** The group's channels you can see, for "#channel" suggestions (the page links them). */
  channels?: LinkableChannel[];
};

/** A wiki page as rich text: formatted as you type, and kept as Markdown (see lib/chat/wikiMarkdown.ts). */
export default function WikiEditor({ initial, disabled, onChange, onSave, onEscape, emoji, channels = [] }: WikiEditorProps) {
  const labelId = useId();
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "wiki",
        nodes: WIKI_NODES,
        theme: THEME,
        editable: !disabled,
        editorState: () => $importWikiMarkdown(initial),
        onError: (error) => console.error("wiki editor:", error),
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <Toolbar disabled={disabled} emoji={emoji} />
        <div className="wiki-editor relative min-h-0 flex-1 overflow-y-auto">
          <span id={labelId} className="sr-only">
            Page content
          </span>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-labelledby={labelId}
                aria-placeholder="Write the page…"
                placeholder={
                  <p className="pointer-events-none absolute top-8 left-1/2 w-full max-w-3xl -translate-x-1/2 px-6 text-muted">
                    Write the page… Type # for a heading, - for a list, or **bold**.
                  </p>
                }
                className="mx-auto min-h-full max-w-3xl px-6 py-8 outline-none"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <LinkPlugin validateUrl={(url) => safeUrl(url) !== undefined} />
      <HorizontalRulePlugin />
      {/* Markdown tables are plain grids: no merged cells or cell colors. */}
      <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} hasHorizontalScroll />
      <CodeHighlightPlugin />
      <TabIndentationPlugin maxIndent={6} />
      <MarkdownShortcutPlugin transformers={WIKI_TRANSFORMERS} />
      <OnChangePlugin ignoreSelectionChange onChange={(state) => onChange(state.read(() => $exportWikiMarkdown()))} />
      <KeysPlugin onSave={onSave} onEscape={onEscape} />
      <FormatKeysPlugin />
      <EmojiTypeaheadPlugin emoji={emoji} />
      {channels.length > 0 && <ChannelTypeaheadPlugin channels={channels} />}
      <EditablePlugin editable={!disabled} />
    </LexicalComposer>
  );
}

/** Ctrl+Enter saves and Escape leaves, before the editor's own Enter handling. */
function KeysPlugin({ onSave, onEscape }: { onSave: () => void; onEscape: () => void }) {
  const [editor] = useLexicalComposerContext();
  const handlers = useRef({ onSave, onEscape });
  useEffect(() => {
    handlers.current = { onSave, onEscape };
  });
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (!event || !(event.ctrlKey || event.metaKey)) return false;
            event.preventDefault();
            handlers.current.onSave();
            return true;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          () => {
            handlers.current.onEscape();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );
  return null;
}

/** Colors code blocks by their language (Prism). */
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
}

// ---- Fonts, sizes and spoilers (kept as text styles: see lib/chat/wikiMarkdown.ts) ----

/** Set (or, with null, clear) parts of the selection's style. */
function patchStyle(editor: LexicalEditor, patch: Record<string, string | null>) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $patchStyleText(selection, patch);
  });
}

function setFont(editor: LexicalEditor, font: Font | "") {
  patchStyle(editor, { [STYLE_PROPERTIES.font]: font ? FONTS[font].css : null });
}

function setSize(editor: LexicalEditor, size: Size | "") {
  patchStyle(editor, { [STYLE_PROPERTIES.size]: size ? SIZES[size].css : null });
}

const BLOCK_ICONS: Record<(typeof BLOCKS)[number]["value"], LucideIcon> = {
  paragraph: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  quote: TextQuote,
  code: SquareCode,
  bullet: List,
  number: ListOrdered,
  check: ListChecks,
};

/** The block types for the picker, each with its icon. */
const BLOCK_OPTIONS = BLOCKS.map(({ value, label }) => {
  const Icon = BLOCK_ICONS[value];
  return { value, label, icon: <Icon aria-hidden className="size-4 text-muted" /> };
});

/** The option for "no font or size of its own" (the page's). */
const DEFAULT_STYLE = "default";

/** Each font, previewed in itself. */
const FONT_OPTIONS = [
  { value: DEFAULT_STYLE, label: "Default font", icon: <span aria-hidden className="w-5 text-center text-sm">Aa</span> },
  ...(Object.keys(FONTS) as Font[]).map((font) => ({
    value: font,
    label: FONTS[font].label,
    icon: (
      <span aria-hidden className="w-5 text-center text-sm" style={{ fontFamily: FONTS[font].css }}>
        Aa
      </span>
    ),
  })),
];

/** Each size, with how big it is next to the page's text. */
const SIZE_OPTIONS = [
  { value: DEFAULT_STYLE, label: "Normal", description: "100%" },
  ...(Object.keys(SIZES) as Size[]).map((size) => ({
    value: size,
    label: SIZES[size].label,
    description: `${Math.round(parseFloat(SIZES[size].css) * 100)}%`,
  })),
];

/** The form selects at the toolbar's height (they're 40px by default, its controls 32px). */
const COMPACT_SELECT = "[&>button]:h-8 [&>button]:px-2 [&>button]:text-xs [&>input]:h-8 [&>input]:px-2 [&>input]:text-xs";

/** Hide the selection as a spoiler, or show it again if it's one already. */
function toggleSpoiler(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const on = $getSelectionStyleValueForProperty(selection, STYLE_PROPERTIES.spoiler, "") === "1";
    $patchStyleText(selection, { [STYLE_PROPERTIES.spoiler]: on ? null : "1" });
  });
}

/** Ctrl/⌘+E code, Ctrl/⌘+Shift+X strikethrough, Ctrl/⌘+Shift+H spoiler, as in the message box (bold and italic are Lexical's own). */
function FormatKeysPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const mark = shortcutMark(event);
          if (!mark || mark === "bold" || mark === "italic") return false;
          event.preventDefault();
          if (mark === "spoiler") toggleSpoiler(editor);
          else editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );
  return null;
}

// ---- Suggestions while typing: ":emoji" and "#channel" ----

/** One suggestion, and the text it puts in place of what was typed. */
class SuggestOption extends MenuOption {
  label: string;
  insert: string;
  preview: ReactNode;
  hint?: string;
  constructor(key: string, label: string, insert: string, preview: ReactNode, hint?: string) {
    super(key);
    this.label = label;
    this.insert = insert;
    this.preview = preview;
    this.hint = hint;
  }
}

/**
 * A trigger for the typeahead: the pattern's groups are what comes before
 * (start of line, a space or "("), the text to replace, and the query.
 */
function triggerFor(pattern: RegExp) {
  return (text: string): MenuTextMatch | null => {
    const match = pattern.exec(text);
    if (!match) return null;
    return { leadOffset: match.index + match[1].length, replaceableString: match[2], matchingString: match[3] };
  };
}

/** ":" and at least two letters, so "10:30" doesn't open it (as in the message box). */
const EMOJI_TRIGGER = triggerFor(/(^|\s|\()(:([a-z0-9_+-]{2,32}))$/i);
const CHANNEL_TRIGGER = triggerFor(/(^|\s|\()(#([^\s#]{0,32}))$/);

/** The typeahead's list, at the caret. */
function SuggestMenu({
  label,
  anchor,
  options,
  selectedIndex,
  onPick,
  onHover,
}: {
  label: string;
  anchor: HTMLElement | null;
  options: SuggestOption[];
  selectedIndex: number | null;
  onPick: (option: SuggestOption) => void;
  onHover: (index: number) => void;
}) {
  if (!anchor || options.length === 0) return null;
  return createPortal(
    <ul
      role="listbox"
      aria-label={label}
      className="absolute top-full left-0 z-30 mt-1 w-64 rounded-xl border border-border bg-surface p-1 shadow-xl"
    >
      {options.map((option, index) => (
        <li
          key={option.key}
          ref={(element) => option.setRefElement(element)}
          role="option"
          aria-selected={index === selectedIndex}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(option);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", index === selectedIndex && "bg-surface-2")}
        >
          <span className="flex size-6 shrink-0 items-center justify-center">{option.preview}</span>
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.hint && <span className="shrink-0 text-xs text-muted">{option.hint}</span>}
        </li>
      ))}
    </ul>,
    anchor,
  );
}

/** Replace what was typed (":smi", "#gen") with the pick. */
function insertSuggestion(editor: LexicalEditor, option: SuggestOption, typed: TextNode | null, close: () => void) {
  editor.update(() => {
    if (typed) {
      typed.setTextContent(option.insert);
      typed.select();
    } else {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(option.insert);
    }
    close();
  });
}

function EmojiTypeaheadPlugin({ emoji }: { emoji?: Record<string, string> }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(
    () =>
      query === null
        ? []
        : searchEmoji(query, emoji, 8).map((found) =>
            found.kind === "custom"
              ? new SuggestOption(
                  `custom:${found.name}`,
                  `:${found.name}:`,
                  `:${found.name}: `,
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded emoji
                  <img src={found.url} alt="" className="size-5" />,
                  "Custom",
                )
              : new SuggestOption(found.name, `:${found.name}:`, found.emoji, <span className="text-lg">{found.emoji}</span>),
          ),
    [query, emoji],
  );
  return (
    <LexicalTypeaheadMenuPlugin<SuggestOption>
      triggerFn={EMOJI_TRIGGER}
      onQueryChange={setQuery}
      options={options}
      onSelectOption={(option, typed, close) => insertSuggestion(editor, option, typed, close)}
      anchorClassName="z-30"
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => (
        <SuggestMenu
          label="Emoji"
          anchor={anchor.current}
          options={options}
          selectedIndex={selectedIndex}
          onPick={selectOptionAndCleanUp}
          onHover={setHighlightedIndex}
        />
      )}
    />
  );
}

function ChannelTypeaheadPlugin({ channels }: { channels: LinkableChannel[] }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    return channels
      .filter((c) => c.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)))
      .slice(0, 6)
      .map((c) => new SuggestOption(c.id, c.name, `#${c.name} `, <Hash aria-hidden className="size-4 text-muted" />));
  }, [query, channels]);
  return (
    <LexicalTypeaheadMenuPlugin<SuggestOption>
      triggerFn={CHANNEL_TRIGGER}
      onQueryChange={setQuery}
      options={options}
      onSelectOption={(option, typed, close) => insertSuggestion(editor, option, typed, close)}
      anchorClassName="z-30"
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => (
        <SuggestMenu
          label="Link a channel"
          anchor={anchor.current}
          options={options}
          selectedIndex={selectedIndex}
          onPick={selectOptionAndCleanUp}
          onHover={setHighlightedIndex}
        />
      )}
    />
  );
}

/** Follows `editable` (it's read-only while saving). */
function EditablePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.setEditable(editable), [editor, editable]);
  return null;
}

type Formats = Record<"bold" | "italic" | "strikethrough" | "code", boolean>;

const NO_FORMATS: Formats = { bold: false, italic: false, strikethrough: false, code: false };

type SelectionState = {
  block: Block;
  formats: Formats;
  link: boolean;
  /** The cursor is in a table. */
  table: boolean;
  /** In a code block: its language ("" for none). */
  language?: string;
  /** The selection's font and size ("" for the page's own, or when it's mixed), and whether it's a spoiler. */
  font: Font | "";
  size: Size | "";
  spoiler: boolean;
};

/** What's at the cursor, for the toolbar's pressed states. */
function readSelection(): SelectionState | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const top = anchor.getKey() === "root" ? anchor : anchor.getTopLevelElementOrThrow();
  let block: Block = "paragraph";
  if ($isListNode(top)) {
    const list = $getNearestNodeOfType(anchor, ListNode) ?? top;
    block = list.getListType();
  } else if ($isHeadingNode(top)) {
    block = top.getTag();
  } else if ($isQuoteNode(top)) {
    block = "quote";
  } else if ($isCodeNode(top)) {
    block = "code";
  }
  const language = $isCodeNode(top) ? (top.getLanguage() ?? "") : undefined;
  const link = Boolean($findMatchingParent(anchor, $isLinkNode) ?? $findMatchingParent(selection.focus.getNode(), $isLinkNode));
  const style = readTextStyle(
    Object.values(STYLE_PROPERTIES)
      .map((property) => `${property}: ${$getSelectionStyleValueForProperty(selection, property, "")}`)
      .join("; "),
  );
  return {
    font: style.font ?? "",
    size: style.size ?? "",
    spoiler: style.spoiler === true,
    block,
    formats: {
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      strikethrough: selection.hasFormat("strikethrough"),
      code: selection.hasFormat("code"),
    },
    link,
    table: $findTableNode(anchor) !== null,
    ...(language !== undefined && { language }),
  };
}

/** The code block at the cursor gets this language ("" for plain text). */
function setCodeLanguage(editor: LexicalEditor, language: string) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const code = $findMatchingParent(selection.anchor.getNode(), $isCodeNode);
    if ($isCodeNode(code)) code.setLanguage(language || undefined);
  });
}

/** Add or remove the row or column at the cursor. */
function editTable(editor: LexicalEditor, change: "row" | "column" | "delete-row" | "delete-column") {
  editor.update(() => {
    if (change === "row") $insertTableRowAtSelection(true);
    else if (change === "column") $insertTableColumnAtSelection(true);
    else if (change === "delete-row") $deleteTableRowAtSelection();
    else $deleteTableColumnAtSelection();
  });
}

/** Every language a code block can be marked as, by name. */
const CODE_LANGUAGES = getCodeLanguageOptions().filter(([value]) => value !== "plain");

/** Turn the selected blocks into `block` (lists toggle off when picked again). */
function setBlock(editor: LexicalEditor, block: Block, current: Block) {
  if (block === "bullet" || block === "number" || block === "check") {
    if (current === block) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    else if (block === "bullet") editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    else if (block === "number") editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    else editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    return;
  }
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (current === "bullet" || current === "number" || current === "check") {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
    $setBlocksType(selection, () => {
      switch (block) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          return $createHeadingNode(block);
        case "quote":
          return $createQuoteNode();
        case "code":
          return $createCodeNode();
        default:
          return $createParagraphNode();
      }
    });
  });
}

function Toolbar({ disabled, emoji }: { disabled?: boolean; emoji?: Record<string, string> }) {
  const [editor] = useLexicalComposerContext();
  const [block, setBlockState] = useState<Block>("paragraph");
  const [formats, setFormats] = useState<Formats>(NO_FORMATS);
  const [textStyle, setTextStyle] = useState<{ font: Font | ""; size: Size | ""; spoiler: boolean }>({ font: "", size: "", spoiler: false });
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const [link, setLink] = useState(false);
  const [table, setTable] = useState(false);
  const [language, setLanguage] = useState<string>();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // The link being typed (the toolbar shows a field for it in place of the buttons).
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    const update = () => {
      const state = readSelection();
      if (!state) return;
      setBlockState(state.block);
      setFormats(state.formats);
      setTextStyle({ font: state.font, size: state.size, spoiler: state.spoiler });
      setLink(state.link);
      setTable(state.table);
      setLanguage(state.language);
    };
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => editorState.read(update)),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          update();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  const format = (type: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);

  function applyLink() {
    const url = safeUrl(linking?.trim().match(/^[a-z][a-z0-9+.-]*:/i) ? linking.trim() : `https://${linking?.trim()}`);
    if (!url) {
      setLinkError(true);
      return;
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    setLinking(null);
    setLinkError(false);
    editor.focus();
  }

  if (linking !== null) {
    return (
      <form
        className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          applyLink();
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Link2 aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Link address</span>
          <input
            autoFocus
            value={linking}
            onChange={(event) => {
              setLinking(event.target.value);
              setLinkError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setLinking(null);
                editor.focus();
              }
            }}
            placeholder="https://…"
            aria-invalid={linkError}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border bg-surface-2 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
              linkError ? "border-danger" : "border-border focus-visible:border-accent",
            )}
          />
        </label>
        {linkError && <span className="text-xs text-danger">That isn&apos;t a web address.</span>}
        <button type="submit" className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:opacity-90">
          Add link
        </button>
        <button
          type="button"
          onClick={() => {
            setLinking(null);
            editor.focus();
          }}
          className="h-8 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
      </form>
    );
  }

  const inList = block === "bullet" || block === "number" || block === "check";
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-disabled={disabled}
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-3 py-1",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Select
        aria-label="Block type"
        value={inList ? "paragraph" : block}
        onChange={(next) => {
          if (next) setBlock(editor, next as Block, block);
          editor.focus();
        }}
        options={BLOCK_OPTIONS}
        className={cn("mr-1 w-32", COMPACT_SELECT)}
      />
      <ToolButton label="Bold" shortcut="Ctrl+B" pressed={formats.bold} onClick={() => format("bold")}>
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton label="Italic" shortcut="Ctrl+I" pressed={formats.italic} onClick={() => format("italic")}>
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton label="Strikethrough" shortcut="Ctrl+Shift+X" pressed={formats.strikethrough} onClick={() => format("strikethrough")}>
        <Strikethrough className="size-4" />
      </ToolButton>
      <ToolButton label="Inline code" shortcut="Ctrl+E" pressed={formats.code} onClick={() => format("code")}>
        <Code className="size-4" />
      </ToolButton>
      <ToolButton label="Spoiler" shortcut="Ctrl+Shift+H" pressed={textStyle.spoiler} onClick={() => toggleSpoiler(editor)}>
        <EyeOff className="size-4" />
      </ToolButton>
      <Separator />
      <Select
        aria-label="Font"
        value={textStyle.font || DEFAULT_STYLE}
        onChange={(next) => {
          setFont(editor, next && next !== DEFAULT_STYLE ? (next as Font) : "");
          editor.focus();
        }}
        options={FONT_OPTIONS}
        className={cn("w-32", COMPACT_SELECT)}
      />
      <Select
        type="combobox"
        aria-label="Text size"
        placeholder="Size"
        value={textStyle.size || DEFAULT_STYLE}
        onChange={(next) => {
          setSize(editor, next && next !== DEFAULT_STYLE ? (next as Size) : "");
          editor.focus();
        }}
        options={SIZE_OPTIONS}
        emptyText="No size like that"
        className={cn("ml-0.5 w-24", COMPACT_SELECT)}
      />
      <span className="relative">
        <ToolButton label="Emoji" onClick={() => setPickingEmoji((open) => !open)} pressed={pickingEmoji} toggle>
          <Smile className="size-4" />
        </ToolButton>
        {pickingEmoji && (
          <ComposerEmojiPicker
            custom={emoji}
            placement="below"
            onPick={(value) =>
              editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) selection.insertText(value.startsWith(":") ? `${value} ` : value);
              }, { onUpdate: () => editor.focus() })
            }
            onClose={() => setPickingEmoji(false)}
          />
        )}
      </span>
      <Separator />
      {link ? (
        <ToolButton label="Remove link" onClick={() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)}>
          <Unlink className="size-4" />
        </ToolButton>
      ) : (
        <ToolButton label="Link" onClick={() => setLinking("")}>
          <Link2 className="size-4" />
        </ToolButton>
      )}
      <Separator />
      <ToolButton label="Bulleted list" pressed={block === "bullet"} onClick={() => setBlock(editor, "bullet", block)}>
        <List className="size-4" />
      </ToolButton>
      <ToolButton label="Numbered list" pressed={block === "number"} onClick={() => setBlock(editor, "number", block)}>
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton label="Checklist" pressed={block === "check"} onClick={() => setBlock(editor, "check", block)}>
        <ListChecks className="size-4" />
      </ToolButton>
      <ToolButton label="Divider" onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}>
        <Minus className="size-4" />
      </ToolButton>
      <ToolButton
        label="Table"
        disabled={table}
        // A header row, as Markdown tables always have.
        onClick={() => editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: "3", columns: "3", includeHeaders: { rows: true, columns: false } })}
      >
        <Table2 className="size-4" />
      </ToolButton>
      {table && (
        <>
          <ToolButton label="Add a row below" onClick={() => editTable(editor, "row")}>
            <BetweenHorizontalEnd className="size-4" />
          </ToolButton>
          <ToolButton label="Add a column to the right" onClick={() => editTable(editor, "column")}>
            <BetweenVerticalEnd className="size-4" />
          </ToolButton>
          <ToolButton label="Delete this row" onClick={() => editTable(editor, "delete-row")}>
            <TableRowsSplit className="size-4" />
          </ToolButton>
          <ToolButton label="Delete this column" onClick={() => editTable(editor, "delete-column")}>
            <TableColumnsSplit className="size-4" />
          </ToolButton>
        </>
      )}
      {language !== undefined && (
        <label>
          <span className="sr-only">Code language</span>
          <select
            value={language ? normalizeCodeLanguage(language) : ""}
            onChange={(event) => setCodeLanguage(editor, event.target.value)}
            className="h-8 rounded-md border border-border bg-surface-2 px-2 text-xs font-medium text-foreground outline-none focus-visible:border-accent"
          >
            <option value="">Plain text</option>
            {CODE_LANGUAGES.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Separator />
      <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
        <Redo2 className="size-4" />
      </ToolButton>
    </div>
  );
}

function Separator() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}

function ToolButton({
  label,
  shortcut,
  pressed,
  disabled,
  toggle,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  /** A format that's on at the cursor; absent for plain actions. */
  pressed?: boolean;
  disabled?: boolean;
  /** It opens and closes something (the emoji picker): its picker lets its clicks through. */
  toggle?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-emoji-toggle={toggle || undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keep the editor's selection: clicking a button mustn't move focus out first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
        pressed && "bg-surface-2 text-foreground",
      )}
    >
      {children}
    </button>
  );
}
