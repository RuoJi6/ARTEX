"use client";

import * as React from "react";

import {
  CameraIcon,
  CpuIcon,
  FlaskConicalIcon,
  KeyboardIcon,
  RadioTowerIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { localizedError } from "@/i18n/errors";
import { matchesSettingsQuery } from "@/i18n/settings-search";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api } from "@/lib/api";
import { CHAT_SEND_MODE_OPTIONS, type ChatSendMode, setChatSendMode, useChatSendMode } from "@/lib/chat-send-mode";
import type { EgressReport, LLMProfile, ProxyPoolEntry, Settings, WorkerPool } from "@/lib/types";

import { useEgressIp } from "../../_components/egress-ip-banner";
import { BasicAuthCard } from "./_components/basic-auth-card";
import { UpdateCard } from "./_components/update-card";

export default function SystemSettingsPage() {
  const { t, liveT, i18n } = useLiveTranslation();
  const [credentialAgent, setCredentialAgent] = React.useState(false);
  const [credentialBinding, setCredentialBinding] = React.useState(false);
  const [savingCredentials, setSavingCredentials] = React.useState(false);
  const [intelligenceEnabled, setIntelligenceEnabled] = React.useState(false);
  const [taskAutoTitleEnabled, setTaskAutoTitleEnabled] = React.useState(false);
  const [chatAutoTitleEnabled, setChatAutoTitleEnabled] = React.useState(false);
  const [savingIntelligence, setSavingIntelligence] = React.useState(false);
  const [trafficCapture, setTrafficCapture] = React.useState(false);
  const [browserScreenshot, setBrowserScreenshot] = React.useState(false);
  const [browserScreenshotTimestamp, setBrowserScreenshotTimestamp] = React.useState(false);
  const [opsecEnabled, setOpsecEnabled] = React.useState(false);
  const [settingQuery, setSettingQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("system");
  const [agentTrafficBinding, setAgentTrafficBinding] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [backend, setBackend] = React.useState("ddgs");
  const [braveKeySet, setBraveKeySet] = React.useState(false);
  const [braveKeyInput, setBraveKeyInput] = React.useState("");
  const [tavilyKeySet, setTavilyKeySet] = React.useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = React.useState("");
  const [deepSeekKeySet, setDeepSeekKeySet] = React.useState(false);
  const [deepSeekKeyInput, setDeepSeekKeyInput] = React.useState("");
  const [savingDeepSeekKey, setSavingDeepSeekKey] = React.useState(false);
  const [savingTavilyKey, setSavingTavilyKey] = React.useState(false);
  const [proxyInput, setProxyInput] = React.useState("");
  const [savingProxy, setSavingProxy] = React.useState(false);
  const [globalProxyInput, setGlobalProxyInput] = React.useState("");
  const [savingGlobalProxy, setSavingGlobalProxy] = React.useState(false);
  const [proxyPool, setProxyPool] = React.useState<ProxyPoolEntry[]>([]);
  const [proxyPoolActiveId, setProxyPoolActiveId] = React.useState("");
  const [proxyPoolText, setProxyPoolText] = React.useState("");
  const [proxyPoolTimed, setProxyPoolTimed] = React.useState(false);
  const [proxyPoolInterval, setProxyPoolInterval] = React.useState("30");
  const [proxyPoolFailure, setProxyPoolFailure] = React.useState(false);
  const [proxyPoolStrategy, setProxyPoolStrategy] = React.useState<"sequential" | "random">("sequential");
  const [proxyPoolThreshold, setProxyPoolThreshold] = React.useState("3");
  const [proxyPoolCooldown, setProxyPoolCooldown] = React.useState("60");
  const [proxyPoolHealthInterval, setProxyPoolHealthInterval] = React.useState("30");
  const [proxyPoolLogs, setProxyPoolLogs] = React.useState<
    Array<{ at: string; from: string; to: string; reason: string }>
  >([]);
  const [proxyReconnectMax, setProxyReconnectMax] = React.useState("5");
  const [proxyReconnectInterval, setProxyReconnectInterval] = React.useState("30");
  const [savingEgressVisibility, setSavingEgressVisibility] = React.useState(false);
  // 出口探测：测一次真实请求，拿到"直连 / 经全局代理"两条出口 IP。
  const [egressTesting, setEgressTesting] = React.useState(false);
  const [egressReport, setEgressReport] = React.useState<EgressReport | null>(null);
  // 请求序号：改了输入/保存/切捕获之后，在途请求回来时序号已经变了，直接丢弃。
  // 不这么做会出现"结果刚被清空，又被上一次的响应填回来"。
  const egressSeq = React.useRef(0);
  // 清空结果并作废在途请求。
  const clearEgressReport = () => {
    egressSeq.current += 1;
    setEgressReport(null);
    setEgressTesting(false);
  };
  // 探测地址：留空用公网回显；隔离网填内网回显服务。
  const [egressProbeUrl, setEgressProbeUrl] = React.useState("");
  const [savingEgressProbeUrl, setSavingEgressProbeUrl] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [pyInterp, setPyInterp] = React.useState("");
  const [workers, setWorkers] = React.useState("3");
  const [savingWorkers, setSavingWorkers] = React.useState(false);
  const [workerPools, setWorkerPools] = React.useState<WorkerPool[]>([]);
  const [llmProfiles, setLlmProfiles] = React.useState<LLMProfile[]>([]);
  // 操作约束注入范围(默认都开)。
  const [injectPlanner, setInjectPlanner] = React.useState(true);
  const [injectWorker, setInjectWorker] = React.useState(true);
  // 实验功能:noa 上下文压缩(默认关)。
  const [noaCompaction, setNoaCompaction] = React.useState(false);
  // 纯前端偏好：不走 /api/settings，直接读写 localStorage。
  const sendMode = useChatSendMode();
  const {
    enabled: showEgressIp,
    isLoading: egressProbeLoading,
    setEnabled: setShowEgressIp,
    probeEgress,
  } = useEgressIp();

  const apply = React.useCallback((s: Settings) => {
    setCredentialAgent(!!s.credential_agent_enabled);
    setCredentialBinding(!!s.credential_traffic_binding);
    setIntelligenceEnabled(!!s.task_intelligence_enabled);
    setTaskAutoTitleEnabled(!!s.task_auto_title_enabled);
    setChatAutoTitleEnabled(!!s.chat_auto_title_enabled);
    setTrafficCapture(!!s.traffic_capture);
    setBrowserScreenshot(!!s.browser_screenshot_enabled);
    setBrowserScreenshotTimestamp(!!s.browser_screenshot_timestamp_enabled);
    setOpsecEnabled(!!s.opsec_enabled);
    setAgentTrafficBinding(!!s.agent_traffic_binding);
    setWebSearch(!!s.web_search_enabled);
    setBackend(s.web_search_backend || "ddgs");
    setBraveKeySet(!!s.brave_key_set);
    setTavilyKeySet(!!s.tavily_key_set);
    setDeepSeekKeySet(!!s.deepseek_search_key_set);
    setProxyInput(s.web_search_proxy ?? "");
    const savedProxy = s.global_proxy ?? "";
    setGlobalProxyInput(savedProxy);
    setProxyPool(s.proxy_pool ?? []);
    setProxyPoolActiveId(s.proxy_pool_active_id ?? "");
    setProxyPoolTimed(!!s.proxy_rotate_timed_enabled);
    setProxyPoolInterval(String(s.proxy_rotate_interval_seconds ?? 30));
    setProxyPoolFailure(!!s.proxy_rotate_on_failure);
    setProxyPoolStrategy(s.proxy_rotate_strategy === "random" ? "random" : "sequential");
    setProxyPoolThreshold(String(s.proxy_health_fail_threshold ?? 3));
    setProxyPoolCooldown(String(s.proxy_health_cooldown_seconds ?? 60));
    setProxyPoolHealthInterval(String(s.proxy_health_check_interval_seconds ?? 30));
    setProxyPoolLogs(s.proxy_pool_switch_log ?? []);
    setProxyReconnectMax(String(s.proxy_reconnect_max_attempts ?? 5));
    setProxyReconnectInterval(String(s.proxy_reconnect_interval_seconds ?? 30));
    setEgressProbeUrl(s.egress_probe_url ?? "");
    setPyInterp(s.python_interpreter ?? "");
    setWorkers(String(s.workers ?? 3));
    setWorkerPools(s.worker_pools ?? []);
    setInjectPlanner(s.constraints_inject_planner !== false);
    setInjectWorker(s.constraints_inject_worker !== false);
    setNoaCompaction(!!s.noa_compaction);
  }, []);

  const saveWorkers = () => {
    if (!settingsLoaded) {
      toast.error(t("settings.workerConfigLoadFailed"));
      return;
    }
    const n = Number(workers);
    if (workerPools.length > 0) {
      const total = workerPools.reduce((sum, pool) => sum + Number(pool.workers), 0);
      if (workerPools.some((pool) => !pool.profile_id)) {
        toast.error(t("settings.choosePoolProfile"));
        return;
      }
      if (workerPools.some((pool) => !Number.isInteger(Number(pool.workers)) || Number(pool.workers) <= 0)) {
        toast.error(t("settings.positivePoolWorkers"));
        return;
      }
      if (total > 50) {
        toast.error(t("settings.workerLimit"));
        return;
      }
      const ids = workerPools.map((pool) => pool.profile_id);
      if (new Set(ids).size !== ids.length) {
        toast.error(t("settings.duplicatePoolProfile"));
        return;
      }
      setSavingWorkers(true);
      api
        .setSettings({
          workers: total,
          worker_pools: workerPools.map((pool) => ({ ...pool, workers: Number(pool.workers) })),
        })
        .then((s) => {
          apply(s);
          toast.success(t("settings.workerPoolsSaved"));
        })
        .catch((e) => toast.error(t("settings.saveFailed", { message: localizedError(e, t) })))
        .finally(() => setSavingWorkers(false));
      return;
    }
    if (!Number.isInteger(n) || n <= 0) {
      toast.error(t("settings.positiveConcurrency"));
      return;
    }
    setSavingWorkers(true);
    api
      .setSettings({ workers: n, worker_pools: [] })
      .then((s) => {
        apply(s);
        toast.success(t("settings.workersSaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSavingWorkers(false));
  };

  const addWorkerPool = () => setWorkerPools((pools) => [...pools, { profile_id: "", workers: 1 }]);

  const savePython = () => {
    setSaving(true);
    api
      .setSettings({ python_interpreter: pyInterp.trim() })
      .then((s) => {
        apply(s);
        toast.success(t("settings.pythonSaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSaving(false));
  };
  const detectPython = () => {
    setSaving(true);
    api
      .detectPython()
      .then((r) => setPyInterp(r.python_interpreter))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  React.useEffect(() => {
    api
      .settings()
      .then((s) => {
        apply(s);
        setSettingsLoaded(true);
        void api
          .proxyPool()
          .then((pool) => {
            setProxyPool(pool.entries);
            setProxyPoolActiveId(pool.active_id);
            setProxyPoolLogs(pool.switch_log);
          })
          .catch(() => undefined);
      })
      .catch(() => {
        setSettingsLoaded(false);
        toast.error(liveT("settings.workerConfigLocked"));
      })
      .finally(() => setLoaded(true));
  }, [apply, liveT]);

  React.useEffect(() => {
    api
      .llmProfiles()
      .then(setLlmProfiles)
      .catch(() => setLlmProfiles([]));
  }, []);

  const toggleTraffic = (v: boolean) => {
    setTrafficCapture(v); // optimistic
    setSaving(true);
    api
      .setSettings({ traffic_capture: v })
      .then((s) => {
        apply(s);
        // 捕获开关一变，② 的链路就变了，旧结果不能留。
        clearEgressReport();
      })
      .catch(() => setTrafficCapture(!v)) // revert on failure
      .finally(() => setSaving(false));
  };

  const toggleBrowserScreenshot = (v: boolean) => {
    setBrowserScreenshot(v);
    setSaving(true);
    api
      .setSettings({ browser_screenshot_enabled: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("settings.screenshotsEnabled") : t("settings.screenshotsDisabled"));
      })
      .catch((e) => {
        setBrowserScreenshot(!v);
        toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
      })
      .finally(() => setSaving(false));
  };

  const toggleBrowserScreenshotTimestamp = (v: boolean) => {
    setBrowserScreenshotTimestamp(v);
    setSaving(true);
    api
      .setSettings({ browser_screenshot_timestamp_enabled: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("settings.timestampsEnabled") : t("settings.timestampsDisabled"));
      })
      .catch((e) => {
        setBrowserScreenshotTimestamp(!v);
        toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
      })
      .finally(() => setSaving(false));
  };

  const toggleOpsec = (v: boolean) => {
    setOpsecEnabled(v);
    setSaving(true);
    api
      .setSettings({ opsec_enabled: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("settings.opsecEnabled") : t("settings.opsecDisabled"));
      })
      .catch((e) => {
        setOpsecEnabled(!v);
        toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
      })
      .finally(() => setSaving(false));
  };

  const matchesSetting = (keywordKey: string) => {
    return matchesSettingsQuery(i18n, keywordKey, settingQuery);
  };

  const isSettingVisible = (category: string, keywords: string) => {
    const query = settingQuery.trim();
    return query ? matchesSetting(keywords) : activeCategory === category;
  };

  const settingCategories = [
    { id: "system", label: t("settings.category.system"), hint: t("settings.category.systemHint"), icon: SettingsIcon },
    {
      id: "traffic",
      label: t("settings.category.traffic"),
      hint: t("settings.category.trafficHint"),
      icon: RadioTowerIcon,
    },
    { id: "agent", label: t("settings.category.agent"), hint: t("settings.category.agentHint"), icon: CpuIcon },
    {
      id: "network",
      label: t("settings.category.network"),
      hint: t("settings.category.networkHint"),
      icon: SearchIcon,
    },
    { id: "chat", label: t("settings.category.chat"), hint: t("settings.category.chatHint"), icon: KeyboardIcon },
  ] as const;

  const toggleInjectPlanner = (v: boolean) => {
    setInjectPlanner(v); // optimistic
    api
      .setSettings({ constraints_inject_planner: v })
      .then(apply)
      .catch(() => setInjectPlanner(!v)); // revert on failure
  };

  const toggleAgentTrafficBinding = (v: boolean) => {
    setAgentTrafficBinding(v);
    setSaving(true);
    api
      .setSettings({ agent_traffic_binding: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("settings.trafficBindingEnabled") : t("settings.trafficBindingDisabled"));
      })
      .catch((e) => {
        setAgentTrafficBinding(!v);
        toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
      })
      .finally(() => setSaving(false));
  };

  const toggleInjectWorker = (v: boolean) => {
    setInjectWorker(v); // optimistic
    api
      .setSettings({ constraints_inject_worker: v })
      .then(apply)
      .catch(() => setInjectWorker(!v)); // revert on failure
  };

  const toggleNoaCompaction = (v: boolean) => {
    setNoaCompaction(v); // optimistic
    api
      .setSettings({ noa_compaction: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("settings.noaEnabled") : t("settings.noaDisabled"));
      })
      .catch((e) => {
        setNoaCompaction(!v); // revert on failure
        toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
      });
  };

  const toggleAutoTitle = (key: "task_auto_title_enabled" | "chat_auto_title_enabled", value: boolean) => {
    const setter = key === "task_auto_title_enabled" ? setTaskAutoTitleEnabled : setChatAutoTitleEnabled;
    const patch: Partial<Settings> =
      key === "task_auto_title_enabled" ? { task_auto_title_enabled: value } : { chat_auto_title_enabled: value };
    setter(value);
    api
      .setSettings(patch)
      .then(apply)
      .catch((e) => {
        setter(!value);
        toast.error(t("settings.saveFailedPrefix") + localizedError(e, t));
      });
  };

  // Persist a web-search patch (enable and/or backend). Optimistic with refetch.
  const saveWebSearch = (patch: Partial<Settings>) => {
    setSaving(true);
    api
      .setSettings(patch)
      .then((s) => {
        apply(s);
        toast.success(t("settings.webSearchSaved"));
      })
      .catch((e) => {
        toast.error(t("settings.saveFailedPrefix") + localizedError(e, t));
        api
          .settings()
          .then(apply)
          .catch(() => undefined);
      })
      .finally(() => setSaving(false));
  };

  const saveBraveKey = () => {
    setSavingKey(true);
    api
      .setSettings({ brave_search_api_key: braveKeyInput })
      .then((s) => {
        apply(s);
        setBraveKeyInput("");
        toast.success(t("settings.braveKeySaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSavingKey(false));
  };

  const saveTavilyKey = () => {
    setSavingTavilyKey(true);
    api
      .setSettings({ tavily_search_api_key: tavilyKeyInput })
      .then((s) => {
        apply(s);
        setTavilyKeyInput("");
        toast.success(t("settings.tavilyKeySaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSavingTavilyKey(false));
  };

  const saveDeepSeekKey = () => {
    setSavingDeepSeekKey(true);
    api
      .setSettings({ deepseek_search_api_key: deepSeekKeyInput })
      .then((s) => {
        apply(s);
        setDeepSeekKeyInput("");
        toast.success(t("settings.deepSeekKeySaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailed", { message: localizedError(e, t) })))
      .finally(() => setSavingDeepSeekKey(false));
  };

  const saveProxy = () => {
    setSavingProxy(true);
    api
      .setSettings({ web_search_proxy: proxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(proxyInput.trim() ? t("settings.searchProxySaved") : t("settings.searchProxyCleared"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSavingProxy(false));
  };

  const saveGlobalProxy = () => {
    if (proxyPool.length > 0) {
      toast.info(t("settings.poolOverridesProxy"));
      return;
    }
    setSavingGlobalProxy(true);
    api
      .setSettings({ global_proxy: globalProxyInput.trim() })
      .then((s) => {
        apply(s);
        // 保存后链路变了，旧结果（尤其"尚未保存"）立刻失效。
        clearEgressReport();
        if (showEgressIp) void probeEgress().catch(() => undefined);
        toast.success(globalProxyInput.trim() ? t("settings.globalProxySaved") : t("settings.globalProxyCleared"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)))
      .finally(() => setSavingGlobalProxy(false));
  };

  const importProxyPool = () => {
    api
      .importProxyPool({ text: proxyPoolText })
      .then((r) => {
        setProxyPool(r.entries);
        setProxyPoolActiveId(r.active_id);
        setProxyPoolLogs(r.switch_log);
        setProxyPoolText("");
        if (r.errors.length)
          toast.error(
            r.errors.map((e) => t("settings.importLineError", { line: e.line, message: e.error })).join("；"),
          );
        else toast.success(t("settings.proxyPoolImported"));
      })
      .catch((e) => toast.error(t("settings.importFailedPrefix") + localizedError(e, t)));
  };
  const saveProxyPoolStrategy = () => {
    const interval = Number(proxyPoolInterval);
    if (!Number.isFinite(interval) || !Number.isInteger(interval) || interval < 3) {
      toast.error(t("settings.invalidRotationInterval"));
      return;
    }
    api
      .setSettings({
        proxy_rotate_timed_enabled: proxyPoolTimed,
        proxy_rotate_interval_seconds: Number(proxyPoolInterval),
        proxy_rotate_on_failure: proxyPoolFailure,
        proxy_rotate_strategy: proxyPoolStrategy,
        proxy_health_fail_threshold: Number(proxyPoolThreshold),
        proxy_health_cooldown_seconds: Number(proxyPoolCooldown),
        proxy_health_check_interval_seconds: Number(proxyPoolHealthInterval),
      })
      .then((s) => {
        apply(s);
        toast.success(t("settings.rotationSaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)));
  };
  const testAllProxyPool = () =>
    api
      .testAllProxyPool()
      .then((r) => {
        setProxyPool(r.entries);
        setProxyPoolActiveId(r.active_id);
        setProxyPoolLogs(r.switch_log);
        toast.success(t("settings.allProxiesTested"));
      })
      .catch((e) => toast.error(t("settings.probeFailedPrefix") + localizedError(e, t)));
  const testOneProxyPool = (id: string) =>
    api
      .testProxyPoolEntry(id)
      .then(() => api.proxyPool())
      .then((r) => {
        setProxyPool(r.entries);
        setProxyPoolActiveId(r.active_id);
        setProxyPoolLogs(r.switch_log);
      })
      .catch((e) => toast.error(t("settings.probeFailedPrefix") + localizedError(e, t)));
  const refreshProxyPool = () =>
    api.proxyPool().then((r) => {
      setProxyPool(r.entries);
      setProxyPoolActiveId(r.active_id);
      setProxyPoolLogs(r.switch_log);
    });
  const toggleProxyPoolEntry = (entry: ProxyPoolEntry) =>
    api
      .updateProxyPool(entry.id, { enabled: !entry.enabled })
      .then(() => refreshProxyPool())
      .catch((e) => toast.error(t("settings.updateFailedPrefix") + localizedError(e, t)));
  const deleteProxyPoolEntry = (id: string) =>
    api
      .deleteProxyPool(id)
      .then(() => refreshProxyPool())
      .catch((e) => toast.error(t("settings.deleteFailedPrefix") + localizedError(e, t)));

  const saveProxyReconnect = () => {
    api
      .setSettings({
        proxy_reconnect_max_attempts: Number(proxyReconnectMax),
        proxy_reconnect_interval_seconds: Number(proxyReconnectInterval),
      })
      .then((s) => {
        apply(s);
        toast.success(t("settings.reconnectSaved"));
      })
      .catch((e) => toast.error(t("settings.saveFailedPrefix") + localizedError(e, t)));
  };

  const saveEgressProbeUrl = async () => {
    setSavingEgressProbeUrl(true);
    try {
      const settings = await api.setSettings({ egress_probe_url: egressProbeUrl.trim() });
      setEgressProbeUrl(settings.egress_probe_url ?? "");
      clearEgressReport();
      toast.success(settings.egress_probe_url ? t("settings.probeServiceSaved") : t("settings.probeServiceReset"));
      if (showEgressIp) void probeEgress().catch(() => undefined);
    } catch (e) {
      toast.error(t("settings.probeServiceSaveFailed", { message: localizedError(e, t) }));
    } finally {
      setSavingEgressProbeUrl(false);
    }
  };

  // 测表单里当前的值，不要求先保存；后端返回直连 / 经代理两条。
  const testEgress = () => {
    const seq = ++egressSeq.current;
    setEgressTesting(true);
    setEgressReport(null);
    api
      .testEgressProxy({
        global_proxy: globalProxyInput.trim(),
        resume: true,
        probe_url: egressProbeUrl.trim(),
      })
      .then((rep) => {
        if (seq !== egressSeq.current) return; // 期间改过配置，这份结果已经过期
        setEgressReport(rep);
        if (rep.ok) {
          // 先取 ②：直连那行永远成功，先命中它会把直连 IP 当成出口报出去。
          const hit =
            rep.checks.find((c) => c.key === "global" && !c.skipped && c.result.ok) ??
            rep.checks.find((c) => !c.skipped && c.result.ok);
          toast.success(
            hit?.result.exit_ip ? t("settings.egressResult", { ip: hit.result.exit_ip }) : t("settings.probeSucceeded"),
          );
        } else {
          toast.error(t("settings.egressFailed"));
        }
      })
      .catch((e) => {
        if (seq === egressSeq.current) toast.error(t("settings.probeFailedPrefix") + localizedError(e, t));
      })
      .finally(() => {
        if (seq === egressSeq.current) setEgressTesting(false);
      });
  };

  const toggleEgressVisibility = async (nextEnabled: boolean) => {
    setSavingEgressVisibility(true);
    try {
      await setShowEgressIp(nextEnabled);
      toast.success(nextEnabled ? t("settings.egressShown") : t("settings.egressHidden"));
    } catch (e) {
      toast.error(t("settings.egressVisibilityFailed") + localizedError(e, t));
    } finally {
      setSavingEgressVisibility(false);
    }
  };

  // Run a real "test" search ("test") against the CURRENT form values (backend +
  // proxy + entered key), falling back to saved values server-side. Toasts result.
  const runTest = () => {
    setTesting(true);
    api
      .testWebSearch({
        web_search_backend: backend,
        web_search_proxy: proxyInput.trim(),
        brave_search_api_key: braveKeyInput,
        tavily_search_api_key: tavilyKeyInput,
        deepseek_search_api_key: deepSeekKeyInput,
      })
      .then((r) => {
        if (r.ok) toast.success(t("settings.searchTestSucceeded", { backend: r.backend, count: r.count }));
        else toast.error(t("settings.searchTestFailedPrefix") + (r.error || t("settings.unknownError")));
      })
      .catch((e) => toast.error(t("settings.searchTestFailedPrefix") + localizedError(e, t)))
      .finally(() => setTesting(false));
  };

  // brave-free selected but no key stored and none being entered → tool stays off.
  const braveNeedsKey = webSearch && backend === "brave-free" && !braveKeySet;

  const saveCredentialOptions = async (patch: Partial<Settings>) => {
    setSavingCredentials(true);
    try {
      const s = await api.setSettings(patch);
      setCredentialAgent(!!s.credential_agent_enabled);
      setCredentialBinding(!!s.credential_traffic_binding);
      setIntelligenceEnabled(!!s.task_intelligence_enabled);
      toast.success(t("settings.credentialsSaved"));
    } catch (e) {
      toast.error(t("settings.saveFailedPrefix") + localizedError(e, t));
    } finally {
      setSavingCredentials(false);
    }
  };
  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("settings.subtitle")}</p>
        <div className="relative mt-4 max-w-xl">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={settingQuery}
            onChange={(event) => setSettingQuery(event.target.value)}
            placeholder={t("settings.searchPlaceholder")}
            className="pl-9"
            aria-label={t("settings.searchLabel")}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="shrink-0 lg:sticky lg:top-4 lg:w-64">
          <div className="rounded-xl border bg-card/60 p-2 shadow-sm">
            <div className="px-3 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("settings.directory")}
            </div>
            <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label={t("settings.categoriesLabel")}>
              {settingCategories.map((category) => {
                const Icon = category.icon;
                const active = !settingQuery.trim() && activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id);
                      setSettingQuery("");
                    }}
                    className={`group flex min-w-max items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors lg:min-w-0 ${
                      active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{category.label}</span>
                      <span
                        className={`hidden truncate text-xs lg:block ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                      >
                        {category.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold">
                {settingQuery.trim()
                  ? t("settings.searchResults")
                  : settingCategories.find((item) => item.id === activeCategory)?.label}
              </h2>
              <p className="text-muted-foreground text-xs">
                {settingQuery.trim()
                  ? t("settings.matchingSettings", { query: settingQuery.trim() })
                  : settingCategories.find((item) => item.id === activeCategory)?.hint}
              </p>
            </div>
            {settingQuery.trim() ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSettingQuery("")}>
                {t("settings.clearSearch")}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col divide-y rounded-xl border bg-card/30 px-3 [&>[data-slot=card]]:mb-0 [&>[data-slot=card]]:rounded-none [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:py-4 [&>[data-slot=card]]:ring-0">
            {isSettingVisible("system", "settings.keywords.update") ? <UpdateCard /> : null}
            {isSettingVisible("system", "settings.keywords.basicAuth") ? <BasicAuthCard /> : null}

            <Card
              className={`${isSettingVisible("traffic", "settings.keywords.trafficCapture") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RadioTowerIcon className="size-4" />
                  {t("settings.trafficCapture")}
                </CardTitle>
                <CardDescription>
                  {t("settings.trafficCaptureHelp")}
                  <br />
                  {t("settings.trafficCaptureOffStart")}
                  <b>{t("settings.willNot")}</b>
                  {t("settings.trafficCaptureOffMiddle")}
                  <b>{t("settings.doNotContain")}</b>
                  {t("settings.trafficCaptureOffEnd")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="traffic-capture" className="text-sm font-normal text-muted-foreground">
                  {trafficCapture ? t("settings.captureOn") : t("settings.captureOff")}
                </Label>
                <Switch
                  id="traffic-capture"
                  checked={trafficCapture}
                  disabled={!loaded || saving}
                  onCheckedChange={toggleTraffic}
                />
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("traffic", "settings.keywords.trafficBinding") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RadioTowerIcon className="size-4" />
                  {t("settings.trafficBinding")}
                </CardTitle>
                <CardDescription id="agent-traffic-binding-description">
                  {t("settings.trafficBindingHelp")}
                  <b>{t("settings.trafficBindingCost")}</b>
                  <br />
                  {t("settings.trafficBindingDetails")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="agent-traffic-binding" className="text-sm font-normal text-muted-foreground">
                  {agentTrafficBinding ? t("settings.bindingOn") : t("settings.bindingOff")}
                </Label>
                <Switch
                  id="agent-traffic-binding"
                  aria-describedby="agent-traffic-binding-description"
                  checked={agentTrafficBinding}
                  disabled={!loaded || saving}
                  onCheckedChange={toggleAgentTrafficBinding}
                />
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("traffic", "settings.keywords.browserSecurity") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CameraIcon className="size-4" />
                  {t("settings.browserSecurity")}
                </CardTitle>
                <CardDescription>{t("settings.browserSecurityHelp")}</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                  <div className="min-w-0">
                    <Label htmlFor="browser-screenshot" className="text-sm font-medium">
                      {t("settings.browserScreenshots")}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">{t("settings.browserScreenshotsHelp")}</p>
                  </div>
                  <Switch
                    id="browser-screenshot"
                    checked={browserScreenshot}
                    disabled={!loaded || saving}
                    onCheckedChange={toggleBrowserScreenshot}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor="browser-screenshot-timestamp" className="text-sm font-medium">
                      {t("settings.screenshotTimestamp")}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">{t("settings.screenshotTimestampHelp")}</p>
                  </div>
                  <Switch
                    id="browser-screenshot-timestamp"
                    checked={browserScreenshotTimestamp}
                    disabled={!loaded || saving}
                    onCheckedChange={toggleBrowserScreenshotTimestamp}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                  <div className="min-w-0">
                    <Label htmlFor="opsec-enabled" className="text-sm font-medium">
                      {t("settings.opsec")}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">{t("settings.opsecHelp")}</p>
                  </div>
                  <Switch
                    id="opsec-enabled"
                    checked={opsecEnabled}
                    disabled={!loaded || saving}
                    onCheckedChange={toggleOpsec}
                  />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("traffic", "settings.keywords.globalProxy") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RadioTowerIcon className="size-4" />
                  {t("settings.globalProxy")}
                </CardTitle>
                <CardDescription>{t("settings.globalProxyHelp")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <section className="space-y-2">
                  <Label htmlFor="global-proxy" className="text-sm font-normal text-muted-foreground">
                    {t("settings.proxyAddress")}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="global-proxy"
                      className="min-w-0 flex-1"
                      autoComplete="off"
                      placeholder={t("settings.globalProxyPlaceholder")}
                      value={globalProxyInput}
                      disabled={!loaded || savingGlobalProxy}
                      onChange={(e) => {
                        setGlobalProxyInput(e.target.value);
                        // 旧结果对应的是上一次的地址，留着会让人以为新值已经测过。
                        clearEgressReport();
                      }}
                    />
                    <Button type="button" onClick={saveGlobalProxy} disabled={!loaded || savingGlobalProxy}>
                      {t("settings.save")}
                    </Button>
                    {/* 测表单里当前的值，不要求先保存。 */}
                    <Button type="button" variant="outline" onClick={testEgress} disabled={!loaded || egressTesting}>
                      {egressTesting ? t("settings.testing") : t("settings.testProxy")}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {globalProxyInput.trim() ? t("settings.proxyConfigured") : t("settings.proxyUnconfigured")}
                  </p>
                  <details className="text-xs">
                    <summary className="text-muted-foreground cursor-pointer select-none">
                      {t("settings.howProxyWorks")}
                    </summary>
                    <p className="text-muted-foreground mt-2 max-w-4xl leading-relaxed">
                      {t("settings.howProxyWorksHelp")}
                    </p>
                  </details>
                </section>
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer select-none">
                    {t("settings.reconnection")}
                  </summary>
                  <div className="mt-3 space-y-3 rounded-md border p-3 sm:p-4">
                    <p className="text-muted-foreground">{t("settings.reconnectionHelp")}</p>
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="space-y-1.5">
                        <Label htmlFor="proxy-reconnect-max">{t("settings.reconnectAttempts")}</Label>
                        <Input
                          id="proxy-reconnect-max"
                          type="number"
                          min={1}
                          value={proxyReconnectMax}
                          onChange={(e) => setProxyReconnectMax(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="proxy-reconnect-interval">{t("settings.reconnectInterval")}</Label>
                        <Input
                          id="proxy-reconnect-interval"
                          type="number"
                          min={1}
                          value={proxyReconnectInterval}
                          onChange={(e) => setProxyReconnectInterval(e.target.value)}
                        />
                      </div>
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={saveProxyReconnect}>
                        {t("settings.savePolicy")}
                      </Button>
                    </div>
                  </div>
                </details>
                <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <Label htmlFor="show-egress-ip" className="text-sm font-normal">
                      {t("settings.showEgress")}
                    </Label>
                    <p className="text-muted-foreground text-xs">{t("settings.showEgressHelp")}</p>
                  </div>
                  <Switch
                    id="show-egress-ip"
                    checked={showEgressIp}
                    disabled={!settingsLoaded || savingEgressVisibility || egressProbeLoading}
                    onCheckedChange={(checked) => void toggleEgressVisibility(checked)}
                  />
                </div>
                {/* 紧贴结果区：用户看两行时正好需要它。细节放文档。 */}
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer select-none">
                    {t("settings.egressTestDetails")}
                  </summary>
                  <p className="text-muted-foreground mt-2 leading-relaxed">{t("settings.egressTestHelp")}</p>
                </details>
                {/* 内网里公网回显不可达，两行都会失败——不是代理坏了。 */}
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer select-none">
                    {t("settings.customProbe")}
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    <Label htmlFor="egress-probe-url">{t("settings.probeUrl")}</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="egress-probe-url"
                        autoComplete="off"
                        placeholder={t("settings.probePlaceholder")}
                        value={egressProbeUrl}
                        disabled={!settingsLoaded || savingEgressProbeUrl}
                        onChange={(e) => {
                          setEgressProbeUrl(e.target.value);
                          clearEgressReport();
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!settingsLoaded || savingEgressProbeUrl}
                        onClick={() => void saveEgressProbeUrl()}
                      >
                        {savingEgressProbeUrl ? t("settings.saving") : t("settings.saveProbe")}
                      </Button>
                    </div>
                    <span className="text-muted-foreground leading-relaxed">{t("settings.probePersistenceHelp")}</span>
                    <span className="text-muted-foreground leading-relaxed">
                      {t("settings.probeResponseStart")}
                      <code>{'{"ip":"1.2.3.4"}'}</code>
                      {t("settings.probeResponseEnd")}
                    </span>
                  </div>
                </details>
                {egressReport && (
                  <div className="flex flex-col gap-1 text-xs">
                    {egressReport.checks.map((c) => {
                      // 经 MITM 时 via 是 HTTP（MITM 自己是代理），标出来会让人以为填错了。
                      const viaCapture = !!c.path && c.path !== egressReport.configured;
                      return (
                        <div key={c.key} className="flex flex-wrap items-center gap-x-2">
                          <span
                            className={
                              c.skipped
                                ? "text-muted-foreground"
                                : c.result.ok
                                  ? "text-emerald-600"
                                  : "text-destructive"
                            }
                          >
                            {c.skipped ? "—" : c.result.ok ? "✓" : "✗"}
                          </span>

                          <span
                            className="w-56 shrink-0"
                            title={
                              c.key === "direct"
                                ? t("settings.directProbeHint")
                                : viaCapture
                                  ? t("settings.captureProbeHint", { path: c.path })
                                  : t("settings.proxyProbeHint")
                            }
                          >
                            {t(`settings.egressCheck.${c.key}`, { defaultValue: c.label })}
                          </span>
                          {c.skipped ? (
                            <span className="text-muted-foreground">
                              {c.skip_code
                                ? t(`settings.egressSkip.${c.skip_code}`, { defaultValue: c.skip_reason })
                                : c.skip_reason}
                            </span>
                          ) : c.result.ok ? (
                            <span className="font-mono">
                              <span title={t("settings.outboundIpHint")}>{c.result.exit_ip}</span> ·{" "}
                              <span title={t("settings.latencyHint")}>{c.result.latency_ms}ms</span>
                              {c.result.via && c.result.via !== "direct" && !viaCapture && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  {t("settings.viaPrefix")}
                                  {c.result.via.toUpperCase()}
                                </span>
                              )}
                            </span>
                          ) : (
                            // 只显示第一个地址的原因：refused=代理没开，timeout=出不了网。
                            <span className="text-destructive">
                              {c.result.probes?.find((p) => p.error)?.error ?? c.result.error}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {(
                      egressReport.warning_details ??
                      egressReport.warnings?.map((message) => ({ code: "", message, params: {} }))
                    )?.map((notice) => (
                      <p key={notice.code || notice.message} className="text-amber-700">
                        ⚠{" "}
                        {notice.code
                          ? t(`settings.egressWarning.${notice.code}`, {
                              ...notice.params,
                              defaultValue: notice.message,
                            })
                          : notice.message}
                      </p>
                    ))}
                  </div>
                )}
                <section className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {t("settings.proxyPool")}{" "}
                        <span className="text-muted-foreground font-normal">{proxyPool.length}</span>
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("settings.currentProxyPrefix")}
                        {proxyPool.find((entry) => entry.id === proxyPoolActiveId)?.name ??
                          (proxyPoolActiveId ? t("settings.selectedProxy") : t("settings.direct"))}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={testAllProxyPool}>
                      {t("settings.testAll")}
                    </Button>
                  </div>
                  <details className="rounded-md border px-3 py-2 text-xs">
                    <summary className="text-muted-foreground cursor-pointer select-none">
                      {t("settings.importProxies")}
                    </summary>
                    <Textarea
                      className="mt-3 font-mono"
                      rows={3}
                      placeholder={t("settings.importPlaceholder")}
                      value={proxyPoolText}
                      onChange={(e) => setProxyPoolText(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={importProxyPool} disabled={!proxyPoolText.trim()}>
                        {t("settings.import")}
                      </Button>
                      <span className="text-muted-foreground">{t("settings.proxyCredentialsHidden")}</span>
                    </div>
                  </details>
                  <div className="space-y-2">
                    {proxyPool.length === 0 ? (
                      <p className="text-muted-foreground text-xs">{t("settings.emptyProxyPool")}</p>
                    ) : (
                      proxyPool.map((entry) => (
                        <div
                          key={entry.id}
                          className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <Switch
                              checked={entry.enabled}
                              onCheckedChange={() => toggleProxyPoolEntry(entry)}
                              aria-label={t("settings.enableProxy")}
                            />
                            <div className="grid min-w-0 flex-1 gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
                              <div className="min-w-0">
                                <p className="text-muted-foreground">{t("settings.proxyAddress")}</p>
                                <p className="truncate font-mono" title={entry.url}>
                                  {entry.name ? `${entry.name} · ` : ""}
                                  {entry.url}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">{t("settings.testOutboundIp")}</p>
                                <p className="break-all font-mono">
                                  {entry.egress_ip ||
                                    (entry.last_error ? t("settings.probeFailed") : t("settings.notTested"))}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                  className={
                                    entry.health === "healthy"
                                      ? "text-emerald-600"
                                      : entry.health === "disabled"
                                        ? "text-muted-foreground"
                                        : "text-amber-600"
                                  }
                                >
                                  {!entry.enabled
                                    ? t("settings.disabled")
                                    : entry.health === "healthy"
                                      ? t("settings.healthy")
                                      : entry.health === "unhealthy-cooling"
                                        ? t("settings.coolingDown")
                                        : t("settings.pendingCheck")}
                                </span>
                                {entry.id === proxyPoolActiveId && (
                                  <span className="text-primary">{t("settings.activeProxy")}</span>
                                )}
                                <span className="text-muted-foreground">
                                  {t("settings.failureCount", { count: entry.consecutive_failures })}
                                </span>
                              </div>
                              <div className="text-muted-foreground">
                                {entry.latency_ms != null ? `${entry.latency_ms} ms` : t("settings.noLatency")}
                                {entry.last_checked_at &&
                                  !entry.last_checked_at.startsWith("0001-") &&
                                  ` · ${new Date(entry.last_checked_at).toLocaleTimeString(i18n.resolvedLanguage)}`}
                                {entry.last_error && <span className="text-destructive"> · {entry.last_error}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => testOneProxyPool(entry.id)}>
                              {t("settings.test")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteProxyPoolEntry(entry.id)}
                            >
                              {t("settings.delete")}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <details className="rounded-md border px-3 py-2 text-xs">
                    <summary className="text-muted-foreground cursor-pointer select-none">
                      {t("settings.rotationHealth")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="text-muted-foreground">{t("settings.rotationHealthHelp")}</p>
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b pb-3">
                        <div className="flex items-center gap-3">
                          <Label htmlFor="proxy-pool-timed">{t("settings.timedRotation")}</Label>
                          <Switch id="proxy-pool-timed" checked={proxyPoolTimed} onCheckedChange={setProxyPoolTimed} />
                        </div>
                        <div className="flex items-center gap-3">
                          <Label htmlFor="proxy-pool-failure">{t("settings.failureRotation")}</Label>
                          <Switch
                            id="proxy-pool-failure"
                            checked={proxyPoolFailure}
                            onCheckedChange={setProxyPoolFailure}
                          />
                        </div>
                      </div>
                      <div className="grid max-w-2xl grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="proxy-pool-strategy">{t("settings.rotationOrder")}</Label>
                          <Select
                            value={proxyPoolStrategy}
                            onValueChange={(v) => setProxyPoolStrategy(v as "sequential" | "random")}
                          >
                            <SelectTrigger id="proxy-pool-strategy" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sequential">{t("settings.sequential")}</SelectItem>
                              <SelectItem value="random">{t("settings.random")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="proxy-pool-interval">{t("settings.rotationInterval")}</Label>
                          <Input
                            id="proxy-pool-interval"
                            type="number"
                            min={3}
                            value={proxyPoolInterval}
                            onChange={(e) => setProxyPoolInterval(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="proxy-pool-threshold">{t("settings.failureThreshold")}</Label>
                          <Input
                            id="proxy-pool-threshold"
                            type="number"
                            min={1}
                            value={proxyPoolThreshold}
                            onChange={(e) => setProxyPoolThreshold(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="proxy-pool-cooldown">{t("settings.cooldown")}</Label>
                          <Input
                            id="proxy-pool-cooldown"
                            type="number"
                            min={1}
                            value={proxyPoolCooldown}
                            onChange={(e) => setProxyPoolCooldown(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="proxy-pool-health-interval">{t("settings.healthInterval")}</Label>
                          <Input
                            id="proxy-pool-health-interval"
                            type="number"
                            min={1}
                            value={proxyPoolHealthInterval}
                            onChange={(e) => setProxyPoolHealthInterval(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end border-t pt-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={saveProxyPoolStrategy}
                        >
                          {t("settings.saveRotation")}
                        </Button>
                      </div>
                    </div>
                  </details>
                  {proxyPoolLogs.length > 0 && (
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer select-none">
                        {t("settings.switchHistory", { count: proxyPoolLogs.length })}
                      </summary>
                      <div className="mt-2 space-y-1">
                        {proxyPoolLogs
                          .slice(-5)
                          .reverse()
                          .map((log) => (
                            <p key={`${log.at}-${log.to}`} className="text-muted-foreground">
                              {new Date(log.at).toLocaleTimeString(i18n.resolvedLanguage)} ·{" "}
                              {log.from || t("settings.direct")} → {log.to || t("settings.direct")} · {log.reason}
                            </p>
                          ))}
                      </div>
                    </details>
                  )}
                </section>
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("agent", "settings.keywords.constraints") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlertIcon className="size-4" />
                  {t("settings.constraintInjection")}
                </CardTitle>
                <CardDescription>
                  {t("settings.constraintHelpStart")}
                  <b>{t("settings.constraints")}</b>
                  {t("settings.constraintHelpMiddle")}
                  <br />
                  {t("settings.constraintTargetsStart")}
                  <b>{t("settings.planner")}</b>
                  {t("settings.and")}
                  <b>{t("settings.worker")}</b>
                  {t("settings.constraintTargetsEnd")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="inject-planner" className="text-sm font-normal text-muted-foreground">
                    {t("settings.injectPlanner")}
                    {injectPlanner ? t("settings.enabledSuffix") : t("settings.disabledSuffix")}
                  </Label>
                  <Switch
                    id="inject-planner"
                    checked={injectPlanner}
                    disabled={!loaded}
                    onCheckedChange={toggleInjectPlanner}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="inject-worker" className="text-sm font-normal text-muted-foreground">
                    {t("settings.injectWorker")}
                    {injectWorker ? t("settings.enabledSuffix") : t("settings.disabledSuffix")}
                  </Label>
                  <Switch
                    id="inject-worker"
                    checked={injectWorker}
                    disabled={!loaded}
                    onCheckedChange={toggleInjectWorker}
                  />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("agent", "settings.keywords.noa") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConicalIcon className="size-4" />
                  {t("settings.experimental")}
                </CardTitle>
                <CardDescription>
                  {t("settings.experimentalHelp")}
                  <br />
                  <b>{t("settings.noa")}</b>
                  {t("settings.noaHelpStart")}
                  <b>{t("settings.noaAgentTypes")}</b>
                  {t("settings.noaHelpEnd")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="noa-compaction" className="text-sm font-normal text-muted-foreground">
                  {t("settings.noa")}
                  {noaCompaction ? t("settings.enabledSuffix") : t("settings.disabledSuffix")}
                </Label>
                <Switch
                  id="noa-compaction"
                  checked={noaCompaction}
                  disabled={!loaded}
                  onCheckedChange={toggleNoaCompaction}
                />
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("agent", "settings.keywords.autoTitles") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle>{t("settings.autoTitles")}</CardTitle>
                <CardDescription>{t("settings.autoTitlesHelp")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="task-auto-title">{t("settings.taskNames")}</FieldLabel>
                    <FieldDescription>{t("settings.taskNamesHelp")}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="task-auto-title"
                    checked={taskAutoTitleEnabled}
                    disabled={!loaded}
                    onCheckedChange={(value) => toggleAutoTitle("task_auto_title_enabled", value)}
                  />
                </Field>
                <Field orientation="horizontal" className="mt-5">
                  <FieldContent>
                    <FieldLabel htmlFor="chat-auto-title">{t("settings.chatTitles")}</FieldLabel>
                    <FieldDescription>{t("settings.chatTitlesHelp")}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="chat-auto-title"
                    checked={chatAutoTitleEnabled}
                    disabled={!loaded}
                    onCheckedChange={(value) => toggleAutoTitle("chat_auto_title_enabled", value)}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("agent", "settings.keywords.intelligence") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle>{t("settings.intelligence")}</CardTitle>
                <CardDescription>{t("settings.intelligenceHelp")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="task-intelligence">{t("settings.autoRecord")}</FieldLabel>
                    <FieldDescription>{t("settings.autoRecordHelp")}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="task-intelligence"
                    checked={intelligenceEnabled}
                    disabled={!loaded || savingIntelligence || savingCredentials}
                    onCheckedChange={async (value) => {
                      setSavingIntelligence(true);
                      try {
                        const settings = await api.setSettings({ task_intelligence_enabled: value });
                        setIntelligenceEnabled(!!settings.task_intelligence_enabled);
                        setCredentialAgent(!!settings.credential_agent_enabled);
                        setCredentialBinding(!!settings.credential_traffic_binding);
                        toast.success(value ? t("settings.autoRecordEnabled") : t("settings.autoRecordDisabled"));
                      } catch (error) {
                        toast.error(t("settings.saveFailedPrefix") + localizedError(error, t));
                      } finally {
                        setSavingIntelligence(false);
                      }
                    }}
                  />
                </Field>
                <Field orientation="horizontal" className="mt-5">
                  <FieldContent>
                    <FieldLabel htmlFor="credential-agent">{t("settings.credentialAgent")}</FieldLabel>
                    <FieldDescription>{t("settings.credentialAgentHelp")}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="credential-agent"
                    checked={credentialAgent}
                    disabled={!loaded || savingCredentials || savingIntelligence || !intelligenceEnabled}
                    onCheckedChange={(value) => void saveCredentialOptions({ credential_agent_enabled: value })}
                  />
                </Field>
                {credentialAgent ? (
                  <Field orientation="horizontal" className="mt-5">
                    <FieldContent>
                      <FieldLabel htmlFor="credential-traffic">{t("settings.bindTraffic")}</FieldLabel>
                      <FieldDescription>{t("settings.bindTrafficHelp")}</FieldDescription>
                    </FieldContent>
                    <Switch
                      id="credential-traffic"
                      checked={credentialBinding}
                      disabled={!loaded || savingCredentials}
                      onCheckedChange={(value) => void saveCredentialOptions({ credential_traffic_binding: value })}
                    />
                  </Field>
                ) : null}
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("network", "settings.keywords.webSearch") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SearchIcon className="size-4" />
                  {t("settings.webSearch")}
                </CardTitle>
                <CardDescription>
                  {t("settings.webSearchOverview")}
                  <br />
                  {t("settings.searchProviderHelp")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="web-search" className="text-sm font-normal text-muted-foreground">
                    {webSearch ? t("settings.searchOn") : t("settings.searchOff")}
                  </Label>
                  <Switch
                    id="web-search"
                    checked={webSearch}
                    disabled={!loaded || saving}
                    onCheckedChange={(v) => {
                      setWebSearch(v); // optimistic
                      saveWebSearch({ web_search_enabled: v });
                    }}
                  />
                </div>

                {webSearch && (
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm font-normal text-muted-foreground">{t("settings.searchProvider")}</Label>
                    <Select
                      value={backend}
                      disabled={!loaded || saving}
                      onValueChange={(v) => {
                        setBackend(v); // optimistic
                        saveWebSearch({ web_search_backend: v });
                      }}
                    >
                      <SelectTrigger className="w-48 shrink-0">
                        <SelectValue placeholder={t("settings.chooseProvider")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ddgs">{t("settings.duckDuckGo")}</SelectItem>
                        <SelectItem value="brave-free">{t("settings.braveOption")}</SelectItem>
                        <SelectItem value="tavily">{t("settings.tavilyOption")}</SelectItem>
                        <SelectItem value="deepseek">{t("settings.deepSeekOption")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {webSearch && backend === "deepseek" && (
                  <div className="border-border/60 bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{t("settings.deepSeekSearch")}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">{t("settings.deepSeekHelp")}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">{t("settings.deepSeekNetworkHelp")}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={
                          deepSeekKeySet ? t("settings.keyConfiguredPlaceholder") : "DeepSeek Search API Key"
                        }
                        value={deepSeekKeyInput}
                        disabled={!loaded || savingDeepSeekKey}
                        onChange={(e) => setDeepSeekKeyInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={saveDeepSeekKey}
                        disabled={!loaded || savingDeepSeekKey || deepSeekKeyInput.trim() === ""}
                      >
                        {t("settings.save")}
                      </Button>
                    </div>
                    {deepSeekKeySet && <span className="text-xs text-emerald-500">{t("settings.keyConfigured")}</span>}
                  </div>
                )}

                {webSearch && backend === "brave-free" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="brave-key" className="text-sm font-normal text-muted-foreground">
                      Brave Search API Key
                      {braveKeySet && <span className="ml-2 text-xs text-emerald-500">{t("settings.configured")}</span>}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="brave-key"
                        type="password"
                        autoComplete="off"
                        placeholder={
                          braveKeySet ? t("settings.keyConfiguredPlaceholder") : t("settings.braveKeyPlaceholder")
                        }
                        value={braveKeyInput}
                        disabled={!loaded || savingKey}
                        onChange={(e) => setBraveKeyInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={saveBraveKey}
                        disabled={!loaded || savingKey || braveKeyInput.trim() === ""}
                      >
                        {t("settings.save")}
                      </Button>
                    </div>
                    {braveNeedsKey && <p className="text-xs text-amber-500">{t("settings.braveMissingKey")}</p>}
                    <p className="text-muted-foreground text-xs">{t("settings.braveQuota")}</p>
                  </div>
                )}

                {webSearch && backend === "tavily" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="tavily-key" className="text-sm font-normal text-muted-foreground">
                      Tavily Search API Key
                      {tavilyKeySet && (
                        <span className="ml-2 text-xs text-emerald-500">{t("settings.configured")}</span>
                      )}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="tavily-key"
                        type="password"
                        autoComplete="off"
                        placeholder={
                          tavilyKeySet ? t("settings.keyConfiguredPlaceholder") : t("settings.tavilyKeyPlaceholder")
                        }
                        value={tavilyKeyInput}
                        disabled={!loaded || savingTavilyKey}
                        onChange={(e) => setTavilyKeyInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={saveTavilyKey}
                        disabled={!loaded || savingTavilyKey || tavilyKeyInput.trim() === ""}
                      >
                        {t("settings.save")}
                      </Button>
                    </div>
                    {webSearch && backend === "tavily" && !tavilyKeySet && (
                      <p className="text-xs text-amber-500">{t("settings.tavilyMissingKey")}</p>
                    )}
                    <p className="text-muted-foreground text-xs">{t("settings.tavilySignup")}</p>
                  </div>
                )}

                {webSearch && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ws-proxy" className="text-sm font-normal text-muted-foreground">
                      {t("settings.outboundProxy")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="ws-proxy"
                        autoComplete="off"
                        placeholder={t("settings.proxyPlaceholder")}
                        value={proxyInput}
                        disabled={!loaded || savingProxy}
                        onChange={(e) => setProxyInput(e.target.value)}
                      />
                      <Button type="button" onClick={saveProxy} disabled={!loaded || savingProxy}>
                        {t("settings.save")}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">{t("settings.searchProxyHelp")}</p>
                  </div>
                )}

                {webSearch && (
                  <div className="flex items-center justify-between gap-4 border-t pt-4">
                    <p className="text-muted-foreground text-xs">{t("settings.searchTestHelp")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={runTest}
                      disabled={!loaded || testing}
                      className="shrink-0"
                    >
                      {testing ? t("settings.testing") : t("settings.testSearch")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("network", "settings.keywords.python") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RadioTowerIcon className="size-4" />
                  {t("settings.python")}
                </CardTitle>
                <CardDescription>
                  {t("settings.custom")}
                  <b>script</b>
                  {t("settings.pythonHelp")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="font-mono text-sm"
                    placeholder={t("settings.pythonPlaceholder")}
                    value={pyInterp}
                    disabled={!loaded || saving}
                    onChange={(e) => setPyInterp(e.target.value)}
                  />
                  <Button variant="outline" onClick={detectPython} disabled={!loaded || saving}>
                    {t("settings.detectAgain")}
                  </Button>
                  <Button onClick={savePython} disabled={!loaded || saving}>
                    {t("settings.save")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("network", "settings.keywords.workers") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CpuIcon className="size-4" />
                  {t("settings.workers")}
                </CardTitle>
                <CardDescription>
                  {t("settings.workersHelpStart")}
                  <b>{t("settings.futureTasksOnly")}</b>
                  {t("settings.runningTasksUnchanged")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t("settings.workerPools")}</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addWorkerPool}
                      disabled={!loaded || !settingsLoaded || savingWorkers}
                    >
                      {t("settings.addPool")}
                    </Button>
                  </div>
                  {workerPools.map((pool, index) => {
                    const selected = llmProfiles.find((profile) => profile.id === pool.profile_id);
                    const placeholder =
                      selected?.name ||
                      (pool.profile_id
                        ? t("settings.unavailableProfile", { id: pool.profile_id })
                        : t("settings.chooseProfile"));
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: pool rows are edited in place and only deleted.
                      <div className="flex items-center gap-2" key={`${pool.profile_id}-${index}`}>
                        <Select
                          value={pool.profile_id || undefined}
                          disabled={!settingsLoaded || savingWorkers}
                          onValueChange={(value) =>
                            setWorkerPools((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, profile_id: value } : item,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="min-w-0 flex-1">
                            <SelectValue placeholder={placeholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {!selected && pool.profile_id ? (
                              <SelectItem value={pool.profile_id}>
                                {t("settings.profilePrefix")}
                                {pool.profile_id}
                                {t("settings.profileUnavailableSuffix")}
                              </SelectItem>
                            ) : null}
                            {llmProfiles
                              .filter((profile) => profile.format !== "jev")
                              .map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.name} · {profile.model}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          className="w-24 font-mono text-sm"
                          value={pool.workers}
                          disabled={!settingsLoaded || savingWorkers}
                          onChange={(event) =>
                            setWorkerPools((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, workers: Number(event.target.value) } : item,
                              ),
                            )
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!settingsLoaded || savingWorkers}
                          onClick={() =>
                            setWorkerPools((current) => current.filter((_, itemIndex) => itemIndex !== index))
                          }
                        >
                          {t("settings.delete")}
                        </Button>
                      </div>
                    );
                  })}
                  {workerPools.length > 0 ? (
                    <div className="text-muted-foreground text-sm">
                      {t("settings.workerTotal", {
                        count: workerPools.reduce((sum, pool) => sum + (Number(pool.workers) || 0), 0),
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-32 font-mono text-sm"
                    placeholder="3"
                    value={workers}
                    disabled={!loaded || !settingsLoaded || savingWorkers || workerPools.length > 0}
                    onChange={(e) => setWorkers(e.target.value)}
                  />
                  {workerPools.length > 0 ? (
                    <span className="text-muted-foreground text-xs">{t("settings.poolConcurrencyHelp")}</span>
                  ) : null}
                  <Button onClick={saveWorkers} disabled={!loaded || !settingsLoaded || savingWorkers}>
                    {t("settings.save")}
                  </Button>
                </div>
                {!settingsLoaded && loaded ? (
                  <p className="text-destructive text-xs">{t("settings.workerConfigLockedHelp")}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card
              className={`${isSettingVisible("chat", "settings.keywords.chatSend") ? "" : "hidden"} mb-4 break-inside-avoid md:mb-6`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyboardIcon className="size-4" />
                  {t("settings.chatSendShortcut")}
                </CardTitle>
                <CardDescription>
                  {t("settings.chatSendShortcutHelp")}
                  <br />
                  {t("settings.preferenceScopeStart")}
                  <b>{t("settings.browserOnly")}</b>
                  {t("settings.preferenceScopeEnd")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="chat-send-mode" className="text-sm font-normal text-muted-foreground">
                  {t("settings.sendMode")}
                </Label>
                <Select value={sendMode} onValueChange={(v) => setChatSendMode(v as ChatSendMode)}>
                  <SelectTrigger id="chat-send-mode" className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_SEND_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(`settings.sendMode.${option.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
