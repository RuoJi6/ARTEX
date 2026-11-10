"use client";

import * as React from "react";

import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { DateSelect } from "@/components/date-select";
import { RemarkEditor, ScheduleNameEditor } from "@/components/remark-editor";
import { TimeSelect } from "@/components/time-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localizedError } from "@/i18n/errors";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api, type ScheduleInput } from "@/lib/api";
import { scheduleDisplay } from "@/lib/schedule-display";
import type { Task, TaskSchedule } from "@/lib/types";

const blank: ScheduleInput = {
  name: "",
  schedule_type: "weekly",
  weekdays: [6, 7],
  start_time: "18:00",
  end_time: "",
  task_ids: [],
  timezone_mode: "beijing",
  start_immediately: false,
};

type ScheduleHistoryEntry = NonNullable<TaskSchedule["history"]>[number];

function historyEventClass(event: ScheduleHistoryEntry) {
  if (!event.success)
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
  if (event.action === "running" || event.action === "resume") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (event.action === "outside" || event.action === "pause" || event.action === "paused") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
}

function historyDotClass(event: ScheduleHistoryEntry) {
  if (!event.success) return "bg-red-500";
  if (event.action === "running" || event.action === "resume") return "bg-emerald-500";
  if (event.action === "outside" || event.action === "pause" || event.action === "paused") return "bg-amber-500";
  return "bg-slate-400";
}

function ScheduleTimeline({ schedule, loading }: { schedule?: TaskSchedule; loading: boolean }) {
  const { t: translate, i18n } = useLiveTranslation();
  const { formatTime, historyActionText, scheduleErrorText } = scheduleDisplay(
    translate,
    i18n.resolvedLanguage ?? "zh-CN",
  );
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {translate("schedule.loadingTimeline")}
      </div>
    );
  }
  // The API returns newest first. Keep that order so the latest transition is
  // visible immediately when a row is expanded.
  const events = schedule?.history ?? [];
  if (!events.length) {
    return <div className="py-4 text-muted-foreground text-sm">{translate("schedule.emptyTimeline")}</div>;
  }
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">{translate("schedule.timeline")}</div>
        <span className="text-muted-foreground text-xs">
          {translate("schedule.recentRecords", { count: Math.min(events.length, 20) })}
        </span>
      </div>
      <div className="grid gap-0">
        {events.slice(0, 20).map((event, index) => (
          <div key={event.id} className="relative flex gap-3 pb-3 last:pb-0">
            {index < Math.min(events.length, 20) - 1 ? (
              <span className="absolute top-4 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />
            ) : null}
            <span
              className={`relative mt-1.5 size-3 shrink-0 rounded-full border-2 border-background shadow-sm ${historyDotClass(event)}`}
              title={historyActionText(event.action)}
            />
            <div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={historyEventClass(event)}>
                  {historyActionText(event.action)}
                </Badge>
                <span className="text-muted-foreground">{formatTime(event.created_at)}</span>
                <span className="text-muted-foreground">
                  {event.task_id ? translate("schedule.taskId", { id: event.task_id }) : translate("schedule.title")}
                </span>
              </div>
              {event.message ? (
                <div className={`mt-1 text-xs ${event.success ? "text-muted-foreground" : "text-destructive"}`}>
                  {scheduleErrorText(event.message)}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusClass(status: TaskSchedule["status"]) {
  return (
    {
      waiting: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
      running:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
      outside:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      completed: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
      error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
      paused:
        "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
    } as Record<TaskSchedule["status"], string>
  )[status];
}

function ScheduleForm({
  value,
  tasks,
  onSave,
  onCancel,
  saving,
}: {
  value: ScheduleInput;
  tasks: Task[];
  onSave: (v: ScheduleInput) => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  const { t: translate, i18n } = useLiveTranslation();
  const { weekdays } = scheduleDisplay(translate, i18n.resolvedLanguage ?? "zh-CN");
  const [draft, setDraft] = React.useState(value);
  const [taskQuery, setTaskQuery] = React.useState("");
  const set = (patch: Partial<ScheduleInput>) => setDraft((v) => ({ ...v, ...patch }));
  const toggleTask = (id: number, checked: boolean) =>
    set({ task_ids: checked ? [...(draft.task_ids ?? []), id] : (draft.task_ids ?? []).filter((x) => x !== id) });
  const toggleDay = (day: number) =>
    set({
      weekdays: (draft.weekdays ?? []).includes(day)
        ? (draft.weekdays ?? []).filter((x) => x !== day)
        : [...(draft.weekdays ?? []), day].sort(),
    });
  const filteredTasks = React.useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) =>
      [String(task.id), task.name ?? "", task.description, task.goal].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [taskQuery, tasks]);
  let taskListContent: React.ReactNode;
  if (tasks.length === 0) {
    taskListContent = <span className="text-muted-foreground text-sm">{translate("schedule.noTasks")}</span>;
  } else if (filteredTasks.length === 0) {
    taskListContent = <span className="text-muted-foreground text-sm">{translate("schedule.noMatchingTasks")}</span>;
  } else {
    taskListContent = filteredTasks.map((task) => (
      <div key={task.id} className="flex items-center gap-2 py-1 text-sm">
        <Checkbox
          id={`schedule-task-${task.id}`}
          checked={(draft.task_ids ?? []).includes(Number(task.numeric_id ?? task.id))}
          onCheckedChange={(v) => toggleTask(Number(task.numeric_id ?? task.id), !!v)}
        />
        <Label htmlFor={`schedule-task-${task.id}`} className="truncate">
          #{task.id} {task.name || task.description}
        </Label>
      </div>
    ));
  }
  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label>{translate("schedule.name")}</Label>
        <Input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={translate("schedule.nameExample")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>{translate("schedule.rule")}</Label>
          <Select
            value={draft.schedule_type}
            onValueChange={(value) => set({ schedule_type: value as ScheduleInput["schedule_type"] })}
          >
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{translate("schedule.weekly")}</SelectItem>
              <SelectItem value="once">{translate("schedule.once")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>{translate("schedule.timezone")}</Label>
          <Select
            value={draft.timezone_mode}
            onValueChange={(value) => set({ timezone_mode: value as ScheduleInput["timezone_mode"] })}
          >
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beijing">{translate("schedule.beijing")}</SelectItem>
              <SelectItem value="system">{translate("schedule.systemTimezone")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {draft.schedule_type === "once" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>{translate("schedule.startDate")}</Label>
            <DateSelect
              value={draft.run_date ?? ""}
              onValueChange={(value) => set({ run_date: value })}
              aria-label={translate("schedule.startDate")}
            />
          </div>
          <div className="grid gap-2">
            <Label>{translate("schedule.endDateOptional")}</Label>
            <DateSelect
              value={draft.end_date ?? ""}
              onValueChange={(value) => set({ end_date: value })}
              optional
              placeholder={translate("schedule.noEndDate")}
              aria-label={translate("schedule.endDateAccessible")}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label>{translate("schedule.weekdays")}</Label>
          <div className="flex flex-wrap gap-3">
            {weekdays.map((label, index) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`schedule-weekday-${index + 1}`}
                  checked={(draft.weekdays ?? []).includes(index + 1)}
                  onCheckedChange={() => toggleDay(index + 1)}
                />
                <Label htmlFor={`schedule-weekday-${index + 1}`}>{label}</Label>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>{translate("schedule.startTime")}</Label>
          <TimeSelect
            value={draft.start_time}
            onValueChange={(value) => set({ start_time: value })}
            aria-label={translate("schedule.startTime")}
          />
        </div>
        <div className="grid gap-2">
          <Label>{translate("schedule.endTimeOptional")}</Label>
          <TimeSelect
            value={draft.end_time ?? ""}
            onValueChange={(value) => set({ end_time: value })}
            optional
            aria-label={translate("schedule.endTimeAccessible")}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{translate("schedule.windowHelp")}</p>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="schedule-start-immediately"
          checked={draft.start_immediately}
          onCheckedChange={(v) => set({ start_immediately: !!v })}
        />
        <Label htmlFor="schedule-start-immediately">{translate("schedule.startImmediately")}</Label>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>{translate("schedule.boundTasks")}</Label>
          <span className="text-muted-foreground text-xs">
            {translate("schedule.selectedTasks", { count: (draft.task_ids ?? []).length })}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder={translate("schedule.searchTasks")}
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-40 overflow-auto rounded border p-2">{taskListContent}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {translate("schedule.cancel")}
        </Button>
        <Button disabled={saving} onClick={() => onSave(draft)}>
          {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {translate("schedule.save")}
        </Button>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  const { t: translate, liveT, i18n } = useLiveTranslation();
  const {
    periodLabel,
    startLabel,
    endLabel,
    timezoneLabel,
    nextWindowLabel,
    formatTime,
    statusText,
    scheduleErrorText,
  } = scheduleDisplay(translate, i18n.resolvedLanguage ?? "zh-CN");
  const [items, setItems] = React.useState<TaskSchedule[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<{ id?: number; value: ScheduleInput } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState("10");
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [timelineById, setTimelineById] = React.useState<Record<number, TaskSchedule>>({});
  const [timelineLoadingId, setTimelineLoadingId] = React.useState<number | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.schedules(), api.tasks()]);
      setItems(s);
      setTasks(t.tasks);
    } catch (e) {
      toast.error(localizedError(e, liveT));
    } finally {
      setLoading(false);
    }
  }, [liveT]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = !normalizedQuery
    ? items
    : items.filter((item) => {
        const translations = ["zh-CN", "en"].flatMap((locale) => {
          const display = scheduleDisplay(i18n.getFixedT(locale), locale);
          return [display.periodLabel(item), display.windowLabel(item)];
        });
        return [item.name, String(item.id), ...translations, ...item.task_ids.map(String)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  const size = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / size));
  const visibleItems = filteredItems.slice((page - 1) * size, page * size);
  const visibleIds = visibleItems.map((item) => item.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  let headerSelectionState: boolean | "indeterminate" = false;
  if (allVisibleSelected) headerSelectionState = true;
  else if (someVisibleSelected) headerSelectionState = "indeterminate";
  React.useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const updatePageSize = (value: string) => {
    setPageSize(value);
    setPage(1);
  };
  const toggleSelected = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) return current.filter((selected) => selected !== id);
      return current.includes(id) ? current : [...current, id];
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((id) => !visibleIds.includes(id));
    });
  };
  const refreshTimeline = async (id: number) => {
    setTimelineLoadingId(id);
    try {
      const detail = await api.schedule(id);
      setTimelineById((current) => ({ ...current, [id]: detail }));
    } catch (e) {
      toast.error(scheduleErrorText(localizedError(e, translate)));
    } finally {
      setTimelineLoadingId(null);
    }
  };
  const invalidateTimeline = async (id: number) => {
    setTimelineById((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (expandedId === id) await refreshTimeline(id);
  };
  const toggleTimeline = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (timelineById[id]) return;
    await refreshTimeline(id);
  };
  const save = async (value: ScheduleInput) => {
    if (
      !value.name.trim() ||
      !value.start_time ||
      (value.schedule_type === "once" ? !value.run_date : !value.weekdays?.length)
    ) {
      toast.error(translate("schedule.required"));
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) await api.updateSchedule(editing.id, value);
      else await api.createSchedule(value);
      toast.success(translate("schedule.saved"));
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(scheduleErrorText(localizedError(e, translate)));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm(translate("schedule.confirmDelete"))) return;
    try {
      await api.deleteSchedule(id);
      setTimelineById((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch (e) {
      toast.error(scheduleErrorText(localizedError(e, translate)));
    }
  };
  const action = async (id: number, type: "pause" | "resume" | "run") => {
    try {
      if (type === "pause") await api.pauseSchedule(id);
      else if (type === "resume") await api.resumeSchedule(id);
      else {
        const result = await api.runScheduleNow(id);
        if (result.errors?.length) {
          toast.warning(
            translate("schedule.startedWithErrors", {
              started: result.started,
              failed: result.errors.length,
              errors: result.errors.map(scheduleErrorText).join("; "),
            }),
          );
        } else {
          toast.success(translate("schedule.started", { count: result.started }));
        }
      }
      await invalidateTimeline(id);
      await load();
    } catch (e) {
      toast.error(scheduleErrorText(localizedError(e, translate)));
    }
  };
  const bulkRun = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    let started = 0;
    const errors: string[] = [];
    const results = await Promise.allSettled(ids.map((id) => api.runScheduleNow(id)));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        errors.push(
          translate("schedule.scheduleError", {
            id: ids[index],
            message: scheduleErrorText(localizedError(result.reason, translate)),
          }),
        );
        return;
      }
      started += result.value.started;
      if (result.value.errors?.length)
        errors.push(
          translate("schedule.scheduleError", {
            id: ids[index],
            message: result.value.errors.map(scheduleErrorText).join("; "),
          }),
        );
    });
    if (errors.length) {
      toast.warning(
        translate("schedule.bulkStartedWithErrors", { started, failed: errors.length, errors: errors.join("; ") }),
      );
    } else {
      toast.success(translate("schedule.started", { count: started }));
    }
    setSelectedIds([]);
    await Promise.all(ids.map((id) => invalidateTimeline(id)));
    await load();
  };
  const bulkRemove = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(translate("schedule.confirmBulkDelete", { count: ids.length }))) return;
    const results = await Promise.allSettled(ids.map((id) => api.deleteSchedule(id)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) toast.warning(translate("schedule.deletedWithErrors", { deleted: ids.length - failed, failed }));
    else toast.success(translate("schedule.deleted", { count: ids.length }));
    setTimelineById((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    if (expandedId && ids.includes(expandedId)) setExpandedId(null);
    setSelectedIds([]);
    await load();
  };
  let scheduleContent: React.ReactNode;
  if (loading) {
    scheduleContent = (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" />
        {translate("schedule.loading")}
      </div>
    );
  } else if (items.length === 0) {
    scheduleContent = (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">{translate("schedule.empty")}</CardContent>
      </Card>
    );
  } else {
    scheduleContent = (
      <div className="grid gap-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={translate("schedule.search")}
              className="h-9 pl-8"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{translate("schedule.perPage")}</span>
            <Select value={pageSize} onValueChange={updatePageSize}>
              <SelectTrigger className="h-9 w-24 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{translate("schedule.rows", { count: 10 })}</SelectItem>
                <SelectItem value="20">{translate("schedule.rows", { count: 20 })}</SelectItem>
                <SelectItem value="50">{translate("schedule.rows", { count: 50 })}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">
              {translate("schedule.total", { count: filteredItems.length })}
            </span>
          </div>
        </div>
        {selectedIds.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <span className="text-sm">{translate("schedule.selectedSchedules", { count: selectedIds.length })}</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void bulkRun()}>
                <Zap data-icon="inline-start" />
                {translate("schedule.runNow")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void bulkRemove()}>
                <Trash2 data-icon="inline-start" />
                {translate("schedule.delete")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                {translate("schedule.clearSelection")}
              </Button>
            </div>
          </div>
        ) : null}
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate("schedule.noMatches")}
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label={translate("schedule.selectPage")}
                      checked={headerSelectionState}
                      onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                    />
                  </TableHead>
                  <TableHead className="font-mono">ID</TableHead>
                  <TableHead className="min-w-44">{translate("schedule.name")}</TableHead>
                  <TableHead className="w-px">{translate("schedule.remark")}</TableHead>
                  <TableHead className="w-28">{translate("schedule.timelineColumn")}</TableHead>
                  <TableHead className="min-w-48">{translate("schedule.period")}</TableHead>
                  <TableHead className="min-w-40">{translate("schedule.startTime")}</TableHead>
                  <TableHead className="min-w-40">{translate("schedule.endTime")}</TableHead>
                  <TableHead className="min-w-24 text-center">{translate("schedule.runCount")}</TableHead>
                  <TableHead className="min-w-36">{translate("schedule.boundTasks")}</TableHead>
                  <TableHead className="min-w-32">{translate("schedule.statusLabel")}</TableHead>
                  <TableHead className="min-w-72 text-right">{translate("schedule.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="group">
                      <TableCell className="w-12">
                        <Checkbox
                          aria-label={translate("schedule.selectSchedule", { name: item.name })}
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                        />
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{item.id}</code>
                      </TableCell>
                      <TableCell className="font-medium">
                        <ScheduleNameEditor
                          value={item.name}
                          label={translate("schedule.scheduleId", { id: item.id })}
                          onSave={async (name) => {
                            const updated = await api.renameSchedule(item.id, name);
                            setItems((current) =>
                              current.map((entry) => (entry.id === item.id ? { ...entry, name: updated.name } : entry)),
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <RemarkEditor
                          value={item.remark}
                          label={translate("schedule.scheduleLabel", { id: item.id, name: item.name })}
                          onSave={async (remark) => {
                            const updated = await api.updateScheduleRemark(item.id, remark);
                            setItems((current) =>
                              current.map((entry) =>
                                entry.id === item.id ? { ...entry, remark: updated.remark } : entry,
                              ),
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => void toggleTimeline(item.id)}>
                          {expandedId === item.id ? (
                            <ChevronDown data-icon="inline-start" />
                          ) : (
                            <ChevronRight data-icon="inline-start" />
                          )}
                          {expandedId === item.id ? translate("schedule.collapse") : translate("schedule.view")}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm">{periodLabel(item)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {startLabel(item)}
                        {item.next_start ? (
                          <div className="mt-1 text-muted-foreground text-xs">
                            {translate("schedule.nextWindow", {
                              time: nextWindowLabel(item.next_start, item.timezone),
                            })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {endLabel(item)}
                        {item.next_end ? (
                          <div className="mt-1 text-muted-foreground text-xs">
                            {translate("schedule.nextWindow", { time: nextWindowLabel(item.next_end, item.timezone) })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {item.run_count ?? 0}
                        {item.last_run_at ? (
                          <div className="mt-1 text-muted-foreground text-xs">
                            {translate("schedule.lastRun", { time: formatTime(item.last_run_at) })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className="max-w-52 truncate text-sm"
                        title={item.task_ids.map((id) => `#${id}`).join(", ")}
                      >
                        {item.task_ids.length
                          ? item.task_ids.map((id) => `#${id}`).join(", ")
                          : translate("schedule.none")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(item.status)}>
                          {statusText(item)}
                        </Badge>
                        <div className="mt-1 text-muted-foreground text-xs">{timezoneLabel(item)}</div>
                        <div className="mt-1 text-muted-foreground text-xs">
                          {translate("schedule.lastTransition", { time: formatTime(item.last_transition_at) })}
                        </div>
                        {item.last_error ? (
                          <div
                            className="mt-1 max-w-40 truncate text-destructive text-xs"
                            title={scheduleErrorText(item.last_error)}
                          >
                            {scheduleErrorText(item.last_error)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing({
                                id: item.id,
                                value: {
                                  name: item.name,
                                  enabled: item.enabled,
                                  timezone_mode: item.timezone_mode,
                                  schedule_type: item.schedule_type,
                                  run_date: item.run_date,
                                  end_date: item.end_date,
                                  weekdays: item.weekdays,
                                  start_time: item.start_time.slice(0, 5),
                                  end_time: item.end_time?.slice(0, 5),
                                  start_immediately: item.start_immediately,
                                  task_ids: item.task_ids,
                                },
                              })
                            }
                          >
                            {translate("schedule.edit")}
                          </Button>
                          {item.enabled ? (
                            <Button size="sm" variant="outline" onClick={() => void action(item.id, "pause")}>
                              <Pause data-icon="inline-start" />
                              {translate("schedule.pause")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void action(item.id, "resume")}>
                              <Play data-icon="inline-start" />
                              {translate("schedule.enable")}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => void action(item.id, "run")}>
                            <Zap data-icon="inline-start" />
                            {translate("schedule.runNow")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
                            <Trash2 data-icon="inline-start" />
                            {translate("schedule.delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === item.id ? (
                      <TableRow>
                        <TableCell colSpan={12} className="bg-muted/10 p-3">
                          <ScheduleTimeline schedule={timelineById[item.id]} loading={timelineLoadingId === item.id} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{translate("schedule.page", { page, totalPages })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              {translate("schedule.previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {translate("schedule.next")}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <CalendarClock />
            {translate("schedule.title")}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">{translate("schedule.description")}</p>
        </div>
        <Button onClick={() => setEditing({ value: { ...blank, task_ids: [] } })}>
          <Plus data-icon="inline-start" />
          {translate("schedule.create")}
        </Button>
      </div>
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? translate("schedule.editSchedule") : translate("schedule.create")}</CardTitle>
            <CardDescription>{translate("schedule.pauseHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleForm
              value={editing.value}
              tasks={tasks}
              saving={saving}
              onCancel={() => setEditing(null)}
              onSave={save}
            />
          </CardContent>
        </Card>
      )}
      {scheduleContent}
    </div>
  );
}
