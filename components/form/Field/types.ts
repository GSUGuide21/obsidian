import type { ComponentPropsWithRef } from "react";

export type FieldComponentProps = ComponentPropsWithRef<"div">;

export type FieldProps = FieldComponentProps & {
  label: string;
  /** The control's id: the label names it, and the hint or error describes it. */
  htmlFor: string;
  hint?: string;
  /** Shown instead of the hint, and marks the control invalid. */
  error?: string;
  /** Says "Optional" beside the label (rather than in the hint). */
  optional?: boolean;
};
