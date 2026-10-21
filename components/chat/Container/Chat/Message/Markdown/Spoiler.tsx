"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Text covered until someone clicks it (or presses Enter or Space on it). Revealing is just for you. */
export default function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown) return <span className="rounded bg-surface-2 px-0.5">{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler. Press to reveal."
      title="Spoiler: click to reveal"
      onClick={(event) => {
        // Links inside shouldn't open on the click that reveals them.
        event.preventDefault();
        event.stopPropagation();
        setShown(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setShown(true);
        }
      }}
      className={cn(
        "cursor-pointer rounded bg-foreground/80 px-0.5 text-transparent transition-colors select-none hover:bg-foreground/70",
        // Keep what's inside (links, mentions, emoji) from showing through.
        "[&_*]:pointer-events-none [&_*]:opacity-0",
      )}
    >
      <span aria-hidden>{children}</span>
    </span>
  );
}
