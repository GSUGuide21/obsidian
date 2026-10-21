"use client";

// The interface language: the setting (in lib/chat/settings.ts) resolved
// against the browser's languages, and t() to write text in it. Components
// call useT(); dates follow the same language (see setFormatLocale).

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useSettings } from "@/lib/chat/settings";
import { resolveLocale, type Locale } from "./locales";
import { plural, translate, type MessageKey, type PluralKey, type Vars } from "./translate";

export { LOCALE_NAMES, LOCALES, type LanguageChoice, type Locale } from "./locales";
export type { MessageKey } from "./translate";

const noLanguages: readonly string[] = [];

/** The browser's languages (none on the server, so the first render there is English). */
function useBrowserLanguages() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("languagechange", onChange);
      return () => window.removeEventListener("languagechange", onChange);
    },
    () => navigator.languages,
    () => noLanguages,
  );
}

/** The language the interface is shown in. */
export function useLocale(): Locale {
  const { language } = useSettings();
  const languages = useBrowserLanguages();
  return resolveLocale(language, languages);
}

/** t(key, vars) for the current language; t.plural(key, count, vars) for counted text. */
export function useT() {
  const locale = useLocale();
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  return useMemo(
    () => Object.assign(t, { locale, plural: (key: PluralKey, count: number, vars?: Vars) => plural(locale, key, count, vars) }),
    [t, locale],
  );
}
