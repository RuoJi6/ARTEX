"use client";

import * as React from "react";

import type { TFunction } from "i18next";
import { Globe2Icon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api } from "@/lib/api";
import type { EgressCheck, EgressReport } from "@/lib/types";
import { cn } from "@/lib/utils";

type EgressIpContextValue = {
  enabled: boolean;
  isLoading: boolean;
  report: EgressReport | null;
  error: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  probeEgress: () => Promise<EgressReport>;
  dismiss: () => Promise<void>;
};

const EgressIpContext = React.createContext<EgressIpContextValue | null>(null);

export function EgressIpProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = React.useState(false);
  const [report, setReport] = React.useState<EgressReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const probeForProxy = React.useCallback(async (globalProxy: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const nextReport = await api.testEgressProxy({ global_proxy: globalProxy });
      setReport(nextReport);
      return nextReport;
    } catch (cause) {
      setReport(null);
      const message = cause instanceof Error ? cause.message : "settings.unknownError";
      setError(message);
      throw cause;
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    api
      .settings()
      .then((settings) => {
        if (cancelled) return;
        const nextEnabled = !!settings.show_egress_ip;
        const nextProxy = settings.global_proxy ?? "";
        setEnabledState(nextEnabled);
        if (nextEnabled) void probeForProxy(nextProxy);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [probeForProxy]);

  React.useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void api
        .settings()
        .then((settings) => probeForProxy(settings.global_proxy ?? ""))
        .catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [enabled, probeForProxy]);

  const setEnabled = React.useCallback(
    async (nextEnabled: boolean) => {
      const settings = await api.setSettings({ show_egress_ip: nextEnabled });
      const nextProxy = settings.global_proxy ?? "";
      setEnabledState(nextEnabled);
      if (nextEnabled) {
        await probeForProxy(nextProxy);
      } else {
        setReport(null);
        setError(null);
      }
    },
    [probeForProxy],
  );

  // Refresh from settings first so a proxy saved on the settings page is always
  // the one used for the navbar probe.
  const probeEgress = React.useCallback(async () => {
    const settings = await api.settings();
    const nextProxy = settings.global_proxy ?? "";
    return probeForProxy(nextProxy);
  }, [probeForProxy]);

  const dismiss = React.useCallback(() => setEnabled(false), [setEnabled]);

  const value = React.useMemo(
    () => ({ enabled, isLoading, report, error, setEnabled, probeEgress, dismiss }),
    [dismiss, enabled, error, isLoading, probeEgress, report, setEnabled],
  );

  return <EgressIpContext.Provider value={value}>{children}</EgressIpContext.Provider>;
}

export function useEgressIp() {
  const context = React.useContext(EgressIpContext);
  if (!context) throw new Error("useEgressIp must be used within EgressIpProvider");
  return context;
}

function checkMessage(check: EgressCheck | undefined, t: TFunction) {
  if (!check) return t("settings.noProbeResult");
  if (check.skipped) return t("settings.notConfigured");
  if (check.result.ok) return check.result.exit_ip || t("settings.connected");
  return t("settings.probeFailed");
}

function IpValue({ label, check }: { label: string; check: EgressCheck | undefined }) {
  const { t } = useLiveTranslation();
  const failed = !!check && !check.skipped && !check.result.ok;
  return (
    <span className="min-w-0 truncate" title={`${label}:${checkMessage(check, t)}`}>
      <span className="text-muted-foreground">{label}</span> {"· "}
      <span className={cn("font-mono", failed && "text-destructive")}>{checkMessage(check, t)}</span>
    </span>
  );
}

export function EgressIpNavbar() {
  const { t } = useLiveTranslation();
  const { enabled, report, error, isLoading, probeEgress, dismiss } = useEgressIp();
  if (!enabled) return null;

  const direct = report?.checks.find((check) => check.key === "direct");
  const global = report?.checks.find((check) => check.key === "global");
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 text-xs" role="status" aria-live="polite">
      <Globe2Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {isLoading ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" aria-hidden="true" /> {t("settings.probingIp")}
        </span>
      ) : error ? (
        <span className="truncate text-destructive" title={t(error, { defaultValue: error })}>
          {t("settings.probeFailedPrefix")}
          {t(error, { defaultValue: error })}
        </span>
      ) : report ? (
        <div className="flex min-w-0 items-center gap-3">
          <IpValue label={t("settings.directIp")} check={direct} />
          <IpValue label={t("settings.globalProxyIp")} check={global} />
        </div>
      ) : (
        <span className="text-muted-foreground">{t("settings.noEgressResults")}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void probeEgress()}
        disabled={isLoading}
        aria-label={t("settings.refreshEgress")}
      >
        <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void dismiss()}
        aria-label={t("settings.hideEgress")}
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
