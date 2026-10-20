"use client";

import { createContext, useContext } from "react";
import type { ColorPickerContextType } from "./types";

export const ColorPickerContext = createContext<ColorPickerContextType | null>(null);

/** The picker's color and setters, for its parts (and custom ones). */
export function useColorPicker() {
  const context = useContext(ColorPickerContext);
  if (!context) throw new Error("Color picker parts must be rendered inside <ColorPicker>.");
  return context;
}
