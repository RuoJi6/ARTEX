"use client";

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AppLocale, LOCALE_STORAGE_KEY, resolveLocale } from "@/i18n/config";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.resolvedLanguage);
  const selectLanguage = (next: AppLocale) => {
    void i18n.changeLanguage(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Do not block a language change if persistence is disabled.
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-2 px-2 sm:px-3"
          aria-label={t("language.change")}
        >
          <Languages className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{locale === "en" ? "English" : "简体中文"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={t("language.label")}>
        <DropdownMenuItem onClick={() => selectLanguage("zh-CN")} aria-current={locale === "zh-CN"}>
          简体中文
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => selectLanguage("en")} aria-current={locale === "en"}>
          English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
