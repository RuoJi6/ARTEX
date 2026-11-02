"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../messages/en.json";
import zh from "../../messages/zh-CN.json";

type Locale = "zh-CN" | "en";
const STORAGE_KEY = "artex.ui-locale";
const messages = { "zh-CN": zh, en };
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Static HTML and the first client render agree; restore the choice after hydration.
  const [locale, updateLocale] = useState<Locale>("zh-CN");
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "zh-CN") updateLocale(stored);
    } catch {
      // Language selection still works when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    updateLocale(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the in-memory choice for this session.
    }
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <title>{messages[locale].metadata.title}</title>
      <meta name="description" content={messages[locale].metadata.description} />
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function LanguageSelector() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("LanguageSelector requires LocaleProvider");
  return (
    <select
      aria-label={messages[context.locale].language.label}
      className="min-w-0 rounded-md border bg-background px-2 py-1 text-sm text-foreground"
      value={context.locale}
      onChange={(event) => context.setLocale(event.target.value === "en" ? "en" : "zh-CN")}
    >
      <option value="zh-CN">简体中文</option>
      <option value="en">English</option>
    </select>
  );
}
