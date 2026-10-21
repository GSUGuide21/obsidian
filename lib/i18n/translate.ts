// Looking up interface text. Not a client module: tests use it directly.

import type { Locale } from "./locales.ts";
import { en, type MessageKey, type Messages } from "./messages/en.ts";
import { es } from "./messages/es.ts";
import { fr } from "./messages/fr.ts";

const MESSAGES: Record<Locale, Messages> = { en, es, fr };

export type Vars = Record<string, string | number>;

/** The text for `key` in `locale`, with "{name}" filled from `vars` (left as is when missing). */
export function translate(locale: Locale, key: MessageKey, vars?: Vars) {
  const text = MESSAGES[locale]?.[key] ?? en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Keys with plural forms: "x.one" and "x.other" (see PluralKey). */
type PluralBase<K extends string> = K extends `${infer Base}.one` ? (`${Base}.other` extends MessageKey ? Base : never) : never;

export type PluralKey = PluralBase<MessageKey>;

/** The plural form of `key` for `count` in `locale` ("one" or "other"), with {count} filled in. */
export function plural(locale: Locale, key: PluralKey, count: number, vars?: Vars) {
  const form = new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
  return translate(locale, `${key}.${form}` as MessageKey, { count, ...vars });
}

export type { MessageKey };
