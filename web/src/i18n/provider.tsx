"use client";

import { type ReactNode, useEffect, useState } from "react";

import { I18nextProvider } from "react-i18next";

import { LOCALE_STORAGE_KEY, resolveLocale } from "./config";
import { createAppI18n } from "./instance";

export function AppI18nProvider({ children }: { children: ReactNode }) {
  // A per-tree instance keeps prerenders isolated. The first browser render
  // matches static HTML; saved preferences are applied after hydration.
  const [instance] = useState(createAppI18n);

  useEffect(() => {
    const updateDocument = () => {
      document.documentElement.lang = resolveLocale(instance.resolvedLanguage);
      document.title = instance.t("meta.title");
      document.querySelector('meta[name="description"]')?.setAttribute("content", instance.t("meta.description"));
    };
    instance.on("languageChanged", updateDocument);
    updateDocument();
    try {
      void instance.changeLanguage(resolveLocale(localStorage.getItem(LOCALE_STORAGE_KEY)));
    } catch {
      // Language selection still works when browser storage is unavailable.
    }
    const syncPreference = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
        void instance.changeLanguage(resolveLocale(event.newValue));
      }
    };
    window.addEventListener("storage", syncPreference);
    return () => {
      instance.off("languageChanged", updateDocument);
      window.removeEventListener("storage", syncPreference);
    };
  }, [instance]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
