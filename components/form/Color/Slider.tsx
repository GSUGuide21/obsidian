"use client";

import Slider from "@/components/form/Slider";
import { useColorPicker } from "./Context";
import { CHECKERBOARD, cssColor, hueCss } from "./convert";
import type { HSVA } from "./types";

const HUES = "linear-gradient(to right, #f00 0%, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00 100%)";

type Channel = {
  label: string;
  max: number;
  value: number;
  /** The track's background: what moving along it does. */
  track: string;
  /** The thumb's background: the color at its position. */
  thumb: string;
  text: (value: number) => string;
  apply: (value: number) => HSVA;
};

/** A slider for one of the color's channels: hue, brightness ("value") or opacity ("alpha"). */
export function ColorSlider({ channel, className }: { channel: "hue" | "value" | "alpha"; className?: string }) {
  const { hsva, setHsva, disabled } = useColorPicker();
  const opaque = cssColor({ ...hsva, a: 1 });
  const config: Channel =
    channel === "hue"
      ? {
          label: "Hue",
          max: 360,
          value: hsva.h,
          track: HUES,
          thumb: hueCss(hsva.h),
          text: (v) => `${Math.round(v)} degrees`,
          // 360 is red again, like 0; kept as 360 so the thumb stays at the end (outputs report 0).
          apply: (v) => ({ ...hsva, h: v }),
        }
      : channel === "value"
        ? {
            label: "Brightness",
            max: 100,
            value: hsva.v,
            track: `linear-gradient(to right, #000, ${cssColor({ ...hsva, v: 100, a: 1 })})`,
            thumb: opaque,
            text: (v) => `${Math.round(v)}%`,
            apply: (v) => ({ ...hsva, v }),
          }
        : {
            label: "Opacity",
            max: 100,
            value: hsva.a * 100,
            track: `linear-gradient(to right, transparent, ${opaque}), ${CHECKERBOARD}`,
            thumb: `linear-gradient(${cssColor(hsva)}, ${cssColor(hsva)}), ${CHECKERBOARD}`,
            text: (v) => `${Math.round(v)}%`,
            apply: (v) => ({ ...hsva, a: v / 100 }),
          };

  return (
    <Slider
      aria-label={config.label}
      min={0}
      max={config.max}
      value={config.value}
      onChange={(v) => setHsva(config.apply(v))}
      getValueText={config.text}
      disabled={disabled}
      showRange={false}
      className={className}
      trackClassName="h-3 ring-1 ring-black/10 ring-inset pointer-coarse:h-4"
      trackStyle={{ background: config.track }}
      thumbClassName="size-5 border-white shadow-md ring-1 ring-black/25 pointer-coarse:size-7"
      thumbStyle={{ background: config.thumb }}
    />
  );
}
