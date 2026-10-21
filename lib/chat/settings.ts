"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyAppearance, DEFAULT_APPEARANCE, SETTINGS_KEY, type Appearance } from "./appearance";
import { resolveLocale, type LanguageChoice } from "../i18n/locales";
import { setClock, setFormatLocale } from "./format";

/** Preferences kept in this browser (devices differ per computer, so they aren't synced). */
export type Settings = Appearance & {
  /** Call devices, by deviceId; `null` uses the browser's default. */
  micId: string | null;
  cameraId: string | null;
  speakerId: string | null;
  /** Incoming calls ring (they always show). */
  ringtone: boolean;
  /** The interface language; "auto" follows the browser (see lib/i18n). */
  language: LanguageChoice;
};

const DEFAULTS: Settings = { micId: null, cameraId: null, speakerId: null, ringtone: true, language: "auto", ...DEFAULT_APPEARANCE };

/** Dates and times follow the interface language. */
function applyLanguage(settings: Settings) {
  const languages = typeof navigator === "undefined" ? [] : navigator.languages;
  setFormatLocale(resolveLocale(settings.language, languages));
}
const listeners = new Set<() => void>();
let cached: Settings | null = null;

/** The current settings (for code outside React, e.g. starting a call). */
export function getSettings(): Settings {
  if (cached) return cached;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    cached = { ...DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    cached = DEFAULTS; // storage blocked or corrupt: defaults for this visit
  }
  setClock(cached.clock);
  applyLanguage(cached);
  return cached;
}

export function updateSettings(changes: Partial<Settings>) {
  cached = { ...getSettings(), ...changes };
  setClock(cached.clock);
  applyLanguage(cached);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cached));
  } catch {
    // Not saved; it still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The settings, re-rendering when they change. */
export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULTS);
}

/**
 * Keeps <html> in step with the appearance settings (the inline script in
 * app/layout.tsx applies them on load; this re-applies them after React's
 * development remount clears them, and when they change), and the browser's
 * theme color with the page's background.
 */
export function AppearanceSync() {
  const { theme, accent, textSize, density, language } = useSettings();
  // <html lang> says what language the interface is in (for screen readers, hyphenation…).
  useLayoutEffect(() => {
    document.documentElement.lang = resolveLocale(language, navigator.languages);
  }, [language]);
  useLayoutEffect(() => {
    applyAppearance(document.documentElement, { theme, accent, textSize, density });
    syncThemeColor();
  }, [theme, accent, textSize, density]);
  // "Match system" follows the device as it switches.
  useLayoutEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    query.addEventListener("change", syncThemeColor);
    return () => query.removeEventListener("change", syncThemeColor);
  }, [theme]);
  return null;
}

/** The browser's theme color (title bar, installed app) matches the page's background. */
function syncThemeColor() {
  const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
}
