"use client";

import { useState, type PointerEvent } from "react";
import { Heart, Star, ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import { useControllable } from "@/lib/hooks/useControllable";
import { cn } from "@/lib/utils";
import type { RatingProps } from "./types";

export type * from "./types";

const ICONS: Record<"star" | "heart", { icon: LucideIcon; fill: string; noun: string }> = {
  star: { icon: Star, fill: "fill-warning text-warning", noun: "star" },
  heart: { icon: Heart, fill: "fill-danger text-danger", noun: "heart" },
};

/**
 * A rating: stars or hearts (`max` of them, halves with `useDecimal`), or
 * thumbs up/down. Stars and hearts are a slider: click or drag across them,
 * or use the arrow keys, Home and End; clicking the current rating (or Delete)
 * clears it. Controlled with `value`, or uncontrolled with `defaultValue`.
 */
export function Rating(props: RatingProps) {
  return props.type === "thumb" ? <Thumbs {...props} /> : <Scale {...props} />;
}

export default Rating;

function Scale({
  type = "star",
  useDecimal = false,
  value,
  defaultValue,
  onChange,
  max = 5,
  readOnly = false,
  disabled = false,
  name,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: RatingProps) {
  const [rating, setRating] = useControllable(value, defaultValue ?? null, onChange);
  // What the pointer is over, previewed until it leaves.
  const [hover, setHover] = useState<number | null>(null);
  const step = useDecimal ? 0.5 : 1;
  const { icon: Icon, fill, noun } = ICONS[type === "heart" ? "heart" : "star"];
  const fixed = readOnly || disabled;
  const shown = hover ?? rating ?? 0;
  const describe = (n: number | null) => (n === null ? "Not rated" : `${n} of ${max} ${noun}s`);

  /** The rating under the pointer: the icon it's on, or half of it. */
  function ratingAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.max(step, Math.ceil((ratio * max) / step) * step);
  }

  const icons = Array.from({ length: max }, (_, i) => {
    const part = Math.min(1, Math.max(0, shown - i));
    return (
      <span key={i} className="relative inline-flex">
        <Icon aria-hidden className="size-5 text-muted/50 pointer-coarse:size-7" strokeWidth={1.5} />
        {part > 0 && (
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${part * 100}%` }}>
            <Icon aria-hidden className={cn("size-5 pointer-coarse:size-7", fill)} strokeWidth={1.5} />
          </span>
        )}
      </span>
    );
  });

  if (readOnly) {
    return (
      <div id={id} role="img" aria-label={describe(rating)} className={cn("inline-flex gap-0.5", className)}>
        {icons}
      </div>
    );
  }

  return (
    <div
      id={id}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel ?? (ariaLabelledby ? undefined : "Rating")}
      aria-labelledby={ariaLabelledby}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={rating ?? 0}
      aria-valuetext={describe(rating)}
      aria-disabled={disabled || undefined}
      onPointerMove={(event) => {
        // Mice preview by hovering; touch and pens while dragging across.
        const dragging = event.currentTarget.hasPointerCapture(event.pointerId);
        if (!fixed && (event.pointerType === "mouse" || dragging)) setHover(ratingAt(event));
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(event) => {
        if (fixed || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (fixed || event.button !== 0) return;
        const next = ratingAt(event);
        setRating(next === rating ? null : next);
        setHover(null);
      }}
      onKeyDown={(event) => {
        if (fixed) return;
        const current = rating ?? 0;
        const next =
          event.key === "ArrowRight" || event.key === "ArrowUp" ? Math.min(max, current + step)
          : event.key === "ArrowLeft" || event.key === "ArrowDown" ? Math.max(0, current - step)
          : event.key === "Home" ? 0
          : event.key === "End" ? max
          : event.key === "Delete" || event.key === "Backspace" ? 0
          : null;
        if (next === null) return;
        event.preventDefault();
        setRating(next === 0 ? null : next);
      }}
      className={cn(
        "inline-flex w-fit touch-none gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        disabled ? "opacity-50" : "cursor-pointer",
        className,
      )}
    >
      {icons}
      {name && <input type="hidden" name={name} value={rating ?? ""} />}
    </div>
  );
}

function Thumbs({
  value,
  defaultValue,
  onChange,
  readOnly = false,
  disabled = false,
  name,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: RatingProps) {
  const [rating, setRating] = useControllable(value, defaultValue ?? null, onChange);
  const fixed = readOnly || disabled;
  const thumbs = [
    { value: 1, label: "Thumbs up", icon: ThumbsUp, on: "bg-online/15 text-online" },
    { value: -1, label: "Thumbs down", icon: ThumbsDown, on: "bg-danger/15 text-danger" },
  ];
  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel ?? (ariaLabelledby ? undefined : "Rating")}
      aria-labelledby={ariaLabelledby}
      className={cn("inline-flex gap-1", disabled && "opacity-50", className)}
    >
      {thumbs.map((thumb) => {
        const pressed = rating === thumb.value;
        return (
          <button
            key={thumb.value}
            type="button"
            aria-label={thumb.label}
            aria-pressed={pressed}
            disabled={fixed}
            onClick={() => setRating(pressed ? null : thumb.value)}
            className={cn(
              "rounded-md p-1.5 transition-colors pointer-coarse:p-2.5",
              pressed ? thumb.on : "text-muted",
              !fixed && !pressed && "hover:bg-surface-2 hover:text-foreground",
              fixed && "cursor-default",
            )}
          >
            <thumb.icon aria-hidden className={cn("size-5", pressed && "fill-current")} />
          </button>
        );
      })}
      {name && <input type="hidden" name={name} value={rating ?? ""} />}
    </div>
  );
}
