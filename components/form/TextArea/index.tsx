"use client";

import { useImperativeHandle, useLayoutEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../Field/context";
import { inputVariants } from "../Input/variants";

type TextAreaProps = ComponentProps<"textarea"> & {
  /** Grow with the content, up to `maxHeight` pixels. */
  autoResize?: boolean;
  maxHeight?: number;
};

export default function TextArea({
  autoResize = false,
  maxHeight = 240,
  className,
  ref,
  ...props
}: TextAreaProps) {
  const aria = useFieldAria(props);
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current!, []);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!autoResize || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [autoResize, maxHeight, props.value]);

  return (
    <textarea
      ref={inner}
      className={cn(inputVariants({ size: "auto" }), "resize-none", className)}
      {...props}
      {...aria}
    />
  );
}
