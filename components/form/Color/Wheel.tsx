"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useColorPicker } from "./Context";
import { clamp, cssColor } from "./convert";

const HUES = "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

/**
 * Hue around the wheel (red at the top, clockwise) and saturation from the
 * center out; brightness is a separate slider. Drag on it, or use Left/Right
 * for hue and Up/Down for saturation (Shift for bigger steps).
 */
export function Wheel({ className }: { className?: string }) {
  const { hsva, setHsva, disabled } = useColorPicker();
  const dragging = useRef(false);

  function pick(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = Math.min(rect.width, rect.height) / 2;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    setHsva({ ...hsva, h: (angle + 360) % 360, s: clamp(Math.hypot(dx, dy) / radius, 0, 1) * 100 });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const hueStep = event.shiftKey ? 15 : 1;
    const satStep = event.shiftKey ? 10 : 1;
    const next =
      event.key === "ArrowRight" ? { h: (hsva.h + hueStep) % 360 }
      : event.key === "ArrowLeft" ? { h: (hsva.h - hueStep + 360) % 360 }
      : event.key === "ArrowUp" ? { s: clamp(hsva.s + satStep, 0, 100) }
      : event.key === "ArrowDown" ? { s: clamp(hsva.s - satStep, 0, 100) }
      : null;
    if (!next || disabled) return;
    event.preventDefault();
    setHsva({ ...hsva, ...next });
  }

  // The thumb: at the hue's angle, as far out as the saturation.
  const radians = (hsva.h * Math.PI) / 180;
  const left = 50 + (Math.sin(radians) * hsva.s) / 2;
  const top = 50 - (Math.cos(radians) * hsva.s) / 2;

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Hue and saturation"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsva.h)}
      aria-valuetext={`Hue ${Math.round(hsva.h)} degrees, saturation ${Math.round(hsva.s)}%`}
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
        "relative mx-auto aspect-square w-full max-w-64 touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        disabled ? "opacity-50" : "cursor-crosshair",
        className,
      )}
      style={{ backgroundImage: `radial-gradient(closest-side, #fff, transparent), ${HUES}` }}
    >
      {/* Darkens the wheel to the current brightness. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-black"
        style={{ opacity: 1 - hsva.v / 100 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30 pointer-coarse:size-6"
        style={{ left: `${left}%`, top: `${top}%`, backgroundColor: cssColor({ ...hsva, a: 1 }) }}
      />
    </div>
  );
}
