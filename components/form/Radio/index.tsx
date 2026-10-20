"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { RadioGroup, useRadioGroup } from "./Group";
import type { RadioProps } from "./types";

export { RadioGroup, useRadioGroup };
export type * from "./types";
export type * from "./Group/types";

/** One option of a <Radio.Group>, drawn the way the group's `type` says. */
function RadioItem({ value, children, description, icon, disabled: ownDisabled, className, id, ...props }: RadioProps) {
  const group = useRadioGroup();
  const checked = group.value === value;
  const disabled = group.disabled || ownDisabled;
  const autoId = useId();
  const descriptionId = `${id ?? autoId}-description`;

  const input = (
    <input
      {...props}
      id={id}
      type="radio"
      name={group.name}
      value={value}
      checked={checked}
      required={group.required}
      disabled={disabled}
      aria-describedby={description ? descriptionId : undefined}
      onChange={() => group.select(value)}
      className="peer sr-only"
    />
  );
  const segment = group.type === "segment";
  const label = (
    <span className={cn("flex min-w-0 flex-col gap-0.5", group.type === "button" && description && "font-medium")}>
      {children && <span className={cn(segment && "truncate")}>{children}</span>}
      {description && (
        <span id={descriptionId} className={cn("text-xs font-normal", segment ? "sr-only" : "text-muted")}>
          {description}
        </span>
      )}
    </span>
  );

  if (group.type === "radio") {
    return (
      <label
        data-checked={checked || undefined}
        className={cn(
          "inline-flex items-start gap-2.5 text-sm",
          disabled ? "cursor-default opacity-50" : "cursor-pointer",
          className,
        )}
      >
        {input}
        <span
          aria-hidden
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border bg-surface-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/30 pointer-coarse:size-5",
            checked ? "border-accent" : "border-input",
          )}
        >
          {checked && <span className="size-2 rounded-full bg-accent pointer-coarse:size-2.5" />}
        </span>
        {label}
      </label>
    );
  }

  const vertical = group.orientation === "vertical";
  return (
    <label
      data-checked={checked || undefined}
      className={cn(
        "group inline-flex min-w-0 gap-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-accent/30",
        // Stacked options fill the row and line up on the left; side by side they're centered.
        vertical ? "items-start justify-start" : "items-center justify-center",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        segment
          ? cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium whitespace-nowrap pointer-coarse:py-2",
              checked ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )
          : cn(
              "gap-3 rounded-lg border px-3 py-2 text-left pointer-coarse:py-2.5",
              description && "py-2.5",
              checked ? "border-accent bg-accent/10 text-foreground" : "border-border bg-surface-2 hover:border-muted",
            ),
        className,
      )}
    >
      {input}
      {icon && <span className={cn("flex shrink-0", vertical && "mt-0.5")}>{icon}</span>}
      {label}
    </label>
  );
}

/** `<Radio.Group>` holds the choice; each `<Radio value>` is one option. */
export const Radio = Object.assign(RadioItem, { Group: RadioGroup });

export default Radio;
