"use client";

import { Bold, Code, EyeOff, Italic, Link, List, SquareCode, Strikethrough, TextQuote, type LucideIcon } from "lucide-react";
import { modifierKey } from "@/components/chat/QuickSwitcher";
import { codeBlock, link, toggleLinePrefix, toggleMark, type Edit } from "@/lib/chat/formatting";

type Format = { label: string; icon: LucideIcon; shortcut?: string; apply: (edit: Edit) => Edit };

const FORMATS: Format[][] = [
  [
    { label: "Bold", icon: Bold, shortcut: "B", apply: (e) => toggleMark(e, "bold") },
    { label: "Italic", icon: Italic, shortcut: "I", apply: (e) => toggleMark(e, "italic") },
    { label: "Strikethrough", icon: Strikethrough, shortcut: "Shift+X", apply: (e) => toggleMark(e, "strikethrough") },
    { label: "Spoiler", icon: EyeOff, shortcut: "Shift+H", apply: (e) => toggleMark(e, "spoiler") },
  ],
  [
    { label: "Link", icon: Link, apply: link },
    { label: "Code", icon: Code, shortcut: "E", apply: (e) => toggleMark(e, "code") },
    { label: "Code block", icon: SquareCode, apply: codeBlock },
  ],
  [
    { label: "Quote", icon: TextQuote, apply: (e) => toggleLinePrefix(e, "> ") },
    { label: "List", icon: List, apply: (e) => toggleLinePrefix(e, "- ") },
  ],
];

/** Formatting buttons above the message box, for those who don't write Markdown (it writes it for them). */
export default function FormatBar({ onApply }: { onApply: (change: (edit: Edit) => Edit) => void }) {
  const modifier = modifierKey();
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      {FORMATS.map((group, index) => (
        <div key={index} className="flex items-center gap-0.5">
          {index > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
          {group.map((format) => {
            const title = format.shortcut ? `${format.label} (${modifier}+${format.shortcut})` : format.label;
            return (
              <button
                key={format.label}
                type="button"
                // Keep the selection in the message box while clicking.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onApply(format.apply)}
                aria-label={format.label}
                title={title}
                className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <format.icon className="size-4" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
