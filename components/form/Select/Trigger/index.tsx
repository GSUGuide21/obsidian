"use client";

import type { ComponentPropsWithRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../../Field/context";
import { inputVariants } from "../../Input/variants";

type SelectTriggerProps = ComponentPropsWithRef<"button"> & {
  open: boolean;
  /** What's chosen, as text; the placeholder shows while it's empty. */
  display?: string;
  placeholder?: string;
};

/**
 * The button of a dropdown select. It's a button (not a div) so a
 * <label htmlFor> names it; keys are the select's to handle.
 */
export function SelectTrigger({
  open,
  display,
  placeholder,
  className,
  "aria-controls": controls,
  ...props
}: SelectTriggerProps) {
  const aria = useFieldAria(props);
  return (
    <button
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        inputVariants(),
        "flex items-center gap-2 text-left disabled:cursor-default pointer-coarse:h-11",
        className,
      )}
      {...props}
      {...aria}
    >
      <span className={cn("min-w-0 flex-1 truncate", !display && "text-muted")}>{display || placeholder || "Choose…"}</span>
      <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
    </button>
  );
}

export default SelectTrigger;
