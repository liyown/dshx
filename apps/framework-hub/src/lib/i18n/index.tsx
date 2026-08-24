import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { locales, messages, type Locale, type MessageKey } from "./messages";

export { locales, messages } from "./messages";
export type { Locale, MessageKey } from "./messages";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "zh";
}

export function parseLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : "en";
}

export function localeFromPathname(pathname: string): Locale {
  return parseLocale(pathname.split("/")[1]);
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const candidates = (header ?? "")
    .split(",")
    .map((part) => {
      const [rawLanguage, ...params] = part.trim().toLowerCase().split(";");
      const quality = params.find((param) => param.trim().startsWith("q="));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { language: rawLanguage ?? "", q: Number.isFinite(q) ? q : 0 };
    })
    .filter((candidate) => candidate.q > 0)
    .sort((a, b) => b.q - a.q);

  return candidates.some(
    (candidate) => candidate.language === "zh" || candidate.language.startsWith("zh-"),
  )
    ? "zh"
    : "en";
}

export function localeFromBrowser(): Locale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return localeFromAcceptLanguage(languages.join(","));
}

export function localizedPath(locale: Locale, pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : "/" + pathname;
  const segments = normalized.split("/");
  if (isLocale(segments[1])) segments[1] = locale;
  else segments.splice(1, 0, locale);
  return segments.join("/") || "/" + locale;
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translate {
  return (key, params) => {
    let value = messages[locale][key] ?? messages.en[key] ?? key;
    for (const [name, replacement] of Object.entries(params ?? {})) {
      value = value.replaceAll("{" + name + "}", String(replacement));
    }
    return value;
  };
}

type I18nContextValue = { locale: Locale; t: Translate };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: createTranslator(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
