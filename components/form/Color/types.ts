export type ColorPickerType = 
    | "native"
    | "wheel"
    | "palette"
    | "gradient"

export type HEXString = `#${string}`;

export type HEXColor = {
    type: 'hex';
    value: HEXString;
}

export type RGBObject = {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export type RGBColor = {
    type: 'rgb';
    value: RGBObject | [number, number, number, number?];
}

export type HSLObject = {
    h: number;
    s: number;
    l: number;
    a?: number;
}

export type HSLColor = {
    type: 'hsl';
    value: HSLObject | [number, number, number, number?];
}

export type HSVObject = {
    h: number;
    s: number;
    v: number;
    a?: number;
}

export type HSVColor = {
    type: 'hsv';
    value: HSVObject | [number, number, number, number?];
}

export type CMYKObject = {
    c: number;
    m: number;
    y: number;
    k: number;
    a?: number;
}

export type CMYKColor = {
    type: 'cmyk';
    value: CMYKObject | [number, number, number, number, number?];
}

export type Color = HEXColor | RGBColor | HSLColor | HSVColor | CMYKColor;

export type ColorType = Color['type'];

/**
 * Every channel present. Ranges: r/g/b 0–255; h 0–360; s/l/v and c/m/y/k
 * 0–100; a (alpha) 0–1.
 */
export type RGBA = Required<RGBObject>;
export type HSLA = Required<HSLObject>;
export type HSVA = Required<HSVObject>;
export type CMYKA = Required<CMYKObject>;

export type ColorPickerProps = {
    /** How you pick: a saturation/brightness area ("gradient", the default), a hue wheel, swatches, or the browser's own picker. */
    type?: ColorPickerType;
    value?: Color;
    defaultValue?: Color;
    onChange?: (color: Color) => void;
    /** The format `onChange` reports in. Default: `value`'s (or `defaultValue`'s), else hex. */
    format?: ColorType;
    /** Offer an opacity slider (not for "native"). Default false. */
    alpha?: boolean;
    /** The "palette" type's swatches. */
    palette?: HEXString[];
    /** Show hex/RGB/HSL fields. Default true. */
    inputs?: boolean;
    disabled?: boolean;
    id?: string;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
}

export type ColorPickerContextType = {
    /** The current color, in the picker's output format. */
    color: Color;
    setColor: (color: Color) => void;
    /** What the parts edit: the hue keeps its place while the color is gray. */
    hsva: HSVA;
    setHsva: (hsva: HSVA) => void;
    /** Opacity is editable. */
    alpha: boolean;
    disabled: boolean;
}