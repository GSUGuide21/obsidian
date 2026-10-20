import { createContext, useContext, type AriaAttributes } from "react";

/** What a <Field> tells the control inside it. */
export type FieldControl = {
  /** The id of its hint or error, whichever is showing. */
  describedBy?: string;
  /** It's showing an error. */
  invalid: boolean;
};

export const FieldContext = createContext<FieldControl | null>(null);

/**
 * The aria props for a control inside a <Field>: its hint or error as the
 * description, and whether it's invalid. A control's own props add to (or,
 * for `aria-invalid`, win over) the field's. Outside a field, just its own.
 */
export function useFieldAria(own: Pick<AriaAttributes, "aria-describedby" | "aria-invalid">) {
  const field = useContext(FieldContext);
  const describedBy = [field?.describedBy, own["aria-describedby"]].filter(Boolean).join(" ");
  return {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": own["aria-invalid"] ?? (field?.invalid || undefined),
  };
}
