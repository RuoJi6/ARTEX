"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import {
  ArrowUpRightIcon,
  GlobeIcon,
  Key01Icon,
  Logout03Icon,
  RefreshIcon,
  Settings01Icon,
  XIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { EgressIpProvider, useEgressIp } from "@/app/(main)/_components/egress-ip-banner";
import { LiveClock } from "@/app/(main)/_components/live-clock";
import { ChangePasswordDialog } from "@/app/(main)/_components/sidebar/change-password-dialog";
import { UpdateBadge } from "@/app/(main)/_components/update-badge";
import { type AppLocale, LOCALE_STORAGE_KEY, resolveLocale } from "@/i18n/config";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { getClientCookie, setClientCookie } from "@/lib/cookie.client";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import type { ThemeMode } from "@/lib/preferences/theme";
import { cn } from "@/lib/utils";
import { getSidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { AppNavbar, type ShellNotice } from "./app-navbar";
import { type AccountMenuItem, AppSidebar } from "./app-sidebar";
import { type PaletteAction, SearchPalette } from "./search-palette";
import { cx, ghostButton, iconButtonMd } from "./tokens";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];

function isFullBleed(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  const normalized = p.replace(/\/+$/, "");
  return normalized.startsWith("/function/tasks/");
}

function EgressStatus() {
  const { t } = useTranslation();
  const { enabled, report, error, isLoading, probeEgress, dismiss } = useEgressIp();
  if (!enabled) return null;

  const direct = report?.checks.find((check) => check.key === "direct");
  const global = report?.checks.find((check) => check.key === "global");
  const ip = (value?: string) => (value ? value : "—");

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 text-xs" role="status" aria-live="polite">
      <HugeiconsIcon
        icon={GlobeIcon}
        size={14}
        strokeWidth={1.8}
        aria-hidden="true"
        className="shrink-0 text-rb-muted"
      />
      {isLoading ? (
        <span className="flex items-center gap-1 text-rb-muted">
          <HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={1.8} aria-hidden="true" className="animate-spin" />
          {t("settings.probingIp")}
        </span>
      ) : error ? (
        <span className="truncate text-red-600 dark:text-red-400" title={error}>
          {t("settings.probeFailedPrefix")}
          {error}
        </span>
      ) : report ? (
        <div className="flex min-w-0 items-center gap-3 tabular-nums">
          <span className="truncate text-rb-muted">
            {t("settings.directIp")} <span className="text-rb-fg">{ip(direct?.result?.exit_ip)}</span>
          </span>
          <span className="truncate text-rb-muted">
            {t("settings.globalProxyIp")} <span className="text-rb-fg">{ip(global?.result?.exit_ip)}</span>
          </span>
        </div>
      ) : (
        <span className="text-rb-muted">{t("settings.noEgressResults")}</span>
      )}
      <button
        type="button"
        onClick={() => void probeEgress()}
        disabled={isLoading}
        aria-label={t("settings.refreshEgress")}
        className={cx(ghostButton, iconButtonMd, "size-6")}
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          size={12}
          strokeWidth={1.8}
          aria-hidden="true"
          className={isLoading ? "animate-spin" : undefined}
        />
      </button>
      <button
        type="button"
        onClick={() => void dismiss()}
        aria-label={t("settings.hideEgress")}
        className={cx(ghostButton, iconButtonMd, "size-6")}
      >
        <HugeiconsIcon icon={XIcon} size={12} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const { report: egressReport, error: egressError } = useEgressIp();

  const [authed, setAuthed] = useState(false);
  const [version, setVersion] = useState("");
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [noticesRead, setNoticesRead] = useState(false);

  const user = auth.getCurrentUser();
  const locale = resolveLocale(i18n.resolvedLanguage);
  const groups = useMemo(() => getSidebarItems(t), [t]);

  // Client-side auth gate: no token → bounce to /login and render nothing.
  useEffect(() => {
    if (auth.getToken()) {
      setAuthed(true);
    } else {
      auth.clearToken();
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setCollapsed(getClientCookie("sidebar_state") === "false");
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .version()
      .then((h) => {
        if (alive) setVersion((h.version ?? "").replace(/^v(?=\d)/, ""));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const cycleTheme = useCallback(() => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    setThemeMode(next);
    void persistPreference("theme_mode", next);
  }, [themeMode, setThemeMode]);

  const changeLocale = useCallback(
    (next: AppLocale) => {
      void i18n.changeLanguage(next);
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // Persistence is best-effort.
      }
    },
    [i18n],
  );

  const logout = useCallback(() => {
    auth.clearToken();
    window.location.href = "/login";
  }, []);

  const notices = useMemo<ShellNotice[]>(() => {
    const items: ShellNotice[] = [];
    if (egressError) {
      items.push({
        id: "egress-error",
        title: t("settings.probeFailedPrefix"),
        detail: egressError,
        at: t("clock.current"),
        tone: "critical",
        href: "/system/settings",
      });
    }
    for (const warning of egressReport?.warnings ?? []) {
      items.push({
        id: `egress-warning-${warning}`,
        title: warning,
        at: t("clock.current"),
        tone: "warning",
        href: "/system/settings",
      });
    }
    for (const detail of egressReport?.warning_details ?? []) {
      items.push({
        id: `egress-detail-${detail.code}`,
        title: detail.message,
        at: t("clock.current"),
        tone: "warning",
        href: "/system/settings",
      });
    }
    return items;
  }, [egressError, egressReport, t]);
  const shellUser = {
    name: user?.name ?? "ARTEX",
    username: user?.username ?? "artex",
    role: "operator",
  };

  const accountMenu: AccountMenuItem[] = [
    {
      id: "settings",
      label: t("nav.settings"),
      icon: Settings01Icon,
      onSelect: () => router.push("/system/settings"),
    },
    {
      id: "change-password",
      label: t("account.changePassword"),
      icon: Key01Icon,
      onSelect: () => setPasswordOpen(true),
    },
    {
      id: "logout",
      label: t("account.logout"),
      icon: Logout03Icon,
      onSelect: logout,
      danger: true,
    },
  ];

  const actions: PaletteAction[] = [
    {
      id: "dashboard",
      title: t("nav.dashboard"),
      icon: ArrowUpRightIcon,
      run: () => router.push("/dashboard"),
    },
    {
      id: "settings",
      title: t("nav.settings"),
      icon: Settings01Icon,
      run: () => router.push("/system/settings"),
    },
    {
      id: "change-password",
      title: t("account.changePassword"),
      icon: Key01Icon,
      run: () => setPasswordOpen(true),
    },
    {
      id: "logout",
      title: t("account.logout"),
      icon: Logout03Icon,
      run: logout,
    },
  ];

  if (!authed) return null;

  const fullBleed = isFullBleed(pathname);

  return (
    <div className="flex h-dvh overflow-hidden bg-rb-canvas text-rb-fg">
      <AppSidebar
        groups={groups}
        user={shellUser}
        accountMenu={accountMenu}
        collapsed={collapsed}
        onCollapsedChange={(next) => {
          setCollapsed(next);
          setClientCookie("sidebar_state", next ? "false" : "true");
        }}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppNavbar
          onOpenMobileNav={() => setMobileOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          notices={notices}
          noticesRead={noticesRead}
          onNoticesRead={() => setNoticesRead(true)}
          themeMode={themeMode}
          resolvedThemeMode={resolvedThemeMode}
          onCycleTheme={cycleTheme}
          locale={locale}
          onChangeLocale={changeLocale}
          userName={shellUser.name}
          userUsername={shellUser.username}
          accountMenu={accountMenu}
          leading={<EgressStatus />}
          trailing={
            <>
              <LiveClock />
              {version && (
                <span className="hidden font-medium text-rb-muted text-xs tabular-nums lg:inline">
                  {t("common.version")} · {version}
                </span>
              )}
              <UpdateBadge />
            </>
          }
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {fullBleed ? (
            children
          ) : (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
              <div className={cn(contentLayout === "centered" && "mx-auto w-full max-w-screen-2xl")}>{children}</div>
            </div>
          )}
        </main>
      </div>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} groups={groups} actions={actions} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <EgressIpProvider>
      <ShellInner>{children}</ShellInner>
    </EgressIpProvider>
  );
}
