import type { ReactNode } from "react";

export type ListboxOption = {
    value: string;
    label: string;
    /** A second, quieter line. */
    description?: string;
    /** Shown before the label. */
    icon?: ReactNode;
    disabled?: boolean;
};

type BaseListboxProps = {
    options: ListboxOption[];
    /** Submits with a form: one hidden input per chosen value, under this name. */
    name?: string;
    disabled?: boolean;
    /** Shown when there are no options. */
    emptyText?: ReactNode;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-invalid"?: boolean;
};

export type SingleListboxProps = BaseListboxProps & {
    multiple?: false;
    /** `null` for nothing chosen. */
    value?: string | null;
    defaultValue?: string | null;
    onChange?: (value: string | null) => void;
};

export type MultipleListboxProps = BaseListboxProps & {
    multiple: true;
    value?: string[];
    defaultValue?: string[];
    onChange?: (value: string[]) => void;
};

export type ListboxProps =
    | SingleListboxProps
    | MultipleListboxProps;
