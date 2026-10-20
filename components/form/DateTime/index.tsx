"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../Field/context";
import { inputVariants, type InputVariants } from "../Input/variants";

export type DateTimeInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "size"> &
  Pick<InputVariants, "size"> & {
    /** A moment, as a timestamp (ms); `null` while empty or incomplete. Shown in local time. */
    value?: number | null;
    defaultValue?: number | null;
    onChange?: (value: number | null) => void;
    /** Earliest and latest choosable, as timestamps. */
    min?: number;
    max?: number;
  };

const pad = (n: number) => String(n).padStart(2, "0");

/** A timestamp as <input type="datetime-local"> wants it: "YYYY-MM-DDTHH:MM", local time. */
export function toLocalInput(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The input's value back as a timestamp (read as local time), or `null`. */
export function fromLocalInput(value: string) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * A date and time, with the browser's own picker. Unlike <DateInput> its value
 * is a moment (a timestamp), since a time only means something in a time zone:
 * the viewer's.
 */
export function DateTimeInput({ value, defaultValue, onChange, min, max, size, className, ...props }: DateTimeInputProps) {
  const show = (timestamp: number | null | undefined) =>
    timestamp === undefined ? undefined : timestamp === null ? "" : toLocalInput(timestamp);
  const aria = useFieldAria(props);
  return (
    <input
      {...props}
      {...aria}
      type="datetime-local"
      value={show(value)}
      defaultValue={show(defaultValue)}
      min={show(min)}
      max={show(max)}
      onChange={(event) => onChange?.(fromLocalInput(event.target.value))}
      className={cn(inputVariants({ size }), className)}
    />
  );
}

export default DateTimeInput;
