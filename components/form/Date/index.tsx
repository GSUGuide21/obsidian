"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../Field/context";
import { inputVariants, type InputVariants } from "../Input/variants";

export type DateInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "size"> &
  Pick<InputVariants, "size"> & {
    /** "YYYY-MM-DD"; `null` while empty. A calendar date has no time zone, so it stays a string. */
    value?: string | null;
    defaultValue?: string | null;
    onChange?: (value: string | null) => void;
    /** Earliest and latest choosable, as "YYYY-MM-DD". */
    min?: string;
    max?: string;
  };

const pad = (n: number) => String(n).padStart(2, "0");

/** A timestamp's local date, as "YYYY-MM-DD". */
export function toDateString(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The start (local midnight) of a "YYYY-MM-DD" date, or `null`. Read alone, the string would parse as UTC. */
export function fromDateString(date: string) {
  const time = date ? new Date(`${date}T00:00`).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

/** Today as "YYYY-MM-DD", in local time (for `min`, say). */
export function today() {
  return toDateString(Date.now());
}

/** A calendar date, with the browser's own picker. */
export function DateInput({ value, defaultValue, onChange, size, className, ...props }: DateInputProps) {
  const aria = useFieldAria(props);
  return (
    <input
      {...props}
      {...aria}
      type="date"
      value={value === undefined ? undefined : (value ?? "")}
      defaultValue={defaultValue ?? undefined}
      onChange={(event) => onChange?.(event.target.value || null)}
      className={cn(inputVariants({ size }), className)}
    />
  );
}

export default DateInput;
