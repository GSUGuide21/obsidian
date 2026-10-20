"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Canvas } from "./Canvas";
import { ColorPickerContext, useColorPicker } from "./Context";
import { CHECKERBOARD, colorKey, cssColor, fromHsva, hsvaToRgba, parseHex, rgbaToHex, rgbaToHsva, toHsva } from "./convert";
import { DEFAULT_PALETTE, Palette } from "./Palette";
import { ColorSlider } from "./Slider";
import { HSLStats } from "./Stats/HSL";
import { RGBStats } from "./Stats/RGB";
import type { Color, ColorPickerContextType, ColorPickerProps, HSVA } from "./types";
import { Wheel } from "./Wheel";

export { Canvas, ColorSlider, HSLStats, Palette, RGBStats, useColorPicker, Wheel };
export type * from "./types";

const FALLBACK: Color = { type: "hex", value: "#7c3aed" };

/**
 * A color picker. `type` picks the layout: a saturation/brightness area with a
 * hue slider ("gradient"), a hue wheel with a brightness slider ("wheel"),
 * swatches ("palette") or the browser's own picker ("native"). Controlled with
 * `value`, or uncontrolled with `defaultValue`; `onChange` reports in `format`.
 * Its parts are exported too, for custom layouts inside a <ColorPicker>.
 */
export default function ColorPicker({
  type = "gradient",
  value,
  defaultValue,
  onChange,
  format,
  alpha: alphaProp = false,
  palette = DEFAULT_PALETTE,
  inputs = true,
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: ColorPickerProps) {
  // The browser's picker has no opacity.
  const alpha = alphaProp && type !== "native";
  const outputType = format ?? value?.type ?? defaultValue?.type ?? "hex";
  const opaque = (hsva: HSVA): HSVA => (alpha ? hsva : { ...hsva, a: 1 });

  // What the parts edit, and the key of the color it was last in sync with.
  const [state, setState] = useState(() => {
    const start = value ?? defaultValue ?? FALLBACK;
    return { hsva: opaque(toHsva(start)), key: colorKey(start) };
  });
  // A different color from the parent (not one we just reported): start from
  // it, keeping the hue where it has none (gray).
  if (value && colorKey(value) !== state.key) {
    setState({ hsva: opaque(toHsva(value, state.hsva.h)), key: colorKey(value) });
  }

  function setHsva(next: HSVA) {
    const hsva = opaque(next);
    const color = fromHsva(hsva, outputType, alpha);
    setState({ hsva, key: colorKey(color) });
    onChange?.(color);
  }

  const context: ColorPickerContextType = {
    color: fromHsva(state.hsva, outputType, alpha),
    setColor: (color) => setHsva(toHsva(color, state.hsva.h)),
    hsva: state.hsva,
    setHsva,
    alpha,
    disabled,
  };

  return (
    <ColorPickerContext.Provider value={context}>
      <div
        id={id}
        role="group"
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Color picker")}
        aria-labelledby={ariaLabelledby}
        className={cn("flex w-full max-w-72 flex-col gap-3", className)}
      >
        {type === "native" ? (
          <NativePicker />
        ) : type === "palette" ? (
          <Palette colors={palette} />
        ) : (
          <>
            {type === "wheel" ? <Wheel /> : <Canvas />}
            <div className="flex items-center gap-3">
              <Swatch hsva={state.hsva} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <ColorSlider channel={type === "wheel" ? "value" : "hue"} />
                {alpha && <ColorSlider channel="alpha" />}
              </div>
            </div>
          </>
        )}
        {inputs && <Fields showModes={type !== "native"} />}
      </div>
    </ColorPickerContext.Provider>
  );
}

/** The current color, over a checkerboard so its opacity shows. */
function Swatch({ hsva }: { hsva: HSVA }) {
  return (
    <span
      aria-hidden
      className="size-9 shrink-0 rounded-lg ring-1 ring-black/10 ring-inset"
      style={{ background: `linear-gradient(${cssColor(hsva)}, ${cssColor(hsva)}), ${CHECKERBOARD}` }}
    />
  );
}

/** The browser's own color picker (hex, no opacity). */
function NativePicker() {
  const { hsva, setColor, disabled } = useColorPicker();
  return (
    <input
      type="color"
      aria-label="Color"
      disabled={disabled}
      value={rgbaToHex(hsvaToRgba(hsva))}
      onChange={(event) => {
        const parsed = parseHex(event.target.value);
        if (parsed) setColor({ type: "hex", value: rgbaToHex(parsed) });
      }}
      className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface-2 p-1 disabled:cursor-default disabled:opacity-50"
    />
  );
}

type Mode = "hex" | "rgb" | "hsl";
const MODES: { mode: Mode; label: string }[] = [
  { mode: "hex", label: "Hex" },
  { mode: "rgb", label: "RGB" },
  { mode: "hsl", label: "HSL" },
];

/** Type a color: as hex, or (with `showModes`) as RGB or HSL channels. */
function Fields({ showModes }: { showModes: boolean }) {
  const [mode, setMode] = useState<Mode>("hex");
  const shown = showModes ? mode : "hex";
  return (
    <div className="flex flex-col gap-2">
      {showModes && (
        <div role="radiogroup" aria-label="Color format" className="flex gap-0.5 self-start rounded-lg bg-surface-2 p-0.5 text-[11px] font-medium">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={mode === option.mode}
              onClick={() => setMode(option.mode)}
              className={cn(
                "rounded-md px-2 py-0.5 transition-colors pointer-coarse:px-3 pointer-coarse:py-1.5",
                mode === option.mode ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {shown === "hex" ? <HexField /> : shown === "rgb" ? <RGBStats /> : <HSLStats />}
    </div>
  );
}

/** "#rrggbb" (or "#rrggbbaa" while translucent); applies as soon as what's typed is valid. */
function HexField() {
  const { hsva, setHsva, alpha, disabled } = useColorPicker();
  const [draft, setDraft] = useState<string | null>(null);
  const hex = rgbaToHex(hsvaToRgba(hsva), alpha && hsva.a < 1);
  return (
    <input
      aria-label="Hex color"
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      maxLength={alpha ? 9 : 7}
      disabled={disabled}
      value={draft ?? hex}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parseHex(text);
        if (parsed) setHsva(rgbaToHsva(parsed, hsva.h));
      }}
      onBlur={() => setDraft(null)}
      // 16px text on touch screens: iOS zooms in on focusing anything smaller.
      className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 font-mono text-sm text-foreground uppercase outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:text-base"
    />
  );
}
