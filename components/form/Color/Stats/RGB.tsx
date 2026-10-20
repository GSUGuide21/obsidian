"use client";

import { useColorPicker } from "../Context";
import { hsvaToRgba, rgbaToHsva } from "../convert";
import type { RGBA } from "../types";
import { Channel } from "./Channel";

/** Red, green and blue fields (0–255), plus opacity (%) when it's editable. */
export function RGBStats() {
  const { hsva, setHsva, alpha, disabled } = useColorPicker();
  const rgba = hsvaToRgba(hsva);
  // Gray has no hue: keep the current one so the hue slider doesn't jump.
  const set = (patch: Partial<RGBA>) => setHsva(rgbaToHsva({ ...rgba, ...patch }, hsva.h));
  return (
    <div className="flex gap-2">
      <Channel label="R" name="Red" value={rgba.r} max={255} disabled={disabled} onCommit={(r) => set({ r })} />
      <Channel label="G" name="Green" value={rgba.g} max={255} disabled={disabled} onCommit={(g) => set({ g })} />
      <Channel label="B" name="Blue" value={rgba.b} max={255} disabled={disabled} onCommit={(b) => set({ b })} />
      {alpha && (
        <Channel
          label="A"
          name="Opacity (%)"
          value={hsva.a * 100}
          max={100}
          disabled={disabled}
          onCommit={(a) => setHsva({ ...hsva, a: a / 100 })}
        />
      )}
    </div>
  );
}
