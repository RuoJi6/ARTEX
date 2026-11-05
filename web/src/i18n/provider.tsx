"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import { Languages } from "lucide-react";

import en from "../../messages/en.json";
import zh from "../../messages/zh-CN.json";
import { formats } from "./formatting";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

type Locale = "zh-CN" | "en";
const STORAGE_KEY = "artex.ui-locale";
const PENDING_KEY = "artex.pending-output-language";
const messages = { "zh-CN": zh, en };
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  saving: boolean;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("zh-CN");
  const [timeZone, setTimeZone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const pending = useRef<Locale | null>(null);
  const savingRef = useRef(false);
  const attempted = useRef(false);
  const pathname = usePathname();

  const saveLanguage = useCallback(async function persistLanguage(next: Locale): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    attempted.current = true;
    try {
      await api.setSettings({ output_language: next === "en" ? "en" : "zh" });
      pending.current = null;
      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* Storage may be unavailable. */ }
    } catch {
      toast.error(messages[next].language.saveFailed, {
        action: { label: messages[next].language.retry, onClick: () => {
          if (pending.current) void persistLanguage(pending.current);
        } },
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "zh-CN") updateLocale(stored);
    } catch {
      // The selector remains usable when browser storage is unavailable.
    }
  }, []);

  // Login reloads the page; setup navigates in place. Only an explicit pending
  // selection crosses either boundary, never a restored UI preference alone.
  useEffect(() => {
    if (pathname === "/login" || pathname === "/login/" || pathname === "/setup" || pathname === "/setup/") return;
    if (attempted.current || !auth.getToken()) return;
    try {
      const stored = sessionStorage.getItem(PENDING_KEY);
      if (stored === "en" || stored === "zh-CN") pending.current = stored;
    } catch { /* In-memory pending selection still works. */ }
    if (pending.current) void saveLanguage(pending.current);
  }, [pathname, saveLanguage]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Repeater can finish saving after navigation or import from another screen.
  useEffect(() => {
    const onStorageError = () => toast.error(messages[locale].repeater.storageError);
    window.addEventListener("artex:repeater-storage-error", onStorageError);
    return () => window.removeEventListener("artex:repeater-storage-error", onStorageError);
  }, [locale]);

  function setLocale(next: Locale) {
    if (savingRef.current) return;
    updateLocale(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the in-memory choice for this session.
    }
    pending.current = next;
    try { sessionStorage.setItem(PENDING_KEY, next); } catch { /* Keep the in-memory selection. */ }
    if (auth.getToken()) void saveLanguage(next);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, saving }}>
      <title>{messages[locale].metadata.title}</title>
      <meta name="description" content={messages[locale].metadata.description} />
      <NextIntlClientProvider locale={locale} messages={messages[locale]} formats={formats} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function LanguageSelector() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("LanguageSelector requires LocaleProvider");
  return (
    <label className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground">
      <Languages aria-hidden="true" className="size-4 shrink-0" />
      <select
        aria-label={messages[context.locale].language.label}
        className="min-w-0 bg-transparent outline-none [color-scheme:light] focus-visible:ring-2 focus-visible:ring-ring dark:[color-scheme:dark] [&>option]:bg-background [&>option]:text-foreground"
        value={context.locale}
        disabled={context.saving}
        title={messages[context.locale].language.description}
        onChange={(event) => context.setLocale(event.target.value === "en" ? "en" : "zh-CN")}
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
