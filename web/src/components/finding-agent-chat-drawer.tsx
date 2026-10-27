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
import { shouldSubmitOnKey, useChatSendMode } from "@/lib/chat-send-mode";
import { MOCK } from "@/lib/mock/enabled";
import type { Activity, Finding } from "@/lib/types";

import {
  buildFindingAgentContextMessage,
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
  const sendMode = useChatSendMode();
  const [taskAvailable, setTaskAvailable] = React.useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = React.useState("");
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const snapshotRef = React.useRef(0);
  const aliveRef = React.useRef(false);
  const requestGenerationRef = React.useRef(0);
  const sentContextRef = React.useRef(false);
  const currentSegmentRef = React.useRef(0);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const atBottomRef = React.useRef(true);
  const findingIdRef = React.useRef(finding.id);
  findingIdRef.current = finding.id;

  const findingId = finding.id;
  const inherited = Boolean(finding.inherited);
  const canAsk = Boolean(taskId && !inherited);

  const closeStream = React.useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const refreshStatus = React.useCallback(
    (generation = requestGenerationRef.current) => {
      if (!taskId || !canAsk) return Promise.resolve();
      return api
        .chatStatus(taskId)
        .then(({ running: nextRunning }) => {
          if (aliveRef.current && requestGenerationRef.current === generation) setRunning(nextRunning);
        })
        .catch(() => undefined);
    },
    [canAsk, taskId],
  );

  React.useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const isCurrent = () =>
      aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId;

    closeStream();
    aliveRef.current = open;
    if (!open) return;

    sentContextRef.current = false;
    setInput("");
    setActivities([]);
    setTaskAvailable(null);
    setUnavailableReason(findingAgentUnavailableReason({ task_id: taskId, inherited }));
    setRunning(false);
    setLoading(false);
    setSending(false);
    setStopping(false);
    snapshotRef.current = 0;
    currentSegmentRef.current = 0;
    atBottomRef.current = true;

    if (!canAsk) {
      return () => {
        aliveRef.current = false;
        requestGenerationRef.current += 1;
        closeStream();
      };
    }

    setLoading(true);

    if (MOCK) {
      api
        .activity(taskId)
        .then(({ items, cursor }) => {
          if (!isCurrent()) return;
          setTaskAvailable(true);
          setActivities(mergeActivities([], items, currentSegmentRef.current));
          snapshotRef.current = cursor;
        })
        .catch(() => {
          if (!isCurrent()) return;
          setTaskAvailable(false);
          setUnavailableReason("任务不存在或已删除，无法连接到主 Agent。");
        })
        .finally(() => {
          if (isCurrent()) setLoading(false);
        });
    } else {
      api
        .task(taskId)
        .then(() => api.mainSessions(taskId))
        .then((sessions) => {
          if (!isCurrent()) return null;
          const currentSegment = sessions.current ?? 0;
          currentSegmentRef.current = currentSegment;
          return api.activityHistory(taskId, `main:${currentSegment}`, 0, MAIN_HISTORY_LIMIT).then((history) => ({
            currentSegment,
            history,
          }));
        })
        .then((result) => {
          if (!result || !isCurrent()) return;
          const { currentSegment, history } = result;
          setTaskAvailable(true);
          setActivities((current) => mergeActivities(current, history.items, currentSegment));
          snapshotRef.current = history.snapshotCursor;

          closeStream();
          const stream = openSSE(
            `/api/exploration/activity/stream?task=${encodeURIComponent(taskId)}&since=${snapshotRef.current}`,
          );
          if (!isCurrent()) {
            stream.close();
            return;
          }
          eventSourceRef.current = stream;
          stream.onmessage = (event) => {
            if (!isCurrent()) return;
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
          if (!isCurrent()) return;
          setTaskAvailable(false);
          setUnavailableReason("任务不存在或已删除，无法连接到主 Agent。");
        })
        .finally(() => {
          if (isCurrent()) setLoading(false);
        });
    }

    void refreshStatus(generation);
    const statusTimer = window.setInterval(() => void refreshStatus(generation), 2000);
    return () => {
      aliveRef.current = false;
      requestGenerationRef.current += 1;
      window.clearInterval(statusTimer);
      closeStream();
    };
  }, [canAsk, closeStream, findingId, inherited, open, refreshStatus, taskId]);

  const viewport = React.useCallback(
    () => (contentRef.current?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null) ?? null,
    [],
  );

  React.useEffect(() => {
    if (!open) return;
    const vp = viewport();
    if (!vp) return;
    const onScroll = () => {
      atBottomRef.current = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 60;
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => vp.removeEventListener("scroll", onScroll);
  }, [open, viewport]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const vp = viewport();
    if (vp) {
      vp.scrollTop = vp.scrollHeight;
      atBottomRef.current = true;
    }
  }, [open, viewport]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activity growth intentionally drives live-edge scrolling.
  React.useLayoutEffect(() => {
    if (!open || !atBottomRef.current) return;
    const vp = viewport();
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [activities, open, running, viewport]);

  React.useEffect(() => {
    if (!open || typeof ResizeObserver === "undefined") return;
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!atBottomRef.current) return;
      const vp = viewport();
      if (vp) vp.scrollTop = vp.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, viewport]);

  const send = React.useCallback(async () => {
    const message = input.trim();
    if (!message || sending || running || !taskId || taskAvailable !== true || !canAsk) return;
    const generation = requestGenerationRef.current;
    setSending(true);
    const payload = sentContextRef.current
      ? message
      : `${buildFindingAgentContextMessage(finding)}\n\n用户问题：${message}`;
    try {
      const result = await api.chat(payload, taskId);
      if (!aliveRef.current || requestGenerationRef.current !== generation || findingIdRef.current !== findingId)
        return;
      if (MOCK) {
        const ts = new Date().toISOString();
        const reply = result.reply?.trim() || "（demo）主 Agent 暂无回复。";
        setActivities((current) =>
          mergeActivities(
            current,
            [
              {
                seq: current.reduce((max, item) => Math.max(max, item.seq), 0) + 1,
                worker: "mainagent",
                ts,
                kind: "user",
                summary: message,
                main_seg: currentSegmentRef.current,
              },
              {
                seq: current.reduce((max, item) => Math.max(max, item.seq), 0) + 2,
                worker: "mainagent",
                ts,
                kind: "text",
                summary: reply,
                main_seg: currentSegmentRef.current,
              },
            ],
            currentSegmentRef.current,
          ),
        );
      }
      sentContextRef.current = true;
      setInput("");
      if (!MOCK) void refreshStatus(generation);
    } catch (error) {
      if (aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId) {
        toast.error(`发送失败：${(error as Error).message || "请稍后重试"}`);
      }
    } finally {
      if (aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId) {
        setSending(false);
      }
    }
  }, [canAsk, finding, findingId, input, refreshStatus, running, sending, taskAvailable, taskId]);

  const stop = React.useCallback(async () => {
    if (!taskId || stopping) return;
    const generation = requestGenerationRef.current;
    setStopping(true);
    try {
      await api.stopChat(taskId);
      if (aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId) {
        await refreshStatus(generation);
      }
    } catch (error) {
      if (aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId) {
        toast.error(`停止失败：${(error as Error).message || "请稍后重试"}`);
      }
    } finally {
      if (aliveRef.current && requestGenerationRef.current === generation && findingIdRef.current === findingId) {
        setStopping(false);
      }
    }
  }, [findingId, refreshStatus, stopping, taskId]);

  const title = findingDisplayTitle(finding);
  const canSend = canAsk && taskAvailable === true && !running && !sending && Boolean(input.trim());
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
          <div ref={contentRef} className="min-h-full p-4">
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
                if (!shouldSubmitOnKey(event, sendMode)) return;
                event.preventDefault();
                void send();
              }}
              disabled={!canAsk || taskAvailable !== true || sending || running}
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
