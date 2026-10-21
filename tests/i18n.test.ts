import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCALES, resolveLocale } from "../lib/i18n/locales.ts";
import { en } from "../lib/i18n/messages/en.ts";
import { es } from "../lib/i18n/messages/es.ts";
import { fr } from "../lib/i18n/messages/fr.ts";
import { plural, translate } from "../lib/i18n/translate.ts";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  for (const [locale, messages] of Object.entries({ es, fr })) {
    it(`${locale} has every key, with the same placeholders as English`, () => {
      assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        assert.deepEqual(placeholders(messages[key as keyof typeof en]), placeholders(text), `${locale}: ${key}`);
      }
    });
  }

  it("lists every language it has messages for", () => {
    assert.deepEqual([...LOCALES], ["en", "es", "fr"]);
  });
});

describe("resolveLocale", () => {
  it("uses the language picked", () => {
    assert.equal(resolveLocale("fr", ["es-ES"]), "fr");
  });

  it("follows the browser on automatic, by the language's main part", () => {
    assert.equal(resolveLocale("auto", ["de-DE", "es-MX", "en"]), "es");
  });

  it("falls back to English", () => {
    assert.equal(resolveLocale("auto", ["de", "ja"]), "en");
    assert.equal(resolveLocale("klingon", []), "en");
  });
});

describe("translate", () => {
  it("fills in placeholders", () => {
    assert.equal(translate("es", "chat.message", { channel: "general" }), "Mensaje en #general");
    assert.equal(translate("en", "join.continueWith", { provider: "Facebook" }), "Continue with Facebook");
  });

  it("leaves a placeholder it wasn't given", () => {
    assert.equal(translate("en", "chat.typing.one"), "{name} is typing");
  });

  it("picks plural forms by the language's rules", () => {
    assert.equal(plural("en", "chat.members", 1), "Members: 1 online");
    // French counts 0 as singular.
    assert.equal(plural("fr", "chat.members", 0), "Membres : 0 en ligne");
  });
});
