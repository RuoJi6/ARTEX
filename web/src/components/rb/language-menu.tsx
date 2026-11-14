"use client";

import { useState } from "react";

import { GlobalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type AppLocale, LOCALE_STORAGE_KEY, resolveLocale } from "@/i18n/config";

import { MenuSurface } from "./menu-surface";
import { cx, ghostButton, iconButtonMd, menuItem } from "./tokens";

/** Compact language menu (React Bits Pro menu pattern) for auth + shell chrome. */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = resolveLocale(i18n.resolvedLanguage);

  const select = (next: AppLocale) => {
    void i18n.changeLanguage(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort.
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language.change")}
        onClick={() => setOpen((v) => !v)}
        className={cx(ghostButton, iconButtonMd, className)}
      >
        <HugeiconsIcon icon={GlobalIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <MenuSurface open={open} onClose={() => setOpen(false)} label={t("language.label")} width="w-[160px]">
        <button type="button" role="menuitem" onClick={() => select("zh-CN")} className={menuItem}>
          <span className="w-4">
            {locale === "zh-CN" && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />}
          </span>
          {t("language.zhCN")}
        </button>
        <button type="button" role="menuitem" onClick={() => select("en")} className={menuItem}>
          <span className="w-4">
            {locale === "en" && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />}
          </span>
          {t("language.en")}
        </button>
      </MenuSurface>
    </div>
  );
}
