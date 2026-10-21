// How the app looks: theme, accent color, text size, density and clock. Kept with the other
// browser settings (lib/chat/settings.ts) and put on <html> as data attributes
// that app/globals.css styles. Not a client module: the root layout embeds
// APPEARANCE_SCRIPT, which applies them before the first paint.

/** "system" follows the device's light or dark mode. */
export type Theme = "dark" | "light" | "system";
export type TextSize = "small" | "default" | "large";
/** "compact" fits more messages on screen. */
export type Density = "comfortable" | "compact";
/** "auto" uses the format of your language and region. */
export type Clock = "auto" | "12h" | "24h";

/**
 * The color of buttons, links, selection and highlights. Each is a set of
 * colors in app/globals.css checked for contrast in both themes, which is why
 * it's a pick from these rather than any color.
 */
export type Accent = "blue" | "violet" | "pink" | "orange" | "green" | "teal";

/** Every accent, in the order they're offered, with its fill color (for the swatches). */
export const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "violet", label: "Violet", color: "#7c3aed" },
  { value: "pink", label: "Pink", color: "#db2777" },
  { value: "orange", label: "Orange", color: "#c2410c" },
  { value: "green", label: "Green", color: "#047857" },
  { value: "teal", label: "Teal", color: "#0f766e" },
];

export type Appearance = { theme: Theme; accent: Accent; textSize: TextSize; density: Density; clock: Clock };

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "blue",
  textSize: "default",
  density: "comfortable",
  clock: "auto",
};

/** Where the settings are kept (shared with lib/chat/settings.ts). */
export const SETTINGS_KEY = "obsidian-chat:settings";

/**
 * Put the appearance on <html>: `data-theme` ("light" or "system"; dark has
 * none), `data-accent`, `data-text-size` and `data-density` (absent at their defaults).
 */
export function applyAppearance(
  root: HTMLElement,
  appearance: Pick<Appearance, "theme" | "accent" | "textSize" | "density">,
) {
  setData(root, "theme", appearance.theme === "dark" ? null : appearance.theme);
  const accent = ACCENTS.some((a) => a.value === appearance.accent) ? appearance.accent : "blue";
  setData(root, "accent", accent === "blue" ? null : accent);
  setData(root, "text-size", appearance.textSize === "default" ? null : appearance.textSize);
  setData(root, "density", appearance.density === "compact" ? "compact" : null);
}

function setData(root: HTMLElement, name: string, value: string | null) {
  if (value) root.setAttribute(`data-${name}`, value);
  else root.removeAttribute(`data-${name}`);
}

/**
 * Runs in <head> while the page is parsed, so the saved theme applies before
 * anything is painted. Mirrors applyAppearance (keep the two in step).
 */
export const APPEARANCE_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}")||{},d=document.documentElement;if(s.theme==="light"||s.theme==="system")d.setAttribute("data-theme",s.theme);if(${JSON.stringify(ACCENTS.map((a) => a.value).filter((a) => a !== "blue"))}.indexOf(s.accent)>=0)d.setAttribute("data-accent",s.accent);if(s.textSize==="small"||s.textSize==="large")d.setAttribute("data-text-size",s.textSize);if(s.density==="compact")d.setAttribute("data-density","compact")}catch(e){}})()`;
