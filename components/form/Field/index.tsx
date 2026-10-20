"use client";

import type { FC } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldContext } from "./context";
import type { FieldProps } from "./types";

export { useFieldAria } from "./context";
export type { FieldProps } from "./types";

/**
 * A label, its control (the child) and a hint or error under it. Controls
 * from components/form pick up the hint or error as their description, and
 * the error as invalid, on their own (see useFieldAria).
 */
export const Field: FC<FieldProps> = ({ label, htmlFor, hint, error, optional, className, children, ...props }) => {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div {...props} className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-sm font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      <FieldContext value={{ describedBy, invalid: Boolean(error) }}>{children}</FieldContext>
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs text-danger">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default Field;
