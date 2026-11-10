"use client";
import * as React from "react";

import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Loader2Icon,
  RadioIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { HttpPacketSyntax } from "@/components/http-code-block";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { LLMRecordDetail, LLMRecordItem, LLMTask } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtTime(ts: string, ui: UITranslate) {
  return new Date(ts).toLocaleString(ui("screen.91610255157661"), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtLatency(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function tryFormatJSON(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

// 复制当前框内文本的小按钮。复制成功后短暂显示对勾。text 为空/仅占位符时禁用。
function CopyButton({ text }: { text: string }) {
  const { ui } = useUITranslation();

  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const disabled = !text;
  const copy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard 在非安全上下文(如 http 局域网)不可用，回退到 execCommand。
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* 忽略：不支持则静默 */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-5 shrink-0"
      disabled={disabled}
      title={copied ? ui("screen.8f6f8d979c981c") : ui("screen.15a22a4015496e")}
      onClick={copy}
    >
      {copied ? <CheckIcon className="size-3 text-emerald-600" /> : <CopyIcon className="size-3" />}
    </Button>
  );
}

const PAGE_SIZES = [25, 50, 100];

export default function LLMRecordsPage() {
  const { ui } = useUITranslation();

  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(50);
  const [session, setSession] = React.useState("");
  const [sessionQ, setSessionQ] = React.useState("");
  const [model, setModel] = React.useState("");

  const [records, setRecords] = React.useState<LLMRecordItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  // Recording on/off toggle (settings.llm_record; default off). When off the
  // backend records nothing.
  const [recEnabled, setRecEnabled] = React.useState(false);
  const [recBusy, setRecBusy] = React.useState(false);

  // Inline detail panel (Burp-style split, not a dialog)
  const [selected, setSelected] = React.useState<LLMRecordItem | null>(null);
  const [detail, setDetail] = React.useState<LLMRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  // 归一化视图 / HTTP 原文视图。原文是排查 provider 侧问题的唯一依据：归一化视图
  // 不含工具 schema，响应里也没有 tool_use 块。
  const [rawView, setRawView] = React.useState(false);

  const hasRaw = !!(detail?.raw_request || detail?.raw_response);
  // 开关保持用户选择，但切到一条无原文的旧记录时自动落回解析视图，而不是显示空白。
  const showRaw = rawView && hasRaw;
  // 原文请求体是 JSON，pretty-print 只改排版不改语义，便于阅读；原文响应是 SSE
  // 帧，tryFormatJSON 解析失败会原样返回，故两边共用一个函数即可。
  const reqText = showRaw
    ? detail?.raw_request && tryFormatJSON(detail.raw_request)
    : detail?.request_body && tryFormatJSON(detail.request_body);
  const respText = showRaw ? detail?.raw_response : detail?.response_body && tryFormatJSON(detail.response_body);

  // Per-task delete (task picker + confirm dialog)
  const [tasks, setTasks] = React.useState<LLMTask[]>([]);
  const [pickedTask, setPickedTask] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [reloadTick, setReloadTick] = React.useState(0); // manual refetch trigger

  // Load recording toggle state on mount.
  React.useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((s) => {
        if (alive) setRecEnabled(!!s.llm_record);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggleRecording = async (on: boolean) => {
    setRecBusy(true);
    setRecEnabled(on); // optimistic
    try {
      const s = await api.setSettings({ llm_record: on });
      setRecEnabled(!!s.llm_record);
    } catch {
      setRecEnabled(!on); // revert on failure
    } finally {
      setRecBusy(false);
    }
  };

  // Debounce session filter.
  React.useEffect(() => {
    const t = setTimeout(() => setSessionQ(session.trim()), 300);
    return () => clearTimeout(t);
  }, [session]);

  // Reset page on filter change.
  React.useEffect(() => {
    setPage(0);
  }, [sessionQ, model, size, pickedTask]);

  // Load list.
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .llmRecords({
        model: model || undefined,
        session: sessionQ || undefined,
        task: pickedTask || undefined,
        page,
        size,
      })
      .then((r) => {
        if (!alive) return;
        setRecords(r.records ?? []);
        setTotal(r.total ?? 0);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    api
      .llmTasks()
      .then((r) => {
        if (alive) setTasks(r.tasks ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [page, size, sessionQ, model, pickedTask, reloadTick]);

  // Delete every LLM record for the picked task, then refetch.
  const confirmDelete = () => {
    setDeleting(true);
    api
      .llmRecordsDeleteTask(pickedTask)
      .then(() => {
        setDeleteOpen(false);
        setSelected(null);
        setDetail(null);
        setPickedTask("");
        setPage(0);
        setReloadTick((t) => t + 1);
      })
      .catch(() => {})
      .finally(() => setDeleting(false));
  };

  // Lazy-load full request/response when a row is selected.
  React.useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetail(null);
    api
      .llmRecordDetail(selected.id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  const totalPages = Math.max(1, Math.ceil(total / size));
  const rangeStart = total === 0 ? 0 : page * size + 1;
  const rangeEnd = page * size + records.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <RadioIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">{ui("screen.13d91ca2425df8")}</h1>
          <Badge variant="secondary">{total}</Badge>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={ui("screen.1d657e2e360859")}
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Input placeholder="Model" className="h-8 w-48" value={model} onChange={(e) => setModel(e.target.value)} />
        <Select value={pickedTask} onValueChange={setPickedTask}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder={ui("screen.09d99720f8d526")} />
          </SelectTrigger>
          <SelectContent>
            {tasks.length === 0 ? (
              <SelectItem value="__none__" disabled>
                {ui("screen.e393f849bfa17d")}
              </SelectItem>
            ) : (
              tasks.map((t) => (
                <SelectItem key={t.task_id} value={t.task_id}>
                  <span className="font-mono">#{t.task_id}</span>
                  <span className="ml-2 text-muted-foreground">
                    {ui("punctuation.da047c04c9")}
                    {t.count}
                    {ui("punctuation.f2e44c6c95")}
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          variant="destructive"
          size="sm"
          className="h-8"
          disabled={!pickedTask || deleting}
          title={pickedTask ? undefined : ui("screen.b53228399bde7f")}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className="size-3.5" />
          {ui("screen.4031e9aeef8be4")}
        </Button>
        <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {ui("screen.785e3cd53901f4")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Recording on/off — off means no LLM calls are recorded */}
        <div className="flex items-center gap-2 rounded-md border px-2.5 py-1">
          <Switch
            id="llm-rec-toggle"
            size="sm"
            checked={recEnabled}
            onCheckedChange={toggleRecording}
            disabled={recBusy}
          />
          <label
            htmlFor="llm-rec-toggle"
            className={cn(
              "cursor-pointer text-xs font-medium select-none",
              recEnabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {recEnabled ? ui("screen.2224a30ee2cdf9") : ui("screen.6744b4c6a9aa00")}
          </label>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {rangeStart}–{rangeEnd} / {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {/* History table + inline detail (Burp-style split) */}
      <div className="flex h-[calc(100vh-13rem)] min-h-0 flex-col gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-[130px]">{ui("screen.8b6ff498515bcc")}</TableHead>
                  <TableHead className="w-[60px]">{ui("screen.5253040db8643c")}</TableHead>
                  <TableHead className="w-[90px]">Worker</TableHead>
                  <TableHead className="w-[100px]">Profile</TableHead>
                  <TableHead className="w-[140px]">Model</TableHead>
                  <TableHead className="w-[70px]">{ui("screen.18045b8c40f135")}</TableHead>
                  <TableHead className="w-[90px]">Tokens</TableHead>
                  <TableHead className="w-[60px]">{ui("screen.6320b4a8722a85")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <Loader2Icon className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      {ui("screen.d4b9daf8e0b415")}
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((rec) => (
                    <TableRow
                      key={rec.id}
                      className={cn("cursor-pointer", selected?.id === rec.id && "bg-accent hover:bg-accent")}
                      onClick={() => setSelected(rec)}
                    >
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {fmtTime(rec.ts, ui)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {rec.task_id ? `#${rec.task_id}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {rec.worker || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{rec.profile_name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">{rec.model || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-xs", rec.latency_ms > 30000 && "text-amber-500")}>
                          {fmtLatency(rec.latency_ms)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {fmtTokens(rec.input_tokens)} / {fmtTokens(rec.output_tokens)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {rec.status === "ok" ? (
                          <Badge variant="secondary" className="text-xs text-emerald-600">
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Error
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Inline detail panel */}
        {selected && (
          <Card className="flex h-[42%] min-h-0 flex-col overflow-hidden py-0">
            {/* Detail header */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Badge variant="outline" className="text-xs font-mono">
                #{selected.id}
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {selected.profile_name || "-"}
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {selected.model || "-"}
              </Badge>
              {selected.task_id && (
                <Badge variant="outline" className="text-xs font-mono">
                  {ui("screen.e5b1cc0dc459e5")}
                  {selected.task_id}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{fmtTime(selected.ts, ui)}</span>
              <span className={cn("text-xs", selected.latency_ms > 30000 && "text-amber-500")}>
                {fmtLatency(selected.latency_ms)}
              </span>
              {selected.status === "ok" ? (
                <Badge variant="secondary" className="text-xs text-emerald-600">
                  OK
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  Error
                </Badge>
              )}
              {/* 原文视图开关。旧记录没有原文，此时禁用而非静默回退，避免看着像
                  「原文与解析一致」。 */}
              <Button
                variant={showRaw ? "secondary" : "ghost"}
                size="sm"
                className="ml-auto h-7 shrink-0 text-xs"
                disabled={!hasRaw}
                title={hasRaw ? ui("screen.19f79173a59136") : ui("screen.c482170f4a8b54")}
                onClick={() => setRawView((v) => !v)}
              >
                {ui("screen.354b28c8533345")}
              </Button>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setSelected(null)}>
                <XIcon />
              </Button>
            </div>
            {/* Request / Response split */}
            <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="flex items-center gap-2 border-b py-0.5 pr-1.5 pl-3 text-[11px] font-medium text-muted-foreground">
                  <span>Request{showRaw && ui("screen.9dfd168391d829")}</span>
                  <CopyButton text={reqText || ""} />
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {ui("screen.44acd119459d6d")}
                    </div>
                  ) : (
                    <pre className="p-3 font-mono text-xs break-all whitespace-pre-wrap">
                      <HttpPacketSyntax
                        raw={reqText || ""}
                        lineNumbers={false}
                        emptyFallback={ui("screen.fa8bc5e925f9f7")}
                      />
                    </pre>
                  )}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="flex items-center gap-2 border-b py-0.5 pr-1.5 pl-3 text-[11px] font-medium text-muted-foreground">
                  <span>Response{showRaw && ui("screen.0513fa2ad8e0e3")}</span>
                  <CopyButton text={respText || ""} />
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {ui("screen.44acd119459d6d")}
                    </div>
                  ) : (
                    <pre
                      className={cn(
                        "p-3 font-mono text-xs break-all whitespace-pre-wrap",
                        selected.status !== "ok" && "text-red-600 dark:text-red-400",
                      )}
                    >
                      <HttpPacketSyntax
                        raw={respText || ""}
                        lineNumbers={false}
                        emptyFallback={ui("screen.fa8bc5e925f9f7")}
                      />
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ui("screen.07cd328d25850f")}
              {pickedTask}
              {ui("screen.a5ccec9d6c5f26")}
            </AlertDialogTitle>
            <AlertDialogDescription>{ui("screen.ff46200f4c43e8")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? ui("screen.5e8e7af57abbcb") : ui("screen.a3ea3c17b401bd")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
