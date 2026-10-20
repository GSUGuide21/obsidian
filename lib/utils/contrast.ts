/** Relative luminance of a "#rrggbb" color (WCAG 2), from 0 (black) to 1 (white). */
export const luminance = (hex: string) => {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return 0;
  const [r, g, b] = match.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * White, or near-black where white wouldn't be readable, for bold text and
 * icons on `background` (a "#rrggbb" color). White wins whenever it reaches
 * 3:1, WCAG's level for large or bold text, so the usual saturated colors keep
 * white text.
 */
export const readableOn = (background: string) => {
  const contrastWithWhite = 1.05 / (luminance(background) + 0.05);
  return contrastWithWhite >= 3 ? "#ffffff" : "#111827";
};
