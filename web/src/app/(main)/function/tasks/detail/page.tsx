"use client";
import * as React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ArchiveIcon, ArrowLeftIcon, BrainIcon, CheckIcon, CircleAlertIcon, PauseIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";

import { IntelligencePanel } from "@/components/intelligence-panel";
import { StatusBadge } from "@/components/status-badge";
import { TaskLLMProfileChain } from "@/components/task-llm-profile-chain";
import { TrafficHistory } from "@/components/traffic-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { LLMProfile, Task } from "@/lib/types";

import { AssetsTab } from "./_tabs/assets-tab";
import { BroadcastTab } from "./_tabs/broadcast-tab";
import { CoverageGraphTab } from "./_tabs/coverage-graph-tab";
import { FilesTab } from "./_tabs/files-tab";
import { FindingsTab } from "./_tabs/findings-tab";
import { GraphTab } from "./_tabs/graph-tab";
import { InterceptTab } from "./_tabs/intercept-tab";
import { OverviewTab } from "./_tabs/overview-tab";
import { ReportTab } from "./_tabs/report-tab";
import { RetestsTab } from "./_tabs/retests-tab";
import { SessionsTab } from "./_tabs/sessions-tab";

const TABS = (ui: UITranslate) => [
  { value: "sessions", label: ui("screen.a63280253f17d4") },
  { value: "overview", label: ui("screen.a33db573055626") },
  { value: "graph", label: ui("screen.f9b10d9cd9b388") },
  { value: "broadcast", label: ui("screen.10542494b3437a") },
  { value: "findings", label: ui("screen.10493d06b90f6b") },
  { value: "intelligence", label: ui("screen.bfaee3ed1f063c") },
  { value: "retests", label: ui("screen.d95315ddeb80c2") },
  { value: "traffic", label: ui("screen.81a9d0b5a2a24f") },
  { value: "files", label: ui("taskFiles.tab") },
  { value: "assets", label: ui("screen.e3a1dbbaefc3d7") },
  { value: "coverage", label: ui("screen.8bd56c272abd3c") },
  { value: "intercept", label: ui("screen.b4c245b6421a35") },
  { value: "report", label: ui("screen.1e8ddd10bafe51") },
];

function taskProfileIDs(task: Task): string[] {
  if (task.llm_profile_ids && task.llm_profile_ids.length > 0) {
    return task.llm_profile_ids.map(String);
  }
  return task.llm_profile_id ? [String(task.llm_profile_id)] : [];
}

function TaskLLMControl({ task, profiles, onUpdated }: { task: Task; profiles: LLMProfile[]; onUpdated: () => void }) {
  const { ui } = useUITranslation();

  const [open, setOpen] = React.useState(false);
  const [profileIDs, setProfileIDs] = React.useState<string[]>(() => taskProfileIDs(task));
  const [activeProfileID, setActiveProfileID] = React.useState(
    task.active_llm_profile_id ? String(task.active_llm_profile_id) : (taskProfileIDs(task)[0] ?? ""),
  );
  const [saving, setSaving] = React.useState(false);
  const popoverContentRef = React.useRef<HTMLDivElement>(null);

  const chain = taskProfileIDs(task);
  const exhausted = task.llm_failover_state === "chain_exhausted";
  // 任何状态都可以改链,终态也不例外:任务结束后主 Agent 对话仍走这条链,
  // 链上模型出问题时必须能换掉,否则已完成任务就没法继续交互。
  const terminal = ["done", "failed", "timeout"].includes(task.status);
  // A null active profile on an exhausted, non-empty chain is a persisted end
  // cursor. Keep the status display honest; choosing the first profile is only
  // the editor's reset draft and does not mean it is currently active.
  let activeID = chain[0] ?? "";
  if (exhausted) activeID = "";
  if (task.active_llm_profile_id) activeID = String(task.active_llm_profile_id);
  const activeProfile = profiles.find((profile) => profile.id === activeID);
  const currentLabel = exhausted
    ? ui("screen.a54277ec3b81cc")
    : (activeProfile?.name ?? (activeID ? ui("screen.53b35487671e19", { v0: activeID }) : ui("screen.55e5dee54123f9")));
  const activeIndex = chain.indexOf(activeID);
  const backupCount = activeIndex >= 0 ? Math.max(0, chain.length - activeIndex - 1) : 0;
  const currentTitle = [
    currentLabel,
    activeProfile?.model,
    backupCount > 0 ? ui("screen.e2f343bbaae250", { v0: backupCount }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  let editorDescription = ui("screen.10aac23bc4baae");
  if (terminal) editorDescription = ui("screen.70ad4fce021b92");
  let saveLabel = ui("screen.a3030bf8f16dc6");
  if (exhausted) saveLabel = ui("screen.19d660828a7923");
  if (saving) saveLabel = ui("screen.a1a1720d3eb58a");

  const syncDraft = React.useCallback(() => {
    const next = taskProfileIDs(task);
    setProfileIDs(next);
    setActiveProfileID(task.active_llm_profile_id ? String(task.active_llm_profile_id) : (next[0] ?? ""));
  }, [task]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) syncDraft();
  };

  const handleProfileIDsChange = (next: string[]) => {
    setProfileIDs(next);
    setActiveProfileID((current) => (next.includes(current) ? current : (next[0] ?? "")));
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.updateTaskLLMProfiles(
        task.id,
        profileIDs.map(Number),
        activeProfileID ? Number(activeProfileID) : undefined,
      );
      if (result.switch_event) {
        toast.info(result.switch_event.summary, { id: `task-${task.id}-llm-${result.switch_event.seq}` });
      } else {
        toast.success(
          result.reopened_intents > 0
            ? ui("screen.0af5ebae22aaf2", { v0: result.reopened_intents })
            : ui("screen.1f283403fdb1cb"),
        );
      }
      setOpen(false);
      onUpdated();
    } catch (error) {
      toast.error(ui("screen.4f2e8a8d4cb328") + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={exhausted ? "destructive" : "outline"}
          aria-label={ui("screen.3b1267e4aec1d9")}
          title={currentTitle}
        >
          <BrainIcon data-icon="inline-start" />
          <span className="hidden max-w-36 truncate lg:inline">{currentLabel}</span>
          {backupCount > 0 && <span className="hidden text-muted-foreground xl:inline">+{backupCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent ref={popoverContentRef} align="start" className="w-[min(28rem,calc(100vw-2rem))] gap-4 p-4">
        <PopoverHeader>
          <PopoverTitle>{ui("screen.429f582e667c83")}</PopoverTitle>
          <PopoverDescription>{editorDescription}</PopoverDescription>
        </PopoverHeader>

        {exhausted && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{ui("screen.71baadbe56f906")}</AlertTitle>
            <AlertDescription>{task.llm_failover_reason ?? ui("screen.78c565329894f7")}</AlertDescription>
          </Alert>
        )}

        <TaskLLMProfileChain
          profiles={profiles}
          value={profileIDs}
          onValueChange={handleProfileIDsChange}
          activeProfileId={activeProfileID}
          onActiveProfileChange={setActiveProfileID}
          inputId="task-llm-profiles"
          disabled={saving}
          portalContainer={popoverContentRef}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            {ui("screen.3fd47edce45b36")}
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {saveLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TaskDetailInner() {
  const { ui, liveUI } = useUITranslation();

  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [task, setTask] = React.useState<Task | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const requestedTab = searchParams.get("tab") ?? "sessions";
  const normalizedRequestedTab = requestedTab === "http-history" ? "traffic" : requestedTab;
  const [tab, setTab] = React.useState(
    TABS(ui).some((item) => item.value === normalizedRequestedTab) ? normalizedRequestedTab : "sessions",
  );
  React.useEffect(() => {
    if (TABS(liveUI).some((item) => item.value === normalizedRequestedTab)) setTab(normalizedRequestedTab);
  }, [normalizedRequestedTab, liveUI]);
  const [interceptPendingCount, setInterceptPendingCount] = React.useState(0);
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [archiving, setArchiving] = React.useState(false);

  React.useEffect(() => {
    api
      .llmProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  React.useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .interceptTask(id)
        .then((rows) => {
          if (alive) setInterceptPendingCount(rows.filter((r) => r.status === "pending").length);
        })
        .catch(() => {
          // Polling is best-effort; the next interval retries automatically.
        });
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const taskLoadInFlight = React.useRef<string | null>(null);
  const load = React.useCallback(() => {
    if (taskLoadInFlight.current === id) return;
    taskLoadInFlight.current = id;
    Promise.all([api.task(id), api.stats(id).catch(() => null)])
      .then(([task, s]) => {
        if (taskLoadInFlight.current !== id) return;
        const base = { ...task };
        const at = s?.active_task;
        if (at) {
          base.in_flight = at.in_flight;
          base.goals_total = at.goals_total;
          base.goals_met = at.goals_met;
          base.engine_mode = s?.engine_mode ?? at.engine_mode;
          base.paused = at.paused;
        }
        setTask(base);
        setPaused(at?.paused ?? base.paused ?? false);
      })
      .catch(() => {
        // Keep the last rendered task state during a transient poll failure.
      })
      .finally(() => {
        if (taskLoadInFlight.current === id) {
          taskLoadInFlight.current = null;
          setLoaded(true);
        }
      });
  }, [id]);
  React.useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function togglePause() {
    if (task && ["done", "failed", "timeout"].includes(task.status)) return;
    const next = !paused;
    try {
      await api.controlTask(id, next ? "pause" : "resume");
      setPaused(next);
      toast.success(next ? ui("screen.71abfc0c88e8b1") : ui("screen.51dbbc96e3cd1a"));
    } catch (e) {
      toast.error(ui("screen.37cdfdb143a7a8") + (e as Error).message);
    }
  }

  async function archiveTask() {
    if (!task || archiving) return;
    setArchiving(true);
    try {
      await api.archiveTask(task.id);
      toast.success(ui("screen.9cd419768bb5f9"));
      router.push("/function/tasks");
    } catch (error) {
      toast.error(ui("screen.fa7db0fef1c788", { v0: (error as Error).message }));
      setArchiving(false);
    }
  }

  if (!task) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-muted-foreground">
          {loaded ? ui("screen.8b14a8fe9a7f5a", { v0: id }) : ui("screen.4927a53bcc886a")}
        </p>
        {loaded && (
          <Button asChild variant="outline">
            <Link href="/function/tasks">
              <ArrowLeftIcon /> {ui("screen.d3e1da94411f62")}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const completed = task.status === "done";
  const terminal = ["done", "failed", "timeout"].includes(task.status);
  const archiveLifecycleEligible = terminal || paused || task.status === "paused";
  const canArchive = archiveLifecycleEligible && !task.archive_blocked_by_task_id;
  let archiveDisabledReason = task.queued ? ui("screen.cfb6c822638a30") : ui("screen.457b1596597551");
  if (archiveLifecycleEligible && task.archive_blocked_by_task_id) {
    archiveDisabledReason = ui("screen.f65d5cbeae1f2c", { v0: task.archive_blocked_by_task_id });
  }
  const engineMode = paused ? "paused" : (task.engine_mode ?? "idle");
  let controlVariant: "default" | "secondary" | "outline" = "outline";
  let controlIcon = <PauseIcon data-icon="inline-start" />;
  let controlLabel = ui("screen.8d12fc0d4eb260");
  if (terminal) {
    controlVariant = "secondary";
    controlIcon = <CheckIcon data-icon="inline-start" />;
    controlLabel = completed ? ui("screen.f28461bb49c856") : ui("screen.d79b1d0e5c6174");
  } else if (paused) {
    controlVariant = "default";
    controlIcon = <PlayIcon data-icon="inline-start" />;
    controlLabel = ui("screen.e0534b8a4e46a0");
  }
  const archiveTrigger = (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={!canArchive || archiving}
      aria-label={canArchive ? ui("screen.3eecd09d0bae8f") : archiveDisabledReason}
    >
      {archiving ? <Spinner /> : <ArchiveIcon />}
    </Button>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", value);
        params.delete("session");
        router.replace(`/function/tasks/detail?${params.toString()}`, { scroll: false });
      }}
      className="flex flex-1 flex-col gap-0"
    >
      {/* Top fixed area */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Button asChild variant="ghost" size="icon" className="size-7">
            <Link href="/function/tasks">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" title={task.name || task.description}>
            {task.name || task.description}
          </h1>
          <code className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
            {task.id}
          </code>
          <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />
          <TaskLLMControl task={task} profiles={profiles} onUpdated={load} />
          <StatusBadge
            stopReason={task.stop_reason}
            domain={terminal ? "task" : "engine"}
            value={terminal ? task.status : engineMode}
            dot
          />
          {canArchive ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>{archiveTrigger}</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {ui("screen.298f599bebbbb5")}
                    {task.id}
                    {ui("punctuation.d6a4e79b56")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{ui("screen.edf90f6ca73fe6")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void archiveTask()}>
                    {ui("screen.7850c90df42f60")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{archiveTrigger}</span>
              </TooltipTrigger>
              <TooltipContent>{archiveDisabledReason}</TooltipContent>
            </Tooltip>
          )}
          <Button size="sm" variant={controlVariant} onClick={togglePause} disabled={terminal}>
            {controlIcon}
            {controlLabel}
          </Button>
        </div>
        <p className="truncate text-xs text-muted-foreground">{task.goal}</p>
        {task.paused && task.pause_reason && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600">
            <span>
              {ui("screen.1d14080c509213")}
              {task.pause_reason === "paused_by_proxy" ? ui("screen.18d8e0c91ff80d") : task.pause_reason}
            </span>
            {task.reconnect && (
              <span>
                {ui("screen.67957162435566")}
                {task.reconnect.attempt}/{task.reconnect.max}{" "}
                {task.reconnect.exhausted
                  ? ui("screen.ab7e26edb09987")
                  : task.reconnect.next_at
                    ? ui("screen.889d14ce0b9091", { v0: new Date(task.reconnect.next_at * 1000).toLocaleTimeString() })
                    : ui("screen.0c92f0e54e8c3a")}
              </span>
            )}
            {task.reconnect?.last_error && (
              <span className="max-w-full truncate" title={task.reconnect.last_error}>
                {ui("screen.b9fbb8ede4cb30")}
                {task.reconnect.last_error}
              </span>
            )}
            {task.pause_reason === "paused_by_proxy" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  api
                    .testTaskProxy(task.id)
                    .then((r) =>
                      r.ok
                        ? (toast.success(ui("screen.1eb30f37b2b98e")), load())
                        : toast.error(r.error || ui("screen.d930b3659bf944")),
                    )
                    .catch((e) => toast.error((e as Error).message))
                }
              >
                {ui("screen.75babbd492ea66")}
              </Button>
            )}
          </div>
        )}
        {task.remark ? (
          <p className="truncate text-xs text-muted-foreground" title={task.remark}>
            {ui("screen.73226759270d3a")}
            {task.remark}
          </p>
        ) : null}
        {/* Tabs */}
        <div className="no-scrollbar min-w-0 overflow-x-auto">
          <TabsList variant="default" className="min-w-max">
            {TABS(ui).map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "intercept" && interceptPendingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
                    {interceptPendingCount > 99 ? "99+" : interceptPendingCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 p-4 lg:p-6">
        <TabsContent value="sessions" className="mt-0">
          <SessionsTab key={id} taskId={id} requestedSession={searchParams.get("session") ?? ""} />
        </TabsContent>
        <TabsContent value="traffic" className="mt-0">
          <TrafficHistory taskId={id} />
        </TabsContent>
        <TabsContent value="overview" className="mt-0">
          <OverviewTab taskId={id} />
        </TabsContent>
        <TabsContent value="graph" className="mt-0">
          <GraphTab taskId={id} />
        </TabsContent>
        <TabsContent value="broadcast" className="mt-0">
          <BroadcastTab taskId={id} />
        </TabsContent>
        <TabsContent value="intelligence" className="mt-0">
          <IntelligencePanel scope="tasks" scopeId={id} />
        </TabsContent>
        <TabsContent value="findings" className="mt-0">
          <FindingsTab taskId={id} />
        </TabsContent>
        <TabsContent value="retests" className="mt-0">
          <RetestsTab key={id} taskId={id} />
        </TabsContent>
        <TabsContent value="files" className="mt-0">
          <FilesTab key={id} task={task} active={tab === "files"} />
        </TabsContent>
        <TabsContent value="assets" className="mt-0">
          <AssetsTab taskId={id} />
        </TabsContent>
        <TabsContent value="coverage" className="mt-0">
          <CoverageGraphTab taskId={id} coverageEnabled={task?.coverage_enabled !== false} />
        </TabsContent>
        <TabsContent value="intercept" className="mt-0">
          <InterceptTab taskId={id} />
        </TabsContent>
        <TabsContent value="report" className="mt-0">
          <ReportTab taskId={id} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// useSearchParams must sit under a Suspense boundary for static export.
export default function TaskDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <TaskDetailInner />
    </React.Suspense>
  );
}
