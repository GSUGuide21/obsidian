import type { ComponentPropsWithRef, CSSProperties } from "react";

export type SliderOrientation =
    | "horizontal"
    | "vertical";

/** What single and double sliders share. */
type BaseSliderProps = {
    orientation?: SliderOrientation;
    /** Defaults: 0, 100 and 1. */
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    /** Submits with a form: one hidden input per thumb, under this name. */
    name?: string;
    /** Read out instead of the bare number, e.g. `(value) => \`${value} degrees\``. */
    getValueText?: (value: number) => string;
    /** Fill the track up to the value (or between the thumbs). Default true. */
    showRange?: boolean;
    /** Double sliders: the thumbs' accessible names. Default "Minimum" and "Maximum". */
    thumbLabels?: [string, string];
    trackClassName?: string;
    trackStyle?: CSSProperties;
    thumbClassName?: string;
    thumbStyle?: CSSProperties;
};

export type BaseSingleSliderProps = BaseSliderProps & {
    type?: "single";
    value?: number;
    defaultValue?: number;
    onChange?: (value: number) => void;
};

export type BaseDoubleSliderProps = BaseSliderProps & {
    type: "double";
    value?: [number, number];
    defaultValue?: [number, number];
    onChange?: (value: [number, number]) => void;
};

/** The root element's own props, minus the ones the slider redefines. */
type RootProps = Omit<ComponentPropsWithRef<"div">, "onChange" | "defaultValue" | "children">;

export type SingleSliderProps = RootProps & BaseSingleSliderProps;

export type DoubleSliderProps = RootProps & BaseDoubleSliderProps;

export type SliderProps =
    | SingleSliderProps
    | DoubleSliderProps;
