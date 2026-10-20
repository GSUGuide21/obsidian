"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { SliderProps } from "./types";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Decimal places in `step`, so snapped values don't pick up float noise (0.1 + 0.2). */
function decimals(step: number) {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * A slider with one thumb (`type="single"`, the default) or two
 * (`type="double"`, a range). Controlled with `value`, or uncontrolled with
 * `defaultValue`. Drag anywhere on it, or use the arrow keys, Page Up/Down,
 * Home and End on a thumb. A single slider's `aria-label`/`aria-labelledby`
 * name its thumb; a double slider's name the group, and `thumbLabels` its thumbs.
 */
export const Slider = (props: SliderProps) => {
  const {
    type,
    orientation = "horizontal",
    min = 0,
    max = 100,
    step = 1,
    value,
    defaultValue,
    onChange,
    disabled = false,
    name,
    getValueText,
    showRange = true,
    thumbLabels,
    trackClassName,
    trackStyle,
    thumbClassName,
    thumbStyle,
    className,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    ...rest
  } = props;
  const double = type === "double";
  const vertical = orientation === "vertical";
  const span = max > min ? max - min : 1;
  const places = decimals(step);

  const toList = (v: number | readonly number[] | undefined) =>
    v === undefined ? undefined : typeof v === "number" ? [v] : [...v];
  const [internal, setInternal] = useState<number[]>(() => toList(defaultValue) ?? (double ? [min, max] : [min]));
  const values = (toList(value) ?? internal).map((v) => clamp(v, min, max));

  // The thumb being dragged, and each thumb's element (to focus the one you grab).
  const dragging = useRef<number | null>(null);
  const thumbs = useRef<(HTMLDivElement | null)[]>([]);

  const snap = (raw: number) =>
    clamp(Number((Math.round((raw - min) / step) * step + min).toFixed(places)), min, max);
  const percent = (v: number) => ((v - min) / span) * 100;

  /** The value under the pointer. */
  function valueAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = vertical
      ? (rect.bottom - event.clientY) / rect.height
      : (event.clientX - rect.left) / rect.width;
    return snap(min + clamp(ratio, 0, 1) * span);
  }

  /** Move thumb `index` to `next` (thumbs can't pass each other), and report it. */
  function update(index: number, next: number) {
    const list = [...values];
    list[index] = next;
    if (list.length === 2) {
      if (index === 0) list[0] = Math.min(list[0], list[1]);
      else list[1] = Math.max(list[1], list[0]);
    }
    if (list.every((v, i) => v === values[i])) return;
    if (value === undefined) setInternal(list);
    if (!onChange) return;
    if (props.type === "double") props.onChange?.([list[0], list[1]]);
    else props.onChange?.(list[0]);
  }

  function onThumbKeyDown(index: number, event: KeyboardEvent<HTMLDivElement>) {
    const current = values[index];
    const big = Math.max(step, Math.round(span / 10 / step) * step);
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp" ? current + step
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - step
      : event.key === "PageUp" ? current + big
      : event.key === "PageDown" ? current - big
      : event.key === "Home" ? min
      : event.key === "End" ? max
      : null;
    if (next === null || disabled) return;
    event.preventDefault();
    update(index, snap(next));
  }

  const start = values.length === 2 ? percent(values[0]) : 0;
  const end = percent(values[values.length - 1]);

  return (
    <div
      {...rest}
      role={double ? "group" : undefined}
      aria-label={double ? ariaLabel : undefined}
      aria-labelledby={double ? ariaLabelledby : undefined}
      aria-disabled={disabled || undefined}
      data-orientation={orientation}
      data-disabled={disabled || undefined}
      className={cn(
        "relative flex shrink-0 touch-none items-center justify-center select-none",
        // Taller (wider) on touch screens, for a bigger target.
        vertical ? "h-40 w-5 flex-col pointer-coarse:w-8" : "h-5 w-full pointer-coarse:h-8",
        disabled ? "opacity-50" : "cursor-pointer",
        className,
      )}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (disabled || event.defaultPrevented || event.button !== 0) return;
        const at = valueAt(event);
        // The nearest thumb takes it (the one on that side when they overlap).
        const index =
          values.length < 2 ? 0
          : at <= values[0] ? 0
          : at >= values[1] ? 1
          : at - values[0] <= values[1] - at ? 0 : 1;
        dragging.current = index;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault(); // no text selection; focus goes to the thumb below
        thumbs.current[index]?.focus();
        update(index, at);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (dragging.current !== null) update(dragging.current, valueAt(event));
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        dragging.current = null;
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        dragging.current = null;
      }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-surface-2",
          vertical ? "h-full w-1.5" : "h-1.5 w-full",
          trackClassName,
        )}
        style={trackStyle}
      >
        {showRange && (
          <div
            className="absolute bg-accent"
            style={
              vertical
                ? { left: 0, right: 0, bottom: `${start}%`, height: `${end - start}%` }
                : { top: 0, bottom: 0, left: `${start}%`, width: `${end - start}%` }
            }
          />
        )}
      </div>

      {values.map((v, index) => (
        <div
          key={index}
          ref={(node) => {
            thumbs.current[index] = node;
          }}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-orientation={orientation}
          aria-valuemin={index === 1 ? values[0] : min}
          aria-valuemax={index === 0 && values.length === 2 ? values[1] : max}
          aria-valuenow={v}
          aria-valuetext={getValueText?.(v)}
          aria-disabled={disabled || undefined}
          aria-label={double ? (thumbLabels?.[index] ?? (index === 0 ? "Minimum" : "Maximum")) : ariaLabel}
          aria-labelledby={double ? undefined : ariaLabelledby}
          onKeyDown={(event) => onThumbKeyDown(index, event)}
          className={cn(
            "absolute size-4 rounded-full border-2 border-accent bg-white shadow outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-accent/30 pointer-coarse:size-6",
            vertical ? "left-1/2 -translate-x-1/2 translate-y-1/2" : "top-1/2 -translate-x-1/2 -translate-y-1/2",
            !disabled && "cursor-grab active:cursor-grabbing",
            thumbClassName,
          )}
          style={{ ...(vertical ? { bottom: `${percent(v)}%` } : { left: `${percent(v)}%` }), ...thumbStyle }}
        />
      ))}

      {name && values.map((v, index) => <input key={index} type="hidden" name={name} value={v} />)}
    </div>
  );
}

export default Slider;