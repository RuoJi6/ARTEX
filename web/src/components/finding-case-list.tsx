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
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type {
  Finding,
  FindingCase,
  FindingCaseListRow,
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
  const { ui } = useUITranslation();

  return (
    <span
      className="inline-flex items-center gap-0.5 text-sm tabular-nums"
      title={ui("screen.e8c5ef9382d350")}
      role="img"
      aria-label={ui("screen.0d8c0ed391578c", {
        v0: counts.critical,
        v1: counts.high,
        v2: counts.medium,
        v3: counts.low,
      })}
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
  const { ui } = useUITranslation();

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
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelect(id, v === true)}
          aria-label={ui("screen.75118f3a43a586", { v0: id })}
        />
      ) : null}
      <StatusBadge domain="severity" value={f.severity} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="truncate font-medium hover:underline"
          href={`/function/findings/detail?id=${id}${contextTask ? `&context_task=${contextTask}` : ""}`}
        >
          #{id} {[f.name, f.vulnclass].find((v) => v?.trim()) ?? ui("screen.54b89f90127458")}
        </Link>
        <span className="truncate text-muted-foreground text-xs">{f.summary}</span>
      </div>
      {!matched ? <Badge variant="outline">{ui("screen.7852ff0b787df8")}</Badge> : null}
      {f.inherited ? <Badge variant="outline">{ui("screen.44630dd91821d1")}</Badge> : null}
      <StatusBadge domain="finding" value={f.status} />
      <Button asChild variant="ghost" size="sm">
        <Link href={`/function/findings/detail?id=${id}${contextTask ? `&context_task=${contextTask}` : ""}`}>
          {ui("screen.a08bfa0c50e289")}
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
  renderRecords,
}: {
  caseId: string;
  version?: number;
  matchedIds?: number[];
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  contextTask?: string;
  nested?: boolean;
  renderRecords?: (items: Finding[]) => React.ReactNode;
}) {
  const { ui } = useUITranslation();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [data, setData] = React.useState<{ items: Finding[]; total: number } | null>(null);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version and retry deliberately reload changed evidence.
  React.useEffect(() => {
    let active = true;
    setError("");
    api
      .findingCaseMembers(caseId, page, contextTask, pageSize)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [caseId, page, pageSize, version, contextTask, retry]);
  if (error)
    return (
      <Alert>
        <AlertDescription>
          {ui("screen.695b940ab1af3e")}
          {error}
          <Button variant="link" onClick={() => setRetry((v) => v + 1)}>
            {ui("screen.b8784c8dd5636f")}
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
      {renderRecords
        ? renderRecords(data.items)
        : data.items.map((f) => (
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
      {data.total > 10 ? (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
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
  onResolve: (s: FindingCaseSuggestion, accept: boolean, excludeIds?: string[]) => Promise<void>;
}) {
  const { ui } = useUITranslation();

  const [expanded, setExpanded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ids = React.useMemo(
    () => (Array.isArray(s.finding_ids) && s.finding_ids.length > 0 ? s.finding_ids : [s.left_id, s.right_id]),
    [s.finding_ids, s.left_id, s.right_id],
  );
  const [excluded, setExcluded] = React.useState<string[]>([]);
  React.useEffect(() => {
    setExcluded((current) => {
      const next = current.filter((id) => ids.includes(id));
      return next.length === current.length ? current : next;
    });
  }, [ids]);
  const validExcluded = excluded.filter((id) => ids.includes(id));
  const included = ids.filter((id) => !validExcluded.includes(id));
  async function resolve(accept: boolean) {
    if (busy) return;
    if (accept && included.length < 2) return;
    setBusy(true);
    try {
      await onResolve(s, accept, accept ? validExcluded : []);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {ui("screen.046b2f635c11ed")}
            {ids.length} {ui("screen.96a8de35964937")}
          </Badge>
          <CardDescription>
            {ui("screen.e5b1cc0dc459e5")}
            {s.task_id}
          </CardDescription>
        </div>
        <CardTitle className="break-words">{s.title}</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          {ids.map((id) => (
            <span key={id} className="flex items-center gap-2">
              <Checkbox
                checked={!excluded.includes(id)}
                disabled={busy}
                onCheckedChange={(value) =>
                  setExcluded((current) =>
                    value === true
                      ? current.filter((item) => item !== id)
                      : [...current.filter((item) => item !== id), id],
                  )
                }
                aria-label={ui("screen.2ea99060e9cc28", { v0: id })}
              />
              <Link className="underline underline-offset-4" href={`/function/findings/detail/?id=${id}`}>
                {ui("screen.9b8fd53005c92b")}
                {id}
              </Link>
            </span>
          ))}
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
              {expanded ? ui("screen.d4585da0edd72c") : ui("screen.71717465a2f0fc")}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || included.length < 2} onClick={() => resolve(true)}>
          {busy ? <Spinner /> : null}
          {included.length === ids.length
            ? ui("screen.09484600542d8e")
            : ui("screen.eb666ee37bde81", { v0: included.length })}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => resolve(false)}>
          {ui("screen.04dd946ef358b7")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function FindingReviewRunRow({ run: r }: { run: FindingCaseReviewRun }) {
  const { ui } = useUITranslation();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      {r.state === "running" ? <Spinner /> : null}
      <span>
        {ui("screen.e5b1cc0dc459e5")}
        {r.task_id} {ui("screen.070ef218298bbb")}
        {r.conversation_id}
      </span>
      <Badge variant={r.state === "failed" ? "destructive" : "secondary"}>
        {
          {
            queued: ui("screen.d6f766f2adf532"),
            running: ui("screen.1f0eb99b7ed094"),
            done: ui("screen.f28461bb49c856"),
            failed: ui("screen.28384d7afd2e4f"),
          }[r.state]
        }
      </Badge>
      <Link className="underline underline-offset-4" href={`/chat?c=${r.conversation_id}`}>
        {ui("screen.7715a51ffbac9e")}
      </Link>
      {r.error ? <p className="w-full break-words text-destructive">{r.error}</p> : null}
    </div>
  );
}

export function FindingCaseReviewPanel({ taskId, onChange }: { taskId?: string; onChange?: () => void }) {
  const { ui } = useUITranslation();

  const [suggestions, setSuggestions] = React.useState<FindingCaseSuggestion[]>([]);
  const [runs, setRuns] = React.useState<FindingCaseReviewRun[]>([]);
  const [error, setError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const requestSeq = React.useRef(0);
  const taskKey = taskId ?? "";
  const taskKeyRef = React.useRef(taskKey);
  taskKeyRef.current = taskKey;
  const previousTaskKey = React.useRef(taskKey);
  React.useEffect(() => {
    if (previousTaskKey.current === taskKey) return;
    previousTaskKey.current = taskKey;
    setSuggestions([]);
    setRuns([]);
    setError("");
  }, [taskKey]);
  React.useEffect(() => {
    const seq = ++requestSeq.current;
    const requestedTask = taskKey;
    void reload;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [s, r] = await Promise.all([api.findingCaseSuggestions(taskId), api.findingCaseReviewRuns()]);
        if (active && seq === requestSeq.current && requestedTask === taskKeyRef.current) {
          setSuggestions(s);
          setRuns(r.filter((x) => !taskId || x.task_id === taskId));
          setError("");
        }
      } catch (e) {
        if (active && seq === requestSeq.current && requestedTask === taskKeyRef.current)
          setError((e as Error).message);
      } finally {
        if (active && seq === requestSeq.current && requestedTask === taskKeyRef.current)
          timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reload, taskId, taskKey]);
  async function resolve(s: FindingCaseSuggestion, accept: boolean, excludeIds?: string[]) {
    const seq = ++requestSeq.current;
    const requestedTask = taskKey;
    try {
      const result = await api.resolveFindingCaseSuggestion(s.id, accept, excludeIds);
      if (requestedTask === taskKeyRef.current) {
        setReload((v) => v + 1);
        if (seq === requestSeq.current) {
          setSuggestions((v) => v.filter((x) => x.id !== s.id));
          if (accept && result.case_id !== "0") {
            toast.success(ui("screen.f8341bc19ac543"));
          } else {
            toast.success(ui("screen.a3c1bdd20d1cf1"));
          }
          onChange?.();
        }
      }
    } catch (e) {
      if (requestedTask === taskKeyRef.current) {
        setReload((v) => v + 1);
        if (seq === requestSeq.current) toast.error((e as Error).message);
      }
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert>
          <AlertDescription>
            {ui("screen.ec1cb4f366c39a")}
            {error}
          </AlertDescription>
        </Alert>
      ) : null}
      {suggestions.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {ui("screen.2ab1badc66393b")}
          {suggestions.length}
          {ui("screen.abf1d4dab0b7ab")}
        </p>
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
  const { ui } = useUITranslation();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [data, setData] = React.useState<FindingCasePage | null>(null);
  const [error, setError] = React.useState("");
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
        const v = await api.findingCases({ ...JSON.parse(key), page, pageSize });
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
  }, [key, page, pageSize, refresh]);
  React.useEffect(() => {
    if (data) onTotal?.(data.total);
  }, [data, onTotal]);
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
            {ui("screen.01de8216e0d025")}
            {error}
            <Button variant="link" onClick={() => setRefresh((v) => v + 1)}>
              {ui("screen.b8784c8dd5636f")}
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
          {data.stats.total} {ui("screen.95d4c67ec52ff4")}
          {data.stats.reports} {ui("screen.5f6536d648dc23")}
        </p>
      ) : null}
      {data?.items.map((row) => {
        if (row.case) {
          return (
            <FindingCaseFolder
              key={`case:${row.case.id}`}
              row={row}
              selectedIds={selectedIds}
              onSelect={onSelect}
              contextTask={contextTask}
              readOnly={readOnly}
            />
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
      {data?.total === 0 ? (
        <p className="p-6 text-center text-muted-foreground text-sm">{ui("screen.8185ab666cd031")}</p>
      ) : null}
      {data ? (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      ) : null}
    </div>
  );
}

// Only consolidated findings use this folder surface. Ordinary findings keep
// the original table rows and controls in each surrounding view.
export function FindingCaseFolder({
  row,
  selectedIds,
  onSelect,
  contextTask,
  readOnly = false,
  presentation = "compact",
  className,
  renderRecords,
}: {
  row: FindingCaseListRow;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  contextTask?: string;
  readOnly?: boolean;
  presentation?: "compact" | "records" | "task" | "asset";
  className?: string;
  renderRecords?: (items: Finding[]) => React.ReactNode;
}) {
  const { ui } = useUITranslation();

  const [open, setOpen] = React.useState(false);
  const group = row.case;
  const taskLabel = row.task_name?.trim() ? row.task_name : row.task_description;
  if (!group) return null;
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className={cn("px-4 py-3", open && "bg-muted/60")}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${open ? ui("screen.afd4b783536b82") : ui("screen.00bd3960fea8ea")}${group.title}`}
            aria-expanded={open}
            aria-controls={`finding-case-members-${group.id}`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRightIcon className={cn(open && "rotate-90")} />
          </Button>
          {open ? (
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
              {ui("screen.460116a18bbda7")}
              {group.count} {ui("screen.a9147d5e8b4196")}{" "}
              {group.report_version !== group.version ? ui("screen.99c01379e8e143") : ui("screen.632e3cdf7f317c")}
            </CardDescription>
            {presentation !== "compact" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                {presentation !== "task" && group.task_id ? (
                  <Link
                    className="max-w-full truncate hover:underline"
                    href={`/function/tasks/detail?id=${group.task_id}`}
                    title={row.task_description}
                  >
                    {ui("screen.4ad24bbfb4ae24")}
                    {group.task_id}
                    {taskLabel ? ` · ${taskLabel}` : ""}
                  </Link>
                ) : null}
                {(row.assets ?? []).length ? (
                  <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
                    {ui("screen.abd5f70799f7f4")}
                    {row.assets?.map((a) => (
                      <code
                        key={a.id}
                        className="max-w-48 truncate rounded bg-muted px-1"
                        title={`${a.type} · ${a.label}`}
                      >
                        {a.label}
                      </code>
                    ))}
                    {(row.asset_count ?? 0) > 4 ? <span>+{(row.asset_count ?? 0) - 4}</span> : null}
                  </span>
                ) : (
                  <span>{ui("screen.1c0ecd9c779c59")}</span>
                )}
                {row.last_found_at ? (
                  <time dateTime={row.last_found_at}>
                    {ui("screen.b42cf3366e92f2")}{" "}
                    {new Date(row.last_found_at).toLocaleString(ui("screen.91610255157661"), {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">{ui("screen.b0c29e51bd5d30")}</span>
            <FindingSeverityCounts counts={group} />
          </div>
        </div>
      </CardHeader>
      {open ? (
        <CardContent
          id={`finding-case-members-${group.id}`}
          role="region"
          aria-label={ui("screen.b206af0eb021a4", { v0: group.title })}
          className="border-t bg-muted/20 px-4 py-4 sm:px-6"
        >
          <FindingCaseMembers
            nested
            renderRecords={renderRecords}
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
