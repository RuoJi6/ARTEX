export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = [DEFAULT_LOCALE, "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "artex_locale";

export function resolveLocale(value: string | null | undefined): AppLocale {
  return /^en(?:-|$)/i.test(value ?? "") ? "en" : DEFAULT_LOCALE;
}
