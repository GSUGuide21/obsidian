import type { CMYKA, Color, ColorType, HEXString, HSLA, HSVA, RGBA } from "./types";

// Conversions between color formats. The picker edits HSVA (see types.ts for
// the ranges); everything else is converted to and from it.

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const round = (n: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** A color's channels in order, whether it was given as an object or a tuple. */
function channels(value: object | readonly (number | undefined)[], keys: string[]) {
  return Array.isArray(value)
    ? (value as (number | undefined)[])
    : keys.map((key) => (value as Record<string, number | undefined>)[key]);
}

/** A finite number within range, or `fallback`. */
function channel(n: number | undefined, fallback: number, min: number, max: number) {
  return typeof n === "number" && Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

/** "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (the "#" optional); null if it isn't one. */
export function parseHex(text: string): RGBA | null {
  const hex = text.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const byte = (at: number) => parseInt(full.slice(at, at + 2), 16);
  return { r: byte(0), g: byte(2), b: byte(4), a: full.length === 8 ? round(byte(6) / 255, 3) : 1 };
}

/** "#rrggbb", or "#rrggbbaa" with `withAlpha`. */
export function rgbaToHex({ r, g, b, a }: RGBA, withAlpha = false): HEXString {
  const byte = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}${withAlpha ? byte(a * 255) : ""}`;
}

export function hsvaToRgba({ h, s, v, a }: HSVA): RGBA {
  const sat = s / 100;
  const val = v / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

/** HSVA from RGBA; gray has no hue, so it keeps `fallbackHue`. */
export function rgbaToHsva({ r, g, b, a }: RGBA, fallbackHue = 0): HSVA {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const delta = max - Math.min(rf, gf, bf);
  let h = fallbackHue;
  if (delta > 0) {
    if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
    else if (max === gf) h = 60 * ((bf - rf) / delta + 2);
    else h = 60 * ((rf - gf) / delta + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100, a };
}

export function hsvaToHsla({ h, s, v, a }: HSVA): HSLA {
  const sv = s / 100;
  const vv = v / 100;
  const l = vv * (1 - sv / 2);
  const sl = l === 0 || l === 1 ? 0 : (vv - l) / Math.min(l, 1 - l);
  return { h, s: sl * 100, l: l * 100, a };
}

export function hslaToHsva({ h, s, l, a }: HSLA): HSVA {
  const sl = s / 100;
  const ll = l / 100;
  const v = ll + sl * Math.min(ll, 1 - ll);
  return { h, s: v === 0 ? 0 : 2 * (1 - ll / v) * 100, v: v * 100, a };
}

function rgbaToCmyka({ r, g, b, a }: RGBA): CMYKA {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(rf, gf, bf);
  const part = (x: number) => (k >= 1 ? 0 : ((1 - x - k) / (1 - k)) * 100);
  return { c: part(rf), m: part(gf), y: part(bf), k: k * 100, a };
}

function cmykaToRgba({ c, m, y, k, a }: CMYKA): RGBA {
  const ink = (x: number) => 255 * (1 - x / 100) * (1 - k / 100);
  return { r: ink(c), g: ink(m), b: ink(y), a };
}

/** Any color as HSVA. Where its hue is undefined (gray), it keeps `fallbackHue`. */
export function toHsva(color: Color, fallbackHue = 0): HSVA {
  switch (color.type) {
    case "hex":
      return rgbaToHsva(parseHex(color.value) ?? BLACK, fallbackHue);
    case "rgb": {
      const [r, g, b, a] = channels(color.value, ["r", "g", "b", "a"]);
      return rgbaToHsva(
        { r: channel(r, 0, 0, 255), g: channel(g, 0, 0, 255), b: channel(b, 0, 0, 255), a: channel(a, 1, 0, 1) },
        fallbackHue,
      );
    }
    case "hsl": {
      const [h, s, l, a] = channels(color.value, ["h", "s", "l", "a"]);
      return hslaToHsva({ h: channel(h, fallbackHue, 0, 360), s: channel(s, 0, 0, 100), l: channel(l, 0, 0, 100), a: channel(a, 1, 0, 1) });
    }
    case "hsv": {
      const [h, s, v, a] = channels(color.value, ["h", "s", "v", "a"]);
      return { h: channel(h, fallbackHue, 0, 360), s: channel(s, 0, 0, 100), v: channel(v, 0, 0, 100), a: channel(a, 1, 0, 1) };
    }
    case "cmyk": {
      const [c, m, y, k, a] = channels(color.value, ["c", "m", "y", "k", "a"]);
      return rgbaToHsva(
        cmykaToRgba({
          c: channel(c, 0, 0, 100),
          m: channel(m, 0, 0, 100),
          y: channel(y, 0, 0, 100),
          k: channel(k, 0, 0, 100),
          a: channel(a, 1, 0, 1),
        }),
        fallbackHue,
      );
    }
  }
}

/**
 * HSVA as a color of `type`, rounded for display (whole numbers; alpha to two
 * places). Alpha is included only when `alpha` is on.
 */
export function fromHsva(hsva: HSVA, type: ColorType, alpha: boolean): Color {
  const a = alpha ? round(hsva.a, 2) : 1;
  const withAlpha = alpha ? { a } : {};
  switch (type) {
    case "hex":
      return { type, value: rgbaToHex({ ...hsvaToRgba(hsva), a }, alpha && a < 1) };
    case "rgb": {
      const { r, g, b } = hsvaToRgba(hsva);
      return { type, value: { r: Math.round(r), g: Math.round(g), b: Math.round(b), ...withAlpha } };
    }
    case "hsl": {
      const { h, s, l } = hsvaToHsla(hsva);
      return { type, value: { h: round(h) % 360, s: round(s), l: round(l), ...withAlpha } };
    }
    case "hsv":
      return { type, value: { h: round(hsva.h) % 360, s: round(hsva.s), v: round(hsva.v), ...withAlpha } };
    case "cmyk": {
      const { c, m, y, k } = rgbaToCmyka(hsvaToRgba(hsva));
      return { type, value: { c: round(c), m: round(m), y: round(y), k: round(k), ...withAlpha } };
    }
  }
}

/** One string per visible color (two values with the same key look the same). */
export function colorKey(color: Color) {
  return rgbaToHex(hsvaToRgba(toHsva(color)), true);
}

/** For CSS: "rgb(r g b / a)". */
export function cssColor(hsva: HSVA) {
  const { r, g, b } = hsvaToRgba(hsva);
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${round(hsva.a, 3)})`;
}

/** The pure hue, fully saturated, for CSS. */
export function hueCss(h: number) {
  return `hsl(${round(h, 1)} 100% 50%)`;
}

/** A checkerboard behind translucent colors, so their opacity shows. */
export const CHECKERBOARD = "repeating-conic-gradient(#d4d4d8 0 25%, #ffffff 0 50%) 0 0 / 10px 10px";
