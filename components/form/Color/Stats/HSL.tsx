"use client";

import { useColorPicker } from "../Context";
import { hslaToHsva, hsvaToHsla } from "../convert";
import type { HSLA } from "../types";
import { Channel } from "./Channel";

/** Hue (0–360), saturation and lightness (%) fields, plus opacity (%) when it's editable. */
export function HSLStats() {
  const { hsva, setHsva, alpha, disabled } = useColorPicker();
  const hsla = hsvaToHsla(hsva);
  const set = (patch: Partial<HSLA>) => setHsva(hslaToHsva({ ...hsla, ...patch }));
  return (
    <div className="flex gap-2">
      <Channel label="H" name="Hue (degrees)" value={hsla.h} max={360} disabled={disabled} onCommit={(h) => set({ h: h % 360 })} />
      <Channel label="S" name="Saturation (%)" value={hsla.s} max={100} disabled={disabled} onCommit={(s) => set({ s })} />
      <Channel label="L" name="Lightness (%)" value={hsla.l} max={100} disabled={disabled} onCommit={(l) => set({ l })} />
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
