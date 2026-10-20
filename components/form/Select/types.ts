import type { ReactNode } from "react";
import type { ListboxOption } from "../Listbox/types";

export type SelectOption = ListboxOption;

/**
 * - "dropdown": a button opening the list (the default).
 * - "combobox": a text box filtering the list; the value is an option's.
 * - "autocomplete": a text box suggesting from the list; the value is any text.
 * - "list": the list itself, shown in place.
 */
export type SingleSelectType =
    | "dropdown"
    | "combobox"
    | "autocomplete"
    | "list"

/** "tags": the chosen options as chips, with a text box filtering the rest. */
export type MultipleSelectType =
    | "dropdown"
    | "list"
    | "tags"

type BaseSelectProps = {
    options: SelectOption[];
    placeholder?: string;
    /** Submits with a form: one hidden input per chosen value, under this name. */
    name?: string;
    disabled?: boolean;
    required?: boolean;
    /** Text-box types ("combobox", "autocomplete", "tags"): the longest the typed text can be. */
    maxLength?: number;
    /** Shown when there's nothing to choose (or nothing matches what's typed). */
    emptyText?: ReactNode;
    /** Goes on the focusable part (the button or text box), so a <label htmlFor> names it. */
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}

export type SingleSelectProps = BaseSelectProps & {
    multiple?: false
    type?: Exclude<SingleSelectType, "autocomplete">
    /** The chosen option's value; `null` for none. */
    value?: string | null
    defaultValue?: string | null
    onChange?: (value: string | null) => void
}

export type AutocompleteSelectProps = BaseSelectProps & {
    multiple?: false
    type: "autocomplete"
    /** What's typed (or the label of the suggestion picked). */
    value?: string
    defaultValue?: string
    onChange?: (value: string) => void
}

export type MultipleSelectProps = BaseSelectProps & {
    multiple: true
    type?: MultipleSelectType
    /** The chosen options' values, in the options' order. */
    value?: string[]
    defaultValue?: string[]
    onChange?: (value: string[]) => void
}

export type SelectProps =
    | SingleSelectProps
    | AutocompleteSelectProps
    | MultipleSelectProps
