"use client";

import { createContext, useContext, useId } from "react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import type { RadioGroupContextType, RadioGroupProps } from "./types";

export type * from "./types";

export const RadioGroupContext = createContext<RadioGroupContextType | null>(null);

/** The group's choice and settings, for its <Radio> options. */
export function useRadioGroup() {
  const context = useContext(RadioGroupContext);
  if (!context) throw new Error("<Radio> must be rendered inside <Radio.Group>.");
  return context;
}

/**
 * Pick one of its <Radio> options. Controlled with `value`, or uncontrolled
 * with `defaultValue`. The options are native radio inputs sharing a name, so
 * arrow keys move between them and the choice submits with forms.
 */
export function RadioGroup<T extends string = string>({
  type = "radio",
  value,
  defaultValue,
  onChange,
  name,
  required = false,
  disabled = false,
  orientation = type === "radio" ? "vertical" : "horizontal",
  className,
  children,
  ...props
}: RadioGroupProps<T>) {
  const [current, setCurrent] = useControllable<string>(value, defaultValue ?? "", onChange as (value: string) => void);
  // Radios group by name: one is needed even when nothing is submitted.
  const autoName = useId();
  const vertical = orientation === "vertical";

  const context: RadioGroupContextType = {
    type,
    orientation,
    name: name ?? autoName,
    value: current,
    select: setCurrent,
    required,
    disabled,
  };

  return (
    <RadioGroupContext value={context}>
      <div
        {...props}
        role="radiogroup"
        aria-orientation={orientation}
        aria-required={required || undefined}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex",
          vertical ? "flex-col" : "flex-row flex-wrap",
          type === "radio" && (vertical ? "gap-2" : "gap-x-4 gap-y-2"),
          type === "button" && "gap-2",
          type === "segment" && cn("w-fit gap-0.5 rounded-lg bg-surface-2 p-0.5", !vertical && "flex-nowrap"),
          className,
        )}
      >
        {children}
      </div>
    </RadioGroupContext>
  );
}

export default RadioGroup;
