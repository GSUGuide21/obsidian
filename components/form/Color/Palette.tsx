"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn, readableOn } from "@/lib/utils";
import { useColorPicker } from "./Context";
import { hsvaToRgba, rgbaToHex } from "./convert";
import type { HEXString } from "./types";

export const DEFAULT_PALETTE: HEXString[] = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
  "#000000", "#525252", "#a3a3a3", "#d4d4d4", "#f5f5f5", "#ffffff",
];

/** A set of swatches to choose from (a radio group: arrow keys move between them). */
export function Palette({ colors = DEFAULT_PALETTE, className }: { colors?: HEXString[]; className?: string }) {
  const { hsva, setColor, disabled } = useColorPicker();
  const name = useId();
  const current = rgbaToHex(hsvaToRgba(hsva));
  return (
    <div role="radiogroup" aria-label="Colors" className={cn("flex flex-wrap gap-2", className)}>
      {colors.map((swatch) => {
        const checked = current === swatch.toLowerCase();
        return (
          <label key={swatch} className={cn("relative", disabled ? "opacity-50" : "cursor-pointer")}>
            <input
              type="radio"
              name={name}
              value={swatch}
              checked={checked}
              disabled={disabled}
              onChange={() => setColor({ type: "hex", value: swatch })}
              aria-label={swatch}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-md ring-1 ring-black/10 ring-inset ring-offset-2 ring-offset-surface transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-accent pointer-coarse:size-10",
                checked && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: swatch }}
            >
              {checked && <Check aria-hidden className="size-4" style={{ color: readableOn(swatch) }} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}
