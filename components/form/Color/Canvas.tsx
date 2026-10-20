"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useColorPicker } from "./Context";
import { clamp, cssColor, hueCss } from "./convert";

/**
 * Saturation (left to right) and brightness (bottom to top) for the current
 * hue. Drag on it, or use the arrow keys (Shift for bigger steps).
 */
export function Canvas({ className }: { className?: string }) {
  const { hsva, setHsva, disabled } = useColorPicker();
  const dragging = useRef(false);

  function pick(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHsva({
      ...hsva,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
      v: (1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)) * 100,
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const by = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowRight: [by, 0],
      ArrowLeft: [-by, 0],
      ArrowUp: [0, by],
      ArrowDown: [0, -by],
    };
    const move = moves[event.key];
    if (!move || disabled) return;
    event.preventDefault();
    setHsva({ ...hsva, s: clamp(hsva.s + move[0], 0, 100), v: clamp(hsva.v + move[1], 0, 100) });
  }

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsva.s)}
      aria-valuetext={`Saturation ${Math.round(hsva.s)}%, brightness ${Math.round(hsva.v)}%`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        event.preventDefault();
        pick(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) pick(event);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      className={cn(
        // At most 40% of the screen's height, so on a phone the fields below stay in view.
        "relative aspect-4/3 max-h-[40dvh] w-full touch-none rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        disabled ? "opacity-50" : "cursor-crosshair",
        className,
      )}
      style={{
        backgroundColor: hueCss(hsva.h),
        backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30 pointer-coarse:size-6"
        style={{ left: `${hsva.s}%`, top: `${100 - hsva.v}%`, backgroundColor: cssColor({ ...hsva, a: 1 }) }}
      />
    </div>
  );
}
