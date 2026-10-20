import type { ComponentPropsWithRef } from "react";
import type { RadioType } from "../types";

/** The root element's own props, minus the ones the group redefines. */
type RootProps = Omit<ComponentPropsWithRef<"div">, "onChange" | "defaultValue" | "dir">;

export type RadioGroupProps<T extends string = string> = RootProps & {
    /** How the options look. Default "radio". */
    type?: RadioType;
    /** The chosen option's value; `""` (controlled) or nothing for none yet. */
    value?: T | "";
    defaultValue?: T;
    onChange?: (value: T) => void;
    /** Submits with a form under this name. */
    name?: string;
    required?: boolean;
    disabled?: boolean;
    /** Which way the options are laid out. Default "vertical" for radios, "horizontal" otherwise. */
    orientation?: "horizontal" | "vertical";
};

export type RadioGroupContextType = {
    type: RadioType;
    orientation: "horizontal" | "vertical";
    name: string;
    value: string;
    select: (value: string) => void;
    required: boolean;
    disabled: boolean;
};
