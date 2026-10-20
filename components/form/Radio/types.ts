import type { ComponentPropsWithRef, ReactNode } from "react";

/**
 * How a group's options look: classic circles ("radio"), separate buttons
 * ("button"), or one joined bar ("segment"). On/off choices are a
 * <Switch>, not a radio group.
 */
export type RadioType =
    | "radio"
    | "button"
    | "segment";

/** The input's own props, minus the ones the group decides. */
type InputProps = Omit<
    ComponentPropsWithRef<"input">,
    "type" | "value" | "checked" | "defaultChecked" | "onChange" | "name" | "required" | "children"
>;

export type RadioProps = InputProps & {
    value: string;
    /** The label. */
    children?: ReactNode;
    /** A second, quieter line under the label. */
    description?: ReactNode;
    /**
     * Shown before the label (buttons and segments). It can follow the choice
     * with `group-data-checked:` classes, e.g. "text-muted group-data-checked:text-accent".
     */
    icon?: ReactNode;
};
