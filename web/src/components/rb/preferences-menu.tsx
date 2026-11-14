"use client";

import { useState } from "react";

import { Settings01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type AppLocale, LOCALE_STORAGE_KEY, resolveLocale } from "@/i18n/config";
import { fontOptions } from "@/lib/fonts/registry";
import type { ContentLayout } from "@/lib/preferences/layout";
import { applyContentLayout, applyFont } from "@/lib/preferences/layout-utils";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { applyThemePreset } from "@/lib/preferences/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MenuSurface } from "./menu-surface";
import { cx, ghostButton, iconButtonMd, menuItem, menuLabel, menuSeparator, text3, typeCaption } from "./tokens";

const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const LAYOUTS: { value: ContentLayout; label: string }[] = [
  { value: "full-width", label: "Full width" },
  { value: "centered", label: "Centered" },
];

/**
 * Preferences menu (React Bits Pro menu pattern) replacing the legacy layout
 * controls popover: theme mode, color preset, content layout and font.
 */
export function PreferencesMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout);
  const font = usePreferencesStore((s) => s.font);
  const setFont = usePreferencesStore((s) => s.setFont);
  const locale = resolveLocale(i18n.resolvedLanguage);

  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("prefs.title")}
        title={t("prefs.title")}
        onClick={() => setOpen((v) => !v)}
        className={cx(ghostButton, iconButtonMd)}
      >
        <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <MenuSurface open={open} onClose={close} label={t("prefs.title")} width="w-[260px]">
        <p className={menuLabel}>{t("prefs.themeMode")}</p>
        {THEME_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="menuitem"
            onClick={() => {
              setThemeMode(mode.value);
              void persistPreference("theme_mode", mode.value);
              close();
            }}
            className={menuItem}
          >
            <span className="w-4">
              {themeMode === mode.value && (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />
              )}
            </span>
            {t(`theme.${mode.value}`)}
          </button>
        ))}

        <div className={menuSeparator} />
        <p className={menuLabel}>{t("prefs.preset")}</p>
        {THEME_PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="menuitem"
            onClick={() => {
              applyThemePreset(preset.value);
              setThemePreset(preset.value as ThemePreset);
              void persistPreference("theme_preset", preset.value);
              close();
            }}
            className={menuItem}
          >
            <span className="w-4">
              {themePreset === preset.value && (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />
              )}
            </span>
            {preset.label}
          </button>
        ))}

        <div className={menuSeparator} />
        <p className={menuLabel}>{t("prefs.layout")}</p>
        {LAYOUTS.map((layout) => (
          <button
            key={layout.value}
            type="button"
            role="menuitem"
            onClick={() => {
              applyContentLayout(layout.value);
              setContentLayout(layout.value);
              void persistPreference("content_layout", layout.value);
              close();
            }}
            className={menuItem}
          >
            <span className="w-4">
              {contentLayout === layout.value && (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />
              )}
            </span>
            {layout.label}
          </button>
        ))}

        <div className={menuSeparator} />
        <p className={menuLabel}>{t("prefs.font")}</p>
        <div className="max-h-44 overflow-y-auto">
          {fontOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              onClick={() => {
                applyFont(option.key);
                setFont(option.key);
                void persistPreference("font", option.key);
                close();
              }}
              className={menuItem}
            >
              <span className="w-4">
                {font === option.key && (
                  <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />
                )}
              </span>
              {option.label}
            </button>
          ))}
        </div>

        <div className={menuSeparator} />
        <p className={menuLabel}>{t("prefs.language")}</p>
        {(["zh-CN", "en"] as AppLocale[]).map((value) => (
          <button
            key={value}
            type="button"
            role="menuitem"
            onClick={() => {
              void i18n.changeLanguage(value);
              try {
                localStorage.setItem(LOCALE_STORAGE_KEY, value);
              } catch {
                /* best-effort */
              }
              close();
            }}
            className={menuItem}
          >
            <span className="w-4">
              {locale === value && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />}
            </span>
            {value === "en" ? t("language.en") : t("language.zhCN")}
          </button>
        ))}

        <p className={cx(typeCaption, text3, "px-2 pt-2 pb-1")}>{t("prefs.notifications")}</p>
      </MenuSurface>
    </div>
  );
}
