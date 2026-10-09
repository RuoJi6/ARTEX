"use client";

import * as React from "react";

import Link from "next/link";

import { ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { TablePagination } from "@/components/table-pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type {
  Finding,
  FindingCase,
  FindingCasePage,
  FindingCaseReviewRun,
  FindingCaseSuggestion,
  FindingQuery,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function FindingSeverityCounts({
  counts,
}: {
  counts: Pick<FindingCase, "critical" | "high" | "medium" | "low">;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-sm tabular-nums"
      title="原始上报记录：严重 / 高 / 中 / 低"
      role="img"
      aria-label={`严重${counts.critical}，高危${counts.high}，中危${counts.medium}，低危${counts.low}`}
    >
      <span className={counts.critical ? "text-severity-critical" : "text-muted-foreground"}>{counts.critical}</span>
      <span>/</span>
      <span className={counts.high ? "text-severity-high" : "text-muted-foreground"}>{counts.high}</span>
      <span>/</span>
      <span className={counts.medium ? "text-severity-medium" : "text-muted-foreground"}>{counts.medium}</span>
      <span>/</span>
      <span className={counts.low ? "text-severity-low" : "text-muted-foreground"}>{counts.low}</span>
    </span>
  );
}

export function FindingCaseMemberRow({
  finding: f,
  selected,
  onSelect,
  contextTask,
  matched = true,
  nested = false,
}: {
  finding: Finding;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  contextTask?: string;
  matched?: boolean;
  nested?: boolean;
}) {
  const id = f.finding_id ?? f.id;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3 py-3 text-sm",
        nested
          ? "relative rounded-lg border bg-background px-3 before:absolute before:top-1/2 before:-left-4 before:w-4 before:border-border before:border-t sm:before:-left-5 sm:before:w-5"
          : "border-b px-4 last:border-b-0",
        !matched && "bg-muted/30",
      )}
    >
      {onSelect && !f.inherited ? (
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(id, v === true)} aria-label={`选择上报 #${id}`} />
      ) : null}
      <StatusBadge domain="severity" value={f.severity} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="truncate font-medium hover:underline"
          href={`/function/findings/detail?id=${id}${contextTask ? `&context_task=${contextTask}` : ""}`}
        >
          #{id} {[f.name, f.vulnclass].find((v) => v?.trim()) ?? "未分类"}
        </Link>
        <span className="truncate text-muted-foreground text-xs">{f.summary}</span>
      </div>
      {!matched ? <Badge variant="outline">未命中当前筛选</Badge> : null}
      {f.inherited ? <Badge variant="outline">继承 · 只读</Badge> : null}
      <StatusBadge domain="finding" value={f.status} />
      <Button asChild variant="ghost" size="sm">
        <Link href={`/function/findings/detail?id=${id}${contextTask ? `&context_task=${contextTask}` : ""}`}>
          查看报告
        </Link>
      </Button>
    </div>
  );
}

export function FindingCaseMembers({
  caseId,
  version,
  matchedIds,
  selectedIds,
  onSelect,
  contextTask,
  nested = false,
}: {
  caseId: string;
  version?: number;
  matchedIds?: number[];
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  contextTask?: string;
  nested?: boolean;
}) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ items: Finding[]; total: number } | null>(null);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version and retry deliberately reload changed evidence.
  React.useEffect(() => {
    let active = true;
    setError("");
    api
      .findingCaseMembers(caseId, page, contextTask)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [caseId, page, version, contextTask, retry]);
  if (error)
    return (
      <Alert>
        <AlertDescription>
          成员加载失败：{error}
          <Button variant="link" onClick={() => setRetry((v) => v + 1)}>
            重试
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!data)
    return (
      <div className="flex justify-center p-5">
        <Spinner />
      </div>
    );
  return (
    <div className={cn("flex min-w-0 flex-col", nested && "gap-2 border-primary/25 border-l-2 pl-4 sm:pl-5")}>
      {data.items.map((f) => (
        <FindingCaseMemberRow
          key={f.finding_id}
          finding={f}
          nested={nested}
          selected={selectedIds?.has(f.finding_id ?? f.id)}
          onSelect={onSelect}
          contextTask={contextTask}
          matched={!matchedIds || matchedIds.includes(Number(f.finding_id))}
        />
      ))}
      {data.total > 20 ? (
        <TablePagination
          page={page}
          pageSize={20}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(1)}
          pageSizeOptions={[20]}
        />
      ) : null}
    </div>
  );
}

function FindingMergeSuggestionCard({
  suggestion: s,
  onResolve,
}: {
  suggestion: FindingCaseSuggestion;
  onResolve: (s: FindingCaseSuggestion, accept: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  async function resolve(accept: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await onResolve(s, accept);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">疑似重复 · 待确认</Badge>
          <CardDescription>任务 #{s.task_id}</CardDescription>
        </div>
        <CardTitle className="break-words">{s.title}</CardTitle>
        <CardDescription className="flex flex-wrap gap-3">
          <Link className="underline underline-offset-4" href={`/function/findings/detail/?id=${s.left_id}`}>
            查看原报告 #{s.left_id}
          </Link>
          <Link className="underline underline-offset-4" href={`/function/findings/detail/?id=${s.right_id}`}>
            查看原报告 #{s.right_id}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          {!expanded ? (
            <p className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground text-sm">{s.reason}</p>
          ) : null}
          <CollapsibleContent className="whitespace-pre-wrap break-words text-muted-foreground text-sm">
            {s.reason}
          </CollapsibleContent>
          <CollapsibleTrigger asChild>
            <Button variant="link" size="sm">
              {expanded ? "收起判断依据" : "展开判断依据"}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => resolve(true)}>
          {busy ? <Spinner /> : null}确认归并
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => resolve(false)}>
          不是同一漏洞
        </Button>
      </CardFooter>
    </Card>
  );
}

function FindingReviewRunRow({ run: r }: { run: FindingCaseReviewRun }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      {r.state === "running" ? <Spinner /> : null}
      <span>
        任务 #{r.task_id} · 整理 #{r.conversation_id}
      </span>
      <Badge variant={r.state === "failed" ? "destructive" : "secondary"}>
        {{ queued: "排队中", running: "运行中", done: "已完成", failed: "失败" }[r.state]}
      </Badge>
      <Link className="underline underline-offset-4" href={`/chat?c=${r.conversation_id}`}>
        查看执行记录
      </Link>
      {r.error ? <p className="w-full break-words text-destructive">{r.error}</p> : null}
    </div>
  );
}

export function FindingCaseReviewPanel({ taskId, onChange }: { taskId?: string; onChange?: () => void }) {
  const [suggestions, setSuggestions] = React.useState<FindingCaseSuggestion[]>([]);
  const [runs, setRuns] = React.useState<FindingCaseReviewRun[]>([]);
  const [error, setError] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [s, r] = await Promise.all([api.findingCaseSuggestions(taskId), api.findingCaseReviewRuns()]);
        if (active) {
          setSuggestions(s);
          setRuns(r.filter((x) => !taskId || x.task_id === taskId));
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [taskId]);
  async function resolve(s: FindingCaseSuggestion, accept: boolean) {
    try {
      const result = await api.resolveFindingCaseSuggestion(s.id, accept);
      setSuggestions((v) => v.filter((x) => x.id !== s.id));
      if (accept && result.case_id !== "0") {
        toast.success("已归并，请进入文件夹生成统一报告");
      } else {
        toast.success("已否决，不会自动再次归并");
      }
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const latestByTask = new Map<string, FindingCaseReviewRun>();
  for (const run of runs) if (!latestByTask.has(run.task_id)) latestByTask.set(run.task_id, run);
  const latestFailures = [...latestByTask.values()].filter((run) => run.state === "failed");
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert>
          <AlertDescription>整理状态加载失败：{error}</AlertDescription>
        </Alert>
      ) : null}
      {suggestions.length > 0 ? (
        <p className="text-muted-foreground text-sm">待确认归并建议（{suggestions.length}）· 确认前原始记录分别保留</p>
      ) : null}
      {suggestions.map((s) => (
        <FindingMergeSuggestionCard key={s.id} suggestion={s} onResolve={resolve} />
      ))}
      {runs.some((r) => r.state === "queued" || r.state === "running") ? (
        <div className="flex flex-col gap-2">
          {runs
            .filter((r) => r.state === "queued" || r.state === "running")
            .map((r) => (
              <FindingReviewRunRow key={r.conversation_id} run={r} />
            ))}
        </div>
      ) : null}
      {latestFailures.map((r) => (
        <Alert key={r.conversation_id} variant="destructive">
          <AlertDescription>
            <FindingReviewRunRow run={r} />
          </AlertDescription>
        </Alert>
      ))}
      {runs.some((r) => r.state === "done" || r.state === "failed") ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {historyOpen ? "收起整理历史" : "查看整理历史"}（
              {runs.filter((r) => r.state === "done" || r.state === "failed").length}）
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 py-2">
            {runs
              .filter((r) => r.state === "done" || r.state === "failed")
              .map((r) => (
                <FindingReviewRunRow key={r.conversation_id} run={r} />
              ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

export function FindingCaseList({
  query,
  selectedIds,
  onSelect,
  contextTask,
  readOnly = false,
  onTotal,
}: {
  query: Omit<FindingQuery, "page" | "pageSize">;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  contextTask?: string;
  readOnly?: boolean;
  onTotal?: (total: number) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<FindingCasePage | null>(null);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const [refresh, setRefresh] = React.useState(0);
  const key = JSON.stringify(query);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when the filter fingerprint changes.
  React.useEffect(() => {
    setPage(1);
  }, [key]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is an explicit reload requested after grouping/retry.
  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const v = await api.findingCases({ ...JSON.parse(key), page, pageSize: 20 });
        if (active) {
          setData(v);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, page, refresh]);
  React.useEffect(() => {
    if (data) onTotal?.(data.total);
  }, [data, onTotal]);
  const toggle = (id: string) =>
    setOpen((v) => {
      const next = new Set(v);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!readOnly ? (
        <FindingCaseReviewPanel
          taskId={query.task === "all" ? undefined : query.task}
          onChange={() => setRefresh((v) => v + 1)}
        />
      ) : null}
      {error ? (
        <Alert>
          <AlertDescription>
            加载失败：{error}
            <Button variant="link" onClick={() => setRefresh((v) => v + 1)}>
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!data && !error ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : null}
      {data ? (
        <p className="text-muted-foreground text-xs">
          {data.stats.total} 个独立漏洞 · {data.stats.reports} 条上报
          {data.stats.unassessed > 0 ? ` · ${data.stats.unassessed} 个待评估` : ""}
        </p>
      ) : null}
      {data?.items.map((row) => {
        if (row.case) {
          const group = row.case;
          return (
            <Card key={`case:${group.id}`} className="gap-0 overflow-hidden py-0">
              <CardHeader className={cn("px-4 py-3", open.has(group.id) && "bg-muted/60")}>
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${open.has(group.id) ? "收起" : "展开"}${group.title}`}
                    aria-expanded={open.has(group.id)}
                    aria-controls={`finding-case-members-${group.id}`}
                    onClick={() => toggle(group.id)}
                  >
                    <ChevronRightIcon className={cn(open.has(group.id) && "rotate-90")} />
                  </Button>
                  {open.has(group.id) ? (
                    <FolderOpenIcon className="size-5 shrink-0 text-primary" />
                  ) : (
                    <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 flex-1 basis-2/3 flex-col gap-1 sm:basis-auto">
                    <CardTitle className="truncate text-sm">
                      <Link
                        className="hover:underline"
                        href={`/function/findings/case?id=${group.id}${contextTask ? `&context_task=${contextTask}` : ""}`}
                      >
                        {group.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      漏洞文件夹 · {group.count} 条原始上报 ·{" "}
                      {group.report_version !== group.version ? "统一报告待更新" : "统一报告已生成"}
                    </CardDescription>
                  </div>
                  <FindingSeverityCounts counts={group} />
                  <Badge variant="outline">
                    {group.severity
                      ? `统一评级：${{ critical: "严重", high: "高危", medium: "中危", low: "低危" }[group.severity]}`
                      : "待评估"}
                  </Badge>
                </div>
              </CardHeader>
              {open.has(group.id) ? (
                <CardContent
                  id={`finding-case-members-${group.id}`}
                  role="region"
                  aria-label={`${group.title}的原始子报告`}
                  className="border-t bg-muted/20 px-4 py-4 sm:px-6"
                >
                  <p className="mb-3 text-muted-foreground text-xs">原始子报告 · 各自等级和证据保留</p>
                  <FindingCaseMembers
                    nested
                    caseId={group.id}
                    version={group.version}
                    matchedIds={row.matched_ids}
                    selectedIds={selectedIds}
                    onSelect={readOnly ? undefined : onSelect}
                    contextTask={contextTask}
                  />
                </CardContent>
              ) : null}
            </Card>
          );
        }
        if (row.finding)
          return (
            <Card key={`finding:${row.finding.finding_id}`} className="gap-0 py-0">
              <CardContent className="px-0">
                <FindingCaseMemberRow
                  finding={row.finding}
                  selected={selectedIds?.has(row.finding.finding_id ?? row.finding.id)}
                  onSelect={readOnly ? undefined : onSelect}
                  contextTask={contextTask}
                />
              </CardContent>
            </Card>
          );
        return null;
      })}
      {data?.total === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">暂无匹配漏洞</p> : null}
      {data ? (
        <TablePagination
          page={page}
          pageSize={20}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(1)}
          pageSizeOptions={[20]}
        />
      ) : null}
    </div>
  );
}
