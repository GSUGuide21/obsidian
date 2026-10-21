// The languages the interface is written in, and picking one. Not a client
// module, so tests (and anything outside React) can use it.

/** Interface languages (BCP 47 tags), English first: it's the fallback. */
export const LOCALES = ["en", "es", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

/** Each language named in itself, as the picker lists it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

/** The language setting: one of LOCALES, or "auto" to follow the browser. */
export type LanguageChoice = "auto" | Locale;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The language to show: the one picked, else the first of the browser's
 * languages we have (by its main part, so "es-MX" is Spanish), else English.
 */
export function resolveLocale(choice: unknown, preferred: readonly string[] = []): Locale {
  if (isLocale(choice)) return choice;
  for (const tag of preferred) {
    const main = tag.toLowerCase().split("-")[0];
    if (isLocale(main)) return main;
  }
  return "en";
}
