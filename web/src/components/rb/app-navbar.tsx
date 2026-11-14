"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  BellIcon,
  CommandIcon,
  ComputerIcon,
  GlobalIcon,
  Menu01Icon,
  MoonIcon,
  Search01Icon,
  SunIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/i18n/config";
import type { ThemeMode } from "@/lib/preferences/theme";

import { MenuSurface } from "./menu-surface";
import { PreferencesMenu } from "./preferences-menu";
import {
  avatar,
  avatarFallback,
  buttonMd,
  buttonSm,
  countBadge,
  cx,
  frame,
  frameHead,
  frameTitle,
  ghostButton,
  ghostButtonMuted,
  iconButtonMd,
  itemRowInteractive,
  itemRowSm,
  menuItem,
  menuSeparator,
  metaText,
  secondaryButton,
  text1,
  text2,
  text3,
  typeBodySm,
  typeCaption,
  typeLabel,
} from "./tokens";

export interface ShellNotice {
  id: string;
  title: string;
  detail?: string;
  at: string;
  tone?: "neutral" | "warning" | "critical";
  href?: string;
}

interface AppNavbarProps {
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  notices: ShellNotice[];
  noticesRead: boolean;
  onNoticesRead: () => void;
  themeMode: ThemeMode;
  resolvedThemeMode: "light" | "dark";
  onCycleTheme: () => void;
  locale: AppLocale;
  onChangeLocale: (locale: AppLocale) => void;
  userName: string;
  userUsername: string;
  accountMenu: {
    id: string;
    label: string;
    icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
    onSelect: () => void;
    danger?: boolean;
  }[];
  leading?: ReactNode;
  trailing?: ReactNode;
}

function ThemeGlyph({ mode, resolved }: { mode: ThemeMode; resolved: "light" | "dark" }) {
  if (mode === "system") {
    return <HugeiconsIcon icon={ComputerIcon} size={16} strokeWidth={1.8} aria-hidden="true" />;
  }
  if (resolved === "dark") {
    return <HugeiconsIcon icon={SunIcon} size={16} strokeWidth={1.8} aria-hidden="true" />;
  }
  return <HugeiconsIcon icon={MoonIcon} size={16} strokeWidth={1.8} aria-hidden="true" />;
}

export function AppNavbar({
  onOpenMobileNav,
  onOpenSearch,
  notices,
  noticesRead,
  onNoticesRead,
  themeMode,
  resolvedThemeMode,
  onCycleTheme,
  locale,
  onChangeLocale,
  userName,
  userUsername,
  accountMenu,
  leading,
  trailing,
}: AppNavbarProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<"bell" | "account" | "language" | null>(null);
  const unread = noticesRead ? [] : notices;
  const listRef = useRef<HTMLUListElement>(null);
  const [_listEdges, setListEdges] = useState({ start: false, end: false });

  const open = (next: "bell" | "account" | "language") => setMenu((current) => (current === next ? null : next));
  const close = useCallback(() => setMenu(null), []);

  const syncListEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setListEdges({
      start: scrollTop > 1,
      end: Math.ceil(scrollTop + clientHeight) < scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    syncListEdges();
  }, [syncListEdges]);

  const initials = (userName || userUsername || "A").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-rb-line border-b bg-rb-canvas/85 px-3 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
          className={cx(ghostButton, iconButtonMd, "lg:hidden")}
        >
          <HugeiconsIcon icon={Menu01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={cx(ghostButtonMuted, buttonMd, "min-w-0 gap-2 text-rb-muted")}
        >
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="hidden sm:inline">{t("common.search")}</span>
          <kbd className="ml-1 hidden items-center gap-0.5 rounded-[var(--rb-r-xs,4px)] border border-rb-line bg-rb-subtle px-1.5 py-0.5 font-medium text-[10px] text-rb-muted sm:inline-flex">
            <HugeiconsIcon icon={CommandIcon} size={10} strokeWidth={2} aria-hidden="true" />J
          </kbd>
        </button>
      </div>

      <div className="min-w-0 flex-1">{leading}</div>

      <div className="flex shrink-0 items-center gap-1">
        {trailing}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "bell"}
            aria-label={`Notifications, ${unread.length} unread`}
            onClick={() => open("bell")}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon icon={BellIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
            {unread.length > 0 && (
              <span aria-hidden="true" className={countBadge}>
                {unread.length}
              </span>
            )}
          </button>
          <MenuSurface open={menu === "bell"} onClose={close} label="Notifications" width="w-[300px]">
            <div className={frame}>
              <div className={cx(frameHead, "justify-between")}>
                <p className={frameTitle}>{t("nav.notify")}</p>
                <button type="button" onClick={onNoticesRead} className={cx(secondaryButton, buttonSm)}>
                  {locale === "en" ? "Mark all read" : "全部已读"}
                </button>
              </div>
              <div className="relative">
                <ul
                  ref={listRef}
                  onScroll={syncListEdges}
                  className="max-h-[240px] overflow-y-auto overscroll-contain py-1"
                >
                  {notices.length === 0 && (
                    <li className="px-3 py-6 text-center">
                      <span className={metaText}>{locale === "en" ? "Nothing new" : "暂无新通知"}</span>
                    </li>
                  )}
                  {notices.map((notice) => (
                    <li key={notice.id} className="px-2 py-1">
                      <div className={cx(itemRowSm, itemRowInteractive, "px-2")}>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cx(
                              typeBodySm,
                              notice.tone && notice.tone !== "neutral" ? text1 : text2,
                              "block",
                            )}
                          >
                            {!noticesRead && <span className="sr-only">Unread: </span>}
                            <span className={cx(!noticesRead && text1)}>{notice.title}</span>
                          </span>
                          {notice.detail && (
                            <span className={cx(typeCaption, text3, "mt-0.5 block truncate")}>{notice.detail}</span>
                          )}
                          <span className={cx(typeCaption, text3, "mt-0.5 block")}>{notice.at}</span>
                        </span>
                        {notice.tone && notice.tone !== "neutral" && (
                          <span
                            aria-hidden="true"
                            className={cx(
                              "size-1.5 shrink-0 rounded-full",
                              notice.tone === "critical" ? "bg-red-500" : "bg-amber-500",
                            )}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </MenuSurface>
        </div>

        {/* Theme cycle */}
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={t("theme.cycle", { theme: t(`theme.${themeMode}`) })}
          title={t("theme.cycle", { theme: t(`theme.${themeMode}`) })}
          className={cx(ghostButton, iconButtonMd)}
        >
          <ThemeGlyph mode={themeMode} resolved={resolvedThemeMode} />
        </button>

        {/* Language */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "language"}
            aria-label={t("language.change")}
            onClick={() => open("language")}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon icon={GlobalIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <MenuSurface open={menu === "language"} onClose={close} label={t("language.label")} width="w-[160px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onChangeLocale("zh-CN");
                close();
              }}
              className={menuItem}
            >
              <span className="w-4">
                {locale === "zh-CN" && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />}
              </span>
              {t("language.zhCN")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onChangeLocale("en");
                close();
              }}
              className={menuItem}
            >
              <span className="w-4">
                {locale === "en" && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden="true" />}
              </span>
              {t("language.en")}
            </button>
          </MenuSurface>
        </div>

        {/* Preferences */}
        <PreferencesMenu />

        {/* Account */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "account"}
            aria-label="Account menu"
            onClick={() => open("account")}
            className={cx(avatar, "cursor-pointer")}
          >
            <span className={avatarFallback}>{initials}</span>
          </button>
          <MenuSurface open={menu === "account"} onClose={close} label="Account" width="w-[220px]">
            <div className="px-2 py-2">
              <p className={cx(typeLabel, "truncate")}>{userName || userUsername}</p>
              <p className={cx(typeCaption, text3, "truncate")}>{userUsername}</p>
            </div>
            <div className={menuSeparator} />
            {accountMenu.map(({ id, label, icon, onSelect, danger }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onSelect();
                }}
                className={cx(menuItem, danger && "text-red-600 dark:text-red-400")}
              >
                <HugeiconsIcon icon={icon} size={14} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </button>
            ))}
          </MenuSurface>
        </div>
      </div>
    </header>
  );
}
