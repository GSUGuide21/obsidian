"use client";

import { useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import type { CheckboxProps, CheckedState } from "./types";

export type * from "./types";

/**
 * A checkbox, or an on/off switch (`type="switch"`), with its label. Controlled
 * with `checked`, or uncontrolled with `defaultChecked`. A native input does
 * the work underneath, so it submits with forms (`name`, `value`) and Space
 * toggles it.
 */
export function Checkbox({
  type = "checkbox",
  checked,
  defaultChecked,
  onChange,
  children,
  description,
  disabled,
  className,
  id,
  ref,
  "aria-describedby": describedBy,
  ...props
}: CheckboxProps) {
  const [state, setState] = useControllable<CheckedState>(checked, defaultChecked ?? false);
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current!, []);
  const autoId = useId();
  const descriptionId = `${id ?? autoId}-description`;
  const indeterminate = state === "indeterminate";
  const on = state === true;

  // "indeterminate" is a property only: there's no attribute for it.
  useLayoutEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={cn(
        "inline-flex items-start gap-2.5 text-sm",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        {...props}
        ref={inner}
        id={id}
        type="checkbox"
        role={type === "switch" ? "switch" : undefined}
        checked={on}
        disabled={disabled}
        aria-describedby={cn(description && descriptionId, describedBy) || undefined}
        onChange={(event) => {
          setState(event.target.checked);
          onChange?.(event.target.checked);
        }}
        className="peer sr-only"
      />
      {type === "switch" ? (
        <span
          aria-hidden
          className={cn(
            "relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/30 pointer-coarse:h-6 pointer-coarse:w-11",
            on ? "border-accent bg-accent" : "border-input bg-surface-2",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 size-3.5 rounded-full bg-white shadow transition-transform pointer-coarse:size-4.5",
              on && "translate-x-4 pointer-coarse:translate-x-5",
            )}
          />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/30 pointer-coarse:size-5",
            on || indeterminate ? "border-accent bg-accent text-accent-foreground" : "border-input bg-surface-2",
          )}
        >
          {on ? <Check className="size-3" strokeWidth={3} /> : indeterminate ? <Minus className="size-3" strokeWidth={3} /> : null}
        </span>
      )}
      {(children || description) && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {children && <span>{children}</span>}
          {description && (
            <span id={descriptionId} className="text-xs text-muted">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}

export default Checkbox;
