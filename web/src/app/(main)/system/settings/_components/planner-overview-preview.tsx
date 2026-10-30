"use client";

import * as React from "react";

import { EyeIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { PlannerOverviewPreviewData, Task } from "@/lib/types";

function formatBytes(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export function PlannerOverviewPreview() {
  const [open, setOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [taskID, setTaskID] = React.useState("");
  const [preview, setPreview] = React.useState<PlannerOverviewPreviewData | null>(null);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const requestID = React.useRef(0);

  const loadPreview = React.useCallback(async (id: string) => {
    const currentRequest = ++requestID.current;
    setLoadingPreview(true);
    try {
      const data = await api.plannerOverviewPreview(id);
      if (requestID.current === currentRequest) setPreview(data);
    } catch (error) {
      if (requestID.current === currentRequest) {
        setPreview(null);
        toast.error(`预览加载失败：${(error as Error).message}`);
      }
    } finally {
      if (requestID.current === currentRequest) setLoadingPreview(false);
    }
  }, []);

  const openPreview = async () => {
    setOpen(true);
    setLoadingTasks(true);
    try {
      const result = await api.tasks();
      setTasks(result.tasks);
      const selected = result.tasks.some((task) => task.id === result.active)
        ? result.active
        : result.tasks[0]?.id || "";
      setTaskID(selected);
      setPreview(null);
      if (selected) await loadPreview(selected);
    } catch (error) {
      toast.error(`任务列表加载失败：${(error as Error).message}`);
    } finally {
      setLoadingTasks(false);
    }
  };

  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (!value) requestID.current += 1;
  };

  const loading = loadingTasks || loadingPreview;
  const reduction = preview?.reduction_pct ?? 0;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void openPreview()}>
        <EyeIcon data-icon="inline-start" />
        预览紧凑视图
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Planner 态势视图预览</DialogTitle>
            <DialogDescription>
              使用所选任务当前的 graph_overview
              实时生成，不调用模型、不触发压缩或任务执行。内容不含系统提示词与本轮触发信息。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={taskID || undefined}
              disabled={loadingTasks || tasks.length === 0}
              onValueChange={(value) => {
                setTaskID(value);
                void loadPreview(value);
              }}
            >
              <SelectTrigger className="w-full sm:max-w-xl">
                <SelectValue placeholder={loadingTasks ? "正在加载任务…" : "选择要预览的任务"} />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    #{task.id} {task.name || task.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!taskID || loading}
              onClick={() => void loadPreview(taskID)}
            >
              <RefreshCwIcon data-icon="inline-start" className={loadingPreview ? "animate-spin" : undefined} />
              刷新
            </Button>
          </div>
          {preview ? (
            <div className="text-muted-foreground text-xs">
              紧凑 {formatBytes(preview.compact_bytes)} · 原始 {formatBytes(preview.full_bytes)} ·{" "}
              {reduction >= 0 ? "减少" : "增加"} {Math.abs(reduction).toFixed(1)}%
            </div>
          ) : null}
          {loadingPreview && !preview ? (
            <div className="text-muted-foreground flex h-[52vh] items-center justify-center rounded-md border text-sm">
              正在生成真实任务预览…
            </div>
          ) : null}
          {preview ? (
            <Tabs defaultValue="compact" className="min-h-0 flex-1">
              <TabsList>
                <TabsTrigger value="compact">紧凑视图</TabsTrigger>
                <TabsTrigger value="full">原始 JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="compact">
                <pre className="h-[52vh] overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {preview.compact}
                </pre>
              </TabsContent>
              <TabsContent value="full">
                <pre className="h-[52vh] overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {preview.full}
                </pre>
              </TabsContent>
            </Tabs>
          ) : null}
          {!loading && !preview ? (
            <div className="text-muted-foreground flex h-[52vh] items-center justify-center rounded-md border text-sm">
              {tasks.length === 0 ? "暂无可预览任务" : "请选择任务后刷新预览"}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
