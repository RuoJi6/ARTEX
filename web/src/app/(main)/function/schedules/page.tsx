"use client";

import * as React from "react";

import { CalendarClock, Loader2, Pause, Play, Plus, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { DateSelect } from "@/components/date-select";
import { TimeSelect } from "@/components/time-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ScheduleInput } from "@/lib/api";
import type { Task, TaskSchedule } from "@/lib/types";

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

function statusText(s: TaskSchedule) {
  return (
    (
      {
        waiting: "等待窗口",
        running: "窗口运行中",
        outside: "窗口外",
        completed: "已完成",
        error: "错误",
        paused: "已暂停",
      } as Record<string, string>
    )[s.status] ?? s.status
  );
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function statusVariant(status: TaskSchedule["status"]): "default" | "destructive" | "secondary" {
  if (status === "running") return "default";
  if (status === "error") return "destructive";
  return "secondary";
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
    taskListContent = <span className="text-muted-foreground text-sm">暂无任务</span>;
  } else if (filteredTasks.length === 0) {
    taskListContent = <span className="text-muted-foreground text-sm">没有匹配的任务</span>;
  } else {
    taskListContent = filteredTasks.map((task) => (
      <div key={task.id} className="flex items-center gap-2 py-1 text-sm">
        <Checkbox
          id={`schedule-task-${task.id}`}
          checked={(draft.task_ids ?? []).includes(Number(task.id))}
          onCheckedChange={(v) => toggleTask(Number(task.id), !!v)}
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
        <Label>计划名称</Label>
        <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="例如：周末持续扫描" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>规则</Label>
          <Select
            value={draft.schedule_type}
            onValueChange={(value) => set({ schedule_type: value as ScheduleInput["schedule_type"] })}
          >
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">按周</SelectItem>
              <SelectItem value="once">指定日期</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>时区</Label>
          <Select
            value={draft.timezone_mode}
            onValueChange={(value) => set({ timezone_mode: value as ScheduleInput["timezone_mode"] })}
          >
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beijing">中国北京时间</SelectItem>
              <SelectItem value="system">系统当前时区</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {draft.schedule_type === "once" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>开始日期</Label>
            <DateSelect
              value={draft.run_date ?? ""}
              onValueChange={(value) => set({ run_date: value })}
              aria-label="开始日期"
            />
          </div>
          <div className="grid gap-2">
            <Label>截止日期（可选）</Label>
            <DateSelect
              value={draft.end_date ?? ""}
              onValueChange={(value) => set({ end_date: value })}
              optional
              placeholder="不设置截止日期"
              aria-label="截止日期，可选"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label>星期</Label>
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
          <Label>开始时间</Label>
          <TimeSelect
            value={draft.start_time}
            onValueChange={(value) => set({ start_time: value })}
            aria-label="开始时间"
          />
        </div>
        <div className="grid gap-2">
          <Label>结束时间（可选）</Label>
          <TimeSelect
            value={draft.end_time ?? ""}
            onValueChange={(value) => set({ end_time: value })}
            optional
            aria-label="结束时间，可选"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        一次性计划可设置截止日期；截止日期为空时仅按结束时间控制。结束时间为空表示持续运行，结束时间早于开始时间表示跨午夜窗口。
      </p>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="schedule-start-immediately"
          checked={draft.start_immediately}
          onCheckedChange={(v) => set({ start_immediately: !!v })}
        />
        <Label htmlFor="schedule-start-immediately">创建后立即启动，不等待第一个窗口</Label>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>绑定任务</Label>
          <span className="text-muted-foreground text-xs">已选 {(draft.task_ids ?? []).length} 个</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder="检索任务名称、描述或 ID"
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-40 overflow-auto rounded border p-2">{taskListContent}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button disabled={saving} onClick={() => onSave(draft)}>
          {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}保存计划
        </Button>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  const [items, setItems] = React.useState<TaskSchedule[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<{ id?: number; value: ScheduleInput } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.schedules(), api.tasks()]);
      setItems(s);
      setTasks(t.tasks);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  const save = async (value: ScheduleInput) => {
    if (
      !value.name.trim() ||
      !value.start_time ||
      (value.schedule_type === "once" ? !value.run_date : !value.weekdays?.length)
    ) {
      toast.error("请补全计划名称、日期/星期和开始时间");
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) await api.updateSchedule(editing.id, value);
      else await api.createSchedule(value);
      toast.success("计划已保存");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm("确定删除这个计划吗？")) return;
    try {
      await api.deleteSchedule(id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const action = async (id: number, type: "pause" | "resume" | "run") => {
    try {
      if (type === "pause") await api.pauseSchedule(id);
      else if (type === "resume") await api.resumeSchedule(id);
      else await api.runScheduleNow(id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  let scheduleContent: React.ReactNode;
  if (loading) {
    scheduleContent = (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载计划中…
      </div>
    );
  } else if (items.length === 0) {
    scheduleContent = (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          暂无计划任务，点击“新建计划”开始。
        </CardContent>
      </Card>
    );
  } else {
    scheduleContent = (
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <CardDescription>
                    {item.schedule_type === "once"
                      ? item.run_date
                      : (item.weekdays ?? []).map((d) => weekdays[d - 1]).join("、")}
                  </CardDescription>
                </div>
                <Badge variant={statusVariant(item.status)}>{statusText(item)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="text-muted-foreground">
                {item.start_time.slice(0, 5)}
                {item.end_time ? ` - ${item.end_time.slice(0, 5)}` : " 起持续运行"} ·{" "}
                {item.timezone_mode === "beijing" ? "北京时间" : item.timezone}
              </div>
              <div>绑定任务：{item.task_ids.length ? item.task_ids.map((id) => `#${id}`).join("、") : "无"}</div>
              <div className="text-muted-foreground text-xs">
                最近变化：{formatTime(item.last_transition_at)}
                {item.last_error ? ` · ${item.last_error}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
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
                  编辑
                </Button>
                {item.enabled ? (
                  <Button size="sm" variant="outline" onClick={() => void action(item.id, "pause")}>
                    <Pause data-icon="inline-start" />
                    暂停
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void action(item.id, "resume")}>
                    <Play data-icon="inline-start" />
                    启用
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void action(item.id, "run")}>
                  <Zap data-icon="inline-start" />
                  立即运行
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <CalendarClock />
            计划任务
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">按北京时间或系统时区控制扫描任务的开始、暂停和恢复。</p>
        </div>
        <Button onClick={() => setEditing({ value: { ...blank, task_ids: [] } })}>
          <Plus data-icon="inline-start" />
          新建计划
        </Button>
      </div>
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? "编辑计划" : "新建计划"}</CardTitle>
            <CardDescription>计划结束时会暂停任务，下一次有效窗口自动继续。</CardDescription>
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
