import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { inputVariants, type InputVariants } from "../Input/variants";

export type TimeInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step" | "size"> &
  Pick<InputVariants, "size"> & {
    /** "HH:MM" (24-hour; "HH:MM:SS" with `seconds`); `null` while empty. */
    value?: string | null;
    defaultValue?: string | null;
    onChange?: (value: string | null) => void;
    min?: string;
    max?: string;
    /** Ask for seconds too. */
    seconds?: boolean;
  };

/** A time of day, with the browser's own picker (shown in the viewer's 12- or 24-hour style). */
export function TimeInput({ value, defaultValue, onChange, seconds = false, size, className, ...props }: TimeInputProps) {
  return (
    <input
      {...props}
      type="time"
      step={seconds ? 1 : undefined}
      value={value === undefined ? undefined : (value ?? "")}
      defaultValue={defaultValue ?? undefined}
      onChange={(event) => onChange?.(event.target.value || null)}
      className={cn(inputVariants({ size }), className)}
    />
  );
}

export default TimeInput;
