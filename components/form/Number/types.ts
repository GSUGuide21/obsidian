import type { ComponentPropsWithRef } from "react";

/** The input's own props, minus the ones the number field redefines. */
type InputProps = Omit<
    ComponentPropsWithRef<"input">,
    "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step" | "size" | "inputMode"
>;

export type NumberInputProps = InputProps & {
    /** `null` while empty. */
    value?: number | null;
    defaultValue?: number | null;
    onChange?: (value: number | null) => void;
    min?: number;
    max?: number;
    /** What the buttons and arrow keys add or take away (Shift: ten times as much). Default 1. */
    step?: number;
    /** Allow decimals. Default: only when `step` has them. */
    decimal?: boolean;
    /** Show − and + buttons. Default true. */
    buttons?: boolean;
};
