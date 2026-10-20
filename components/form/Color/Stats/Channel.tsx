"use client";

import { useState } from "react";

type ChannelProps = {
  /** Shown under the field, e.g. "R". */
  label: string;
  /** Its accessible name, e.g. "Red". */
  name: string;
  value: number;
  max: number;
  disabled?: boolean;
  /** Called with each valid number typed (whole numbers, 0 to `max`). */
  onCommit: (value: number) => void;
};

/**
 * A number field for one channel. While you type it keeps your text, so
 * clearing it to retype doesn't snap back to the old value; valid numbers apply
 * as you go.
 */
export function Channel({ label, name, value, max, disabled, onCommit }: ChannelProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[11px] font-medium text-muted">
      <input
        type="number"
        inputMode="numeric"
        aria-label={name}
        min={0}
        max={max}
        step={1}
        disabled={disabled}
        value={draft ?? String(Math.round(value))}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const n = Number(text);
          if (text.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max) onCommit(n);
        }}
        onBlur={() => setDraft(null)}
        // 16px text on touch screens: iOS zooms in on focusing anything smaller.
        className="h-8 w-full [appearance:textfield] rounded-md border border-border bg-surface-2 px-1 text-center text-xs text-foreground tabular-nums outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:text-base [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span aria-hidden>{label}</span>
    </label>
  );
}
