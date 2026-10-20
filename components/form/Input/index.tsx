"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useFieldAria } from "../Field/context";
import { inputVariants, type InputVariants } from "./variants";

export { inputVariants, type InputVariants };

/** `size` is the control's height ("sm" or "md"), not the native character width. */
export type InputProps = Omit<ComponentProps<"input">, "size"> & Pick<InputVariants, "size">;

export function Input({ size, className, ...props }: InputProps) {
  const aria = useFieldAria(props);
  return <input className={cn(inputVariants({ size }), className)} {...props} {...aria} />;
}

export default Input;
