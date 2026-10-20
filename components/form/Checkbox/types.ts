import type { ComponentPropsWithRef, ReactNode } from "react";

/** On, off, or "indeterminate" (a dash: some but not all, e.g. a "select all" box). */
export type CheckedState = boolean | "indeterminate";

export type CheckboxType =
    | "checkbox"
    | "switch";

/** The input's own props, minus the ones the checkbox redefines. */
type InputProps = Omit<ComponentPropsWithRef<"input">, "type" | "checked" | "defaultChecked" | "onChange" | "children">;

type BaseCheckboxProps = InputProps & {
    /** The label, beside the box. */
    children?: ReactNode;
    /** A second, quieter line under the label. */
    description?: ReactNode;
    /** Clicking always settles on on or off. */
    onChange?: (checked: boolean) => void;
};

export type BoxCheckboxProps = BaseCheckboxProps & {
    type?: "checkbox";
    checked?: CheckedState;
    defaultChecked?: CheckedState;
};

/** Switches are on or off: there's no "indeterminate". */
export type SwitchCheckboxProps = BaseCheckboxProps & {
    type: "switch";
    checked?: boolean;
    defaultChecked?: boolean;
};

export type CheckboxProps =
    | BoxCheckboxProps
    | SwitchCheckboxProps;
