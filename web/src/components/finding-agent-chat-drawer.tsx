"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowUpIcon, Loader2Icon, MessageCircleQuestionIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";

import { Transcript } from "@/components/transcript";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, openSSE } from "@/lib/api";
import type { Activity, Finding } from "@/lib/types";

import {
  buildFindingAgentContextMessage,
  canAskFindingAgent,
  findingAgentUnavailableReason,
  findingDisplayTitle,
} from "./finding-agent-chat";

const MAIN_HISTORY_LIMIT = 200;

type FindingAgentChatDrawerProps = {
  finding: Finding;
};

function mainActivity(activity: Activity, segment: number): boolean {
  if (activity.worker !== "mainagent") return false;
  return activity.main_seg == null || activity.main_seg === segment;
}

function mergeActivities(current: Activity[], incoming: Activity[], segment: number): Activity[] {
  const bySeq = new Map<number, Activity>();
  for (const item of current) bySeq.set(item.seq, item);
  for (const item of incoming) {
    if (mainActivity(item, segment)) bySeq.set(item.seq, item);
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function LoadingActivity() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      正在加载主 Agent 对话…
    </div>
  );
}

function EmptyActivity({ available }: { available: boolean }) {
  return (
    <p className="text-muted-foreground text-sm">
      {available ? "还没有对话。发送问题后，主 Agent 的回复会显示在这里。" : "暂无可显示的活动。"}
    </p>
  );
}

export function FindingAgentChatDrawer({ finding }: FindingAgentChatDrawerProps) {
  const taskId = finding.task_id ?? "";
  const [open, setOpen] = React.useState(false);
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [taskAvailable, setTaskAvailable] = React.useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = React.useState("");
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const snapshotRef = React.useRef(0);
  const aliveRef = React.useRef(false);
  const sentContextRef = React.useRef(false);

  const closeStream = React.useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const refreshStatus = React.useCallback(() => {
    if (!taskId || !canAskFindingAgent(finding)) return Promise.resolve();
    return api
      .chatStatus(taskId)
      .then(({ running: nextRunning }) => setRunning(nextRunning))
      .catch(() => undefined);
  }, [finding, taskId]);

  React.useEffect(() => {
    if (!open) {
      aliveRef.current = false;
      closeStream();
      return;
    }

    aliveRef.current = true;
    sentContextRef.current = false;
    setInput("");
    setActivities([]);
    setTaskAvailable(null);
    setUnavailableReason(findingAgentUnavailableReason(finding));
    setRunning(false);
    setLoading(false);
    snapshotRef.current = 0;

    if (!canAskFindingAgent(finding))
      return () => {
        aliveRef.current = false;
        closeStream();
      };

    setLoading(true);
    api
      .task(taskId)
      .then(() => api.mainSessions(taskId))
      .then((sessions) => {
        if (!aliveRef.current) return null;
        const currentSegment = sessions.current ?? 0;
        return api.activityHistory(taskId, `main:${currentSegment}`, 0, MAIN_HISTORY_LIMIT).then((history) => ({
          currentSegment,
          history,
        }));
      })
      .then((result) => {
        if (!result || !aliveRef.current) return;
        const { currentSegment, history } = result;
        setTaskAvailable(true);
        setActivities((current) => mergeActivities(current, history.items, currentSegment));
        snapshotRef.current = history.snapshotCursor;
        const stream = openSSE(
          `/api/exploration/activity/stream?task=${encodeURIComponent(taskId)}&since=${snapshotRef.current}`,
        );
        eventSourceRef.current = stream;
        stream.onmessage = (event) => {
          if (!aliveRef.current) return;
          try {
            const activity = JSON.parse(event.data) as Activity;
            setActivities((current) => mergeActivities(current, [activity], currentSegment));
          } catch {
            // Ignore malformed frames; the next history refresh still repairs the view.
          }
        };
        stream.onerror = () => undefined; // EventSource reconnects automatically.
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setTaskAvailable(false);
        setUnavailableReason("任务不存在或已删除，无法连接到主 Agent。");
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false);
      });

    void refreshStatus();
    const statusTimer = window.setInterval(() => void refreshStatus(), 2000);
    return () => {
      aliveRef.current = false;
      window.clearInterval(statusTimer);
      closeStream();
    };
  }, [closeStream, finding, open, refreshStatus, taskId]);

  const send = React.useCallback(async () => {
    const message = input.trim();
    if (!message || sending || running || !taskId || taskAvailable !== true || !canAskFindingAgent(finding)) return;
    setSending(true);
    const payload = sentContextRef.current
      ? message
      : `${buildFindingAgentContextMessage(finding)}\n\n用户问题：${message}`;
    try {
      await api.chat(payload, taskId);
      sentContextRef.current = true;
      setInput("");
      void refreshStatus();
    } catch (error) {
      toast.error(`发送失败：${(error as Error).message || "请稍后重试"}`);
    } finally {
      setSending(false);
    }
  }, [finding, input, refreshStatus, running, sending, taskAvailable, taskId]);

  const stop = React.useCallback(async () => {
    if (!taskId || stopping) return;
    setStopping(true);
    try {
      await api.stopChat(taskId);
      await refreshStatus();
    } catch (error) {
      toast.error(`停止失败：${(error as Error).message || "请稍后重试"}`);
    } finally {
      setStopping(false);
    }
  }, [refreshStatus, stopping, taskId]);

  const title = findingDisplayTitle(finding);
  const canSend =
    canAskFindingAgent(finding) && taskAvailable === true && !running && !sending && Boolean(input.trim());
  let footerStatus = "Enter 发送，Shift+Enter 换行。";
  if (sending) footerStatus = "正在发送…";
  else if (running) footerStatus = "主 Agent 运行中，可停止当前执行。";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="问 Agent">
        <MessageCircleQuestionIcon />问 Agent
      </Button>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate">问 Agent · {title}</SheetTitle>
          <SheetDescription className="flex min-w-0 items-center gap-1">
            所属任务：
            {taskId ? (
              <Link className="truncate text-primary hover:underline" href={`/function/tasks/detail?id=${taskId}`}>
                {finding.task_description ?? `#${taskId}`}
              </Link>
            ) : (
              <span>无</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {unavailableReason ? (
          <Alert variant="destructive" className="m-4 mb-0">
            <AlertDescription>{unavailableReason}</AlertDescription>
          </Alert>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="min-h-full p-4">
            {loading ? <LoadingActivity /> : null}
            {!loading && activities.length ? (
              <Transcript
                activity={activities}
                live={running}
                taskId={taskId}
                chat
                fetchDetail={(seq) => api.activityDetail(seq, taskId).then((r) => r.detail)}
              />
            ) : null}
            {!loading && !activities.length ? <EmptyActivity available={taskAvailable === true} /> : null}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t bg-background p-3">
          <div className="flex w-full items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={!canAskFindingAgent(finding) || taskAvailable !== true || sending || running}
              placeholder={running ? "主 Agent 正在运行…" : "描述复现现象或继续提问…"}
              aria-label="向漏洞所属任务的主 Agent 提问"
              className="max-h-32 min-h-10 resize-none"
            />
            {running ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => void stop()}
                disabled={stopping}
                title="停止当前执行"
                aria-label="停止当前执行"
              >
                {stopping ? <Loader2Icon className="animate-spin" /> : <SquareIcon />}
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => void send()}
                disabled={!canSend}
                title="发送消息"
                aria-label="发送消息"
              >
                {sending ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
              </Button>
            )}
          </div>
          <p className="w-full text-[11px] text-muted-foreground">{footerStatus}</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
