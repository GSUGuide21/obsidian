"use client";

import { useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import { inputVariants } from "../Input/variants";
import type { NumberInputProps } from "./types";

export type * from "./types";

/** Decimal places in `step`, so stepping doesn't pick up float noise (0.1 + 0.2). */
function decimals(step: number) {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * A number box with − and + buttons. Typing is free (a half-typed "-" or "1."
 * is fine); the number settles, within `min` and `max`, when you leave the box.
 * Arrow keys step (Shift: ×10), Home and End go to `min` and `max`. Controlled
 * with `value`, or uncontrolled with `defaultValue`; `null` means empty.
 */
export function NumberInput({
  value,
  defaultValue,
  onChange,
  min,
  max,
  step = 1,
  decimal,
  buttons = true,
  disabled,
  readOnly,
  className,
  onBlur,
  onKeyDown,
  ...props
}: NumberInputProps) {
  const [number, setNumber] = useControllable(value, defaultValue ?? null, onChange);
  // What's typed but not yet settled.
  const [draft, setDraft] = useState<string | null>(null);
  const allowDecimals = decimal ?? decimals(step) > 0;
  const pattern = allowDecimals ? /^-?\d*[.,]?\d*$/ : /^-?\d*$/;
  const fixed = !disabled && !readOnly;

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  function commit(next: number | null) {
    setDraft(null);
    if (next !== number) setNumber(next);
  }

  function parse(text: string) {
    const n = Number.parseFloat(text.replace(",", "."));
    return Number.isNaN(n) ? null : clamp(allowDecimals ? n : Math.round(n));
  }

  function stepBy(delta: number) {
    const base = (draft !== null ? parse(draft) : number) ?? min ?? 0;
    // As precise as the step or the starting number, whichever is finer.
    const places = Math.min(20, Math.max(decimals(step), decimals(base)));
    commit(clamp(Number((base + delta).toFixed(places))));
  }

  const atMin = min !== undefined && number !== null && number <= min;
  const atMax = max !== undefined && number !== null && number >= max;

  return (
    <div className={cn(inputVariants({ frame: true }), "flex items-stretch px-0 pointer-coarse:h-11", className)}>
      {buttons && (
        <StepButton label="Decrease" disabled={!fixed || atMin} onStep={() => stepBy(-step)}>
          <Minus className="size-3.5" />
        </StepButton>
      )}
      <input
        {...props}
        type="text"
        inputMode={allowDecimals ? "decimal" : "numeric"}
        role="spinbutton"
        aria-valuenow={number ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        value={draft ?? (number === null ? "" : String(number))}
        onChange={(event) => {
          if (pattern.test(event.target.value)) setDraft(event.target.value);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (draft !== null) commit(parse(draft));
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || !fixed) return;
          const big = event.shiftKey ? 10 : 1;
          if (event.key === "ArrowUp") stepBy(step * big);
          else if (event.key === "ArrowDown") stepBy(-step * big);
          else if (event.key === "Home" && min !== undefined) commit(min);
          else if (event.key === "End" && max !== undefined) commit(max);
          else if (event.key === "Enter" && draft !== null) commit(parse(draft));
          else return;
          if (event.key !== "Enter") event.preventDefault();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted pointer-coarse:text-base",
          buttons ? "text-center" : "px-3",
        )}
      />
      {buttons && (
        <StepButton label="Increase" disabled={!fixed || atMax} onStep={() => stepBy(step)}>
          <Plus className="size-3.5" />
        </StepButton>
      )}
    </div>
  );
}

/** − or +: by pointer only (the arrow keys do the same from the box). */
function StepButton({ label, disabled, onStep, children }: { label: string; disabled: boolean; onStep: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      // Keep focus (and a half-typed number) in the box.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onStep}
      className="flex w-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted pointer-coarse:w-11"
    >
      {children}
    </button>
  );
}

export default NumberInput;
