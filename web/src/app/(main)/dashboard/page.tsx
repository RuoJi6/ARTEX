"use client";

import * as React from "react";

import Link from "next/link";

import type { TFunction } from "i18next";

import {
  type ActivityItem,
  ActivityStream,
  BarRow,
  GaugeRing,
  KVRow,
  type MetricItem,
  MetricStrip,
  PageHeading,
  Panel,
  RowLink,
  StackedBar,
  type Tone,
  TrendChart,
} from "@/components/rb/dashboard-kit";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api } from "@/lib/api";
import { statusMeta } from "@/lib/status";
import type {
  Activity,
  Agent,
  ConvTokenSummary,
  Finding,
  InterceptPending,
  LLMProfile,
  MCPServer,
  Settings,
  SkillItem,
  Stats,
  SystemMetrics,
  Task,
  TokenTotal,
  Tool,
  TrafficExchange,
  UsageStats,
} from "@/lib/types";

// ── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtRel(ts: string | number | undefined, translate: TFunction): string {
  if (!ts) return "—";
  const ms = Date.now() - (typeof ts === "number" ? ts * 1000 : Date.parse(ts as string));
  const s = Math.floor(ms / 1000);
  if (s < 60) return translate("overview.secondsAgo", { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return translate("overview.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate("overview.hoursAgo", { count: h });
  return translate("overview.daysAgo", { count: Math.floor(h / 24) });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const TASK_TONE: Record<string, Tone> = {
  created: "idle",
  queued: "warn",
  running: "run",
  paused: "warn",
  done: "ok",
  failed: "fail",
  timeout: "warn",
};

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "fail",
  high: "fail",
  medium: "warn",
  low: "idle",
};

// ── page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t: translate } = useLiveTranslation();

  // data state
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [pending, setPending] = React.useState<InterceptPending[]>([]);
  const [activity, setActivity] = React.useState<Activity[]>([]);
  const [tokens, setTokens] = React.useState<TokenTotal | null>(null);
  const [convTokens, setConvTokens] = React.useState<ConvTokenSummary[]>([]);
  const [usageStats, setUsageStats] = React.useState<UsageStats | null>(null);
  const [assetCounts, setAssetCounts] = React.useState<Record<string, number>>({});
  const [traffic, setTraffic] = React.useState<TrafficExchange[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [mcpServers, setMcpServers] = React.useState<MCPServer[]>([]);
  const [skills, setSkills] = React.useState<SkillItem[]>([]);
  const [tools, setTools] = React.useState<Tool[]>([]);
  const [llmProfiles, setLLMProfiles] = React.useState<LLMProfile[]>([]);
  const [systemMetrics, setSystemMetrics] = React.useState<SystemMetrics | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await api.systemMetrics();
        if (alive) setSystemMetrics(next);
      } catch {
        /* retry on the next interval */
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // The task list is the most expensive dashboard source. Poll it independently
  // so a large history cannot hold back every other dashboard panel.
  React.useEffect(() => {
    let alive = true;
    let loading = false;
    let signature = "";
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const tr = await api.tasks();
        if (!alive) return;
        const nextSignature = JSON.stringify(tr.tasks);
        if (nextSignature !== signature) {
          signature = nextSignature;
          setTasks(tr.tasks);
        }
      } catch {
        /* transient errors — next poll retries */
      } finally {
        loading = false;
      }
    };
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // The remaining fast sources stay batched so one poll causes a single render.
  React.useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const [findings, stats, settings, pending, activity, tokens, conversationTokens] = await Promise.all([
          api.findings(),
          api.stats(),
          api.settings(),
          api.interceptPending(),
          api.activity(undefined, { limit: 30 }),
          api.tokenStats(),
          api.conversationTokens(),
        ]);
        if (!alive) return;
        setFindings(findings);
        setStats(stats);
        setSettings(settings);
        setPending(pending);
        setActivity(activity.items);
        setTokens(tokens.total ?? null);
        setConvTokens(conversationTokens);
      } catch {
        // Preserve stale data and retry on the next interval.
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // slow poll: traffic, assets, system-static (every 15s)
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [traf, counts, agentList, mcpList, skillList, toolList, profileList, usage] = await Promise.all([
          api.traffic(0, 50),
          api.assetCounts(),
          api.agents(),
          api.mcpServers(),
          api.skills(),
          api.tools(),
          api.llmProfiles(),
          api.usageStats(365),
        ]);
        if (!alive) return;
        setTraffic(traf.exchanges ?? []);
        setAssetCounts(counts ?? {});
        setAgents(agentList);
        setMcpServers(mcpList);
        setSkills(skillList);
        setTools(toolList);
        setLLMProfiles(profileList);
        setUsageStats(usage);
      } catch {
        /* transient errors */
      }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────

  const tasksByStatus = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [tasks]);

  const findingsBySev = React.useMemo(() => {
    const m = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      if (f.severity in m) m[f.severity as keyof typeof m]++;
    }
    return m;
  }, [findings]);

  const sortedTasks = React.useMemo(
    () =>
      [...tasks]
        .sort((a, b) => (b.last_activity_unix ?? b.created_unix ?? 0) - (a.last_activity_unix ?? a.created_unix ?? 0))
        .slice(0, 6),
    [tasks],
  );

  const recentFindings = React.useMemo(
    () => [...findings].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 6),
    [findings],
  );

  const activityItems = React.useMemo<ActivityItem[]>(
    () =>
      [...activity]
        .filter((a) => a.kind !== "usage")
        .sort((a, b) => b.seq - a.seq)
        .slice(0, 8)
        .map((a) => ({
          id: String(a.seq),
          label: a.summary,
          detail: a.tool ? `${a.worker} · ${a.tool}` : a.worker,
          at: fmtRel(a.ts, translate),
          state: a.is_error ? "fail" : a.kind === "tool_use" ? "run" : "done",
        })),
    [activity, translate],
  );

  const totalAssets = React.useMemo(() => Object.values(assetCounts).reduce((a, b) => a + b, 0), [assetCounts]);

  const assetByType = React.useMemo(
    () =>
      Object.entries(assetCounts)
        .filter(([, n]) => n > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8),
    [assetCounts],
  );
  const assetMax = assetByType[0]?.[1] ?? 1;

  const trafficByCodes = React.useMemo(() => {
    const m: Record<number, number> = {};
    for (const e of traffic) {
      const bucket = Math.floor(e.status / 100) * 100;
      m[bucket] = (m[bucket] ?? 0) + 1;
    }
    return Object.entries(m)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([code, n]) => ({ code: Number(code), n }));
  }, [traffic]);
  const trafficMax = Math.max(...trafficByCodes.map((x) => x.n), 1);

  const totalTokens = React.useMemo(() => {
    if (!tokens) return 0;
    return tokens.input_tokens + tokens.output_tokens;
  }, [tokens]);

  const dailySeries = React.useMemo(() => {
    const byDay = new Map<string, number>();
    for (const day of usageStats?.daily ?? []) {
      const key = day.date ?? "";
      if (!key) continue;
      const value = (day.input_tokens ?? 0) + (day.output_tokens ?? 0) + (day.cache_read_tokens ?? 0);
      byDay.set(key, (byDay.get(key) ?? 0) + value);
    }
    const entries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      labels: entries.map(([day]) => day.slice(5)),
      values: entries.map(([, v]) => v),
    };
  }, [usageStats]);

  const enabledTools = tools.filter((t) => t.enabled);
  const pendingCount = pending.length;
  const activeProfile = llmProfiles.find((p) => p.is_default);

  const metrics = React.useMemo<MetricItem[]>(
    () => [
      {
        label: translate("overview.activeTasks"),
        value: tasksByStatus.running ?? 0,
        hint: `${translate("overview.tasks")} ${tasks.length}`,
      },
      {
        label: translate("overview.confirmedFindings"),
        value: findings.length,
        hint: `${translate("overview.critical")} ${findingsBySev.critical} · ${translate("overview.high")} ${findingsBySev.high}`,
      },
      {
        label: translate("overview.assetNodes"),
        value: totalAssets,
        hint: translate("overview.sharedAcrossTasks"),
      },
      {
        label: translate("nav.approvals"),
        value: pendingCount,
        hint: translate("overview.trafficExchanges"),
      },
      {
        label: translate("overview.llmTokens"),
        value: fmtTokens(totalTokens),
        hint: `${translate("overview.input")} ${fmtTokens(tokens?.input_tokens ?? 0)}`,
        spark: dailySeries.values.length > 1 ? dailySeries.values : undefined,
      },
    ],
    [
      translate,
      tasksByStatus.running,
      tasks.length,
      findings.length,
      findingsBySev,
      totalAssets,
      pendingCount,
      totalTokens,
      tokens,
      dailySeries,
    ],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading title={translate("overview.title")} />

      <MetricStrip metrics={metrics} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel
          title={translate("overview.tasks")}
          hint={`${tasks.length}`}
          actions={
            <Link
              href="/function/tasks"
              className="flex h-7 items-center rounded-[var(--rb-r-sm,6px)] px-2 font-[450] text-[13px]/[16px] text-rb-fg/80 transition-colors hover:bg-rb-soft hover:text-rb-fg"
            >
              {translate("overview.viewTasks")}
            </Link>
          }
          bodyClassName="p-2"
        >
          {sortedTasks.length === 0 ? (
            <p className="py-6 text-center text-[13px]/[18px] text-rb-muted">{translate("overview.emptyTasks")}</p>
          ) : (
            <div className="flex flex-col">
              {sortedTasks.map((task) => {
                const _meta = statusMeta("task", task.status, translate as unknown as (key: string) => string);
                return (
                  <RowLink
                    key={task.id}
                    href={`/function/tasks/${encodeURIComponent(task.id)}`}
                    tone={TASK_TONE[task.status] ?? "idle"}
                    title={task.name || task.description || task.id}
                    meta={fmtRel(task.last_activity_unix ?? task.created_unix, translate)}
                  />
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={translate("overview.findings")} hint={`${findings.length}`}>
          <StackedBar
            segments={[
              { label: translate("overview.critical"), value: findingsBySev.critical, tone: "fail" },
              { label: translate("overview.high"), value: findingsBySev.high, tone: "fail" },
              { label: translate("overview.medium"), value: findingsBySev.medium, tone: "warn" },
              { label: translate("overview.low"), value: findingsBySev.low, tone: "idle" },
            ]}
          />
          <div className="mt-3 flex flex-col">
            {recentFindings.length === 0 ? (
              <p className="py-4 text-center text-[13px]/[18px] text-rb-muted">{translate("overview.emptyFindings")}</p>
            ) : (
              recentFindings.map((finding) => (
                <RowLink
                  key={finding.id}
                  href={`/function/findings?finding=${encodeURIComponent(finding.id)}`}
                  tone={SEVERITY_TONE[finding.severity] ?? "idle"}
                  title={finding.name || finding.vulnclass || finding.id}
                  meta={fmtRel(finding.ts, translate)}
                />
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title={translate("overview.activity")} hint={translate("overview.live")} bodyClassName="p-2">
          <ActivityStream items={activityItems} empty={translate("overview.emptyActivity")} />
        </Panel>

        <Panel title={translate("overview.systemStatus")}>
          {systemMetrics?.supported ? (
            <div className="flex flex-wrap items-start justify-around gap-4">
              <GaugeRing
                value={systemMetrics.cpu.percent ?? 0}
                label="CPU"
                sub={`${fmtBytes(systemMetrics.cpu.used_bytes)} / ${fmtBytes(systemMetrics.cpu.total_bytes)}`}
              />
              <GaugeRing
                value={systemMetrics.memory.percent ?? 0}
                label={translate("overview.memory")}
                sub={`${fmtBytes(systemMetrics.memory.used_bytes)} / ${fmtBytes(systemMetrics.memory.total_bytes)}`}
              />
              <GaugeRing
                value={systemMetrics.disk.percent ?? 0}
                label={translate("overview.disk")}
                sub={`${fmtBytes(systemMetrics.disk.used_bytes)} / ${fmtBytes(systemMetrics.disk.total_bytes)}`}
              />
            </div>
          ) : (
            <p className="py-4 text-center text-[13px]/[18px] text-rb-muted">
              {translate("overview.resourceUnsupported")}
            </p>
          )}
          <div className="mt-4 border-rb-line border-t pt-3">
            <KVRow
              label={translate("nav.llm")}
              value={`${llmProfiles.length} · ${activeProfile?.name ?? translate("overview.default")}`}
              tone={stats?.llm_configured ? "ok" : "warn"}
            />
            <KVRow label={translate("nav.agents")} value={agents.length} />
            <KVRow label={translate("nav.mcp")} value={mcpServers.length} />
            <KVRow label={translate("nav.skills")} value={skills.length} />
            <KVRow label={translate("nav.tools")} value={`${enabledTools.length}/${tools.length}`} />
            <KVRow
              label={translate("overview.engine")}
              value={
                statusMeta("engine", stats?.engine_mode ?? "idle", translate as unknown as (key: string) => string)
                  .label
              }
              tone={stats?.roe_enabled ? "ok" : "idle"}
            />
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <Panel title={translate("overview.tokenUsage")} hint={translate("overview.thirtyDays")}>
          {dailySeries.values.length > 1 ? (
            <TrendChart values={dailySeries.values} labels={dailySeries.labels} />
          ) : (
            <p className="py-8 text-center text-[13px]/[18px] text-rb-muted">{translate("overview.noData")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-rb-line border-t pt-3">
            <KVRow label={translate("overview.input")} value={fmtTokens(tokens?.input_tokens ?? 0)} />
            <KVRow label={translate("overview.output")} value={fmtTokens(tokens?.output_tokens ?? 0)} />
            <KVRow label={translate("overview.cacheRead")} value={fmtTokens(tokens?.cache_read_tokens ?? 0)} />
            <KVRow label={translate("overview.cacheHit")} value={`${convTokens.length}`} />
          </div>
        </Panel>

        <Panel title={translate("overview.assetDistribution")} hint={translate("overview.byType")}>
          {assetByType.length === 0 ? (
            <p className="py-8 text-center text-[13px]/[18px] text-rb-muted">{translate("overview.emptyAssets")}</p>
          ) : (
            <div className="flex flex-col">
              {assetByType.map(([type, count]) => (
                <BarRow
                  key={type}
                  label={translate(`overview.asset.${type}`)}
                  value={count}
                  max={assetMax}
                  display={count}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={translate("overview.trafficStatusCodes")}>
          {trafficByCodes.length === 0 ? (
            <p className="py-8 text-center text-[13px]/[18px] text-rb-muted">{translate("overview.emptyTraffic")}</p>
          ) : (
            <div className="flex flex-col">
              {trafficByCodes.map(({ code, n }) => (
                <BarRow
                  key={code}
                  label={`${code}xx`}
                  value={n}
                  max={trafficMax}
                  display={n}
                  tone={code < 300 ? "ok" : code < 400 ? "run" : code < 500 ? "warn" : "fail"}
                />
              ))}
            </div>
          )}
          {settings && (
            <div className="mt-3 border-rb-line border-t pt-3">
              <KVRow
                label={translate("overview.recording")}
                value={settings.traffic_capture ? translate("overview.live") : translate("overview.captureDisabled")}
                tone={settings.traffic_capture ? "ok" : "idle"}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
