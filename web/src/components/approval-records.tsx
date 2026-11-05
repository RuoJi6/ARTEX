"use client";

import { useDateTime } from "@/i18n/formatting";

import * as React from "react";

import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClipboardListIcon,
  CopyIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DateSelect } from "@/components/date-select";
import { SideQuestionButton, SideQuestionWorkspace } from "@/components/side-question-workspace";
import { TablePagination } from "@/components/table-pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSideQuestions } from "@/hooks/use-side-questions";
import { api } from "@/lib/api";
import { useBuiltinRuleLabels } from "@/lib/rule-i18n";
import type {
  InterceptAudit,
  InterceptApprovalFilter,
  InterceptApprovalRow,
  InterceptDetail,
  InterceptPending,
  InterceptReviewInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Translator = ReturnType<typeof useTranslations>;

function source(row: InterceptApprovalRow) {
  if (row.decision_source) return row.decision_source;
  if (row.rule_id) return "rule";
  return row.reason?.startsWith("[模型]") ? "model" : "unknown";
}

function originLabel(row: InterceptApprovalRow, t: Translator) {
  if (row.task_id) return row.task_id;
  if (row.conversation_id) return t("conversationRef", { id: row.conversation_id });
  return "—";
}

// Background task runs carry a pool label such as "work#2 · #2770", while
// conversation-backed runs carry the agent key (for example "reporter").
// Present a stable, human-readable agent label in both cases.
function agentLabel(row: InterceptApprovalRow, t: Translator) {
  const key = (row.conv_agent_key || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    auto: "auto",
    mainagent: "mainagent",
    planner: "planner",
    worker: "worker",
    reporter: "reporter",
    retester: "retester",
    pentest: "pentest",
  };
  if (key && labels[key]) return t(`agents.${labels[key]}`);
  const raw = (row.agent_name || "").trim();
  if (/^work#\d+(?:\s|$)/i.test(raw)) return t("agents.worker");
  const rawKey = raw.toLowerCase();
  if (labels[rawKey]) return t(`agents.${labels[rawKey]}`);
  return raw || t("agents.unknown");
}

function ApprovalOrigin({ row, detail = false }: { row: InterceptApprovalRow; detail?: boolean }) {
  const t = useTranslations("approval");
  const [locating, setLocating] = React.useState(false);
  const label = detail && row.task_id ? t("taskRef", { id: row.task_id }) : originLabel(row, t);
  const query = new URLSearchParams({ approval: String(row.id) });
  let href: string | undefined;
  if (row.conversation_id) {
    query.set("c", String(row.conversation_id));
    href = `/chat?${query}`;
  } else if (row.task_id) {
    query.set("id", row.task_id);
    href = `/function/tasks/detail?${query}`;
  }
  return href ? (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      aria-label={t("locateSourceAria", { id: row.id, label })}
      aria-busy={locating}
      onClick={async (e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (locating) return;
        setLocating(true);
        try {
          await api.interceptExecution(row.id, row.conversation_id ?? undefined);
          window.location.assign(href);
        } catch (error) {
          toast.error((error as Error).message || t("locateFailed"));
          setLocating(false);
        }
      }}
    >
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("approval");
  let variant: "default" | "destructive" | "secondary" | "outline" = "outline";
  if (status === "allowed") variant = "default";
  if (status === "denied") variant = "destructive";
  if (status === "pending") variant = "secondary";
  return <Badge variant={variant}>{t.has(`status.${status}`) ? t(`status.${status}`) : status}</Badge>;
}

function MatchCell({ row, showReason = true }: { row: InterceptApprovalRow; showReason?: boolean }) {
  const ruleLabels = useBuiltinRuleLabels();
  const ui = useTranslations();
  const t = useTranslations("approval");
  const reason = row.reason?.replace(/^\[模型\]\s*/, "");
  const decisionSource = source(row);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {decisionSource === "model" ? (
        <Badge variant="outline">
          <BotIcon />
          {t("modelDecision")}
        </Badge>
      ) : decisionSource === "manual" ? (
        <Badge variant="outline">{ui("core.approvals.manual")}</Badge>
      ) : (
        <span className="truncate">{row.rule_name ? ruleLabels.name(row.rule_name) : t("ruleMissing")}</span>
      )}
      {showReason ? (
        <p className="truncate text-muted-foreground text-xs" title={reason}>
          {reason || t("noReason")}
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ label, text, truncated = false }: { label: string; text: string; truncated?: boolean }) {
  const t = useTranslations("approval");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">{label}</h3>
        {text ? (
          <Button variant="ghost" size="icon-xs" aria-label={t("copyAria", { label })} onClick={() => void copy()}>
            <CopyIcon />
          </Button>
        ) : null}
      </div>
      <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-xs leading-6 [overflow-wrap:anywhere]">
        {text || t("notRecorded")}
      </pre>
      {truncated ? <p className="text-muted-foreground text-xs">{t("truncatedNote")}</p> : null}
    </section>
  );
}

function ReviewBackgroundBlock({ background }: { background?: InterceptReviewInput["background"] }) {
  const ui = useTranslations();
  if (!background) return <p className="text-muted-foreground text-xs">{ui("approval.review.noBg")}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CodeBlock
        label={background.source === "user_message" ? ui("approval.review.bgUser") : ui("approval.review.bgWorkerLegacy")}
        text={background.text}
        truncated={background.truncated}
      />
      <p className="text-muted-foreground text-xs">
        {background.source === "user_message"
          ? ui("approval.review.bgUserNote")
          : ui("approval.review.bgWorkerNote")}
      </p>
    </div>
  );
}

function ScriptSnapshotSummary({ input }: { input: InterceptReviewInput }) {
  const ui = useTranslations();
  const files = input.script_files ?? [];
  if (!files.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3" aria-label={ui("core.approvals.scriptsAttached")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{ui("core.approvals.reviewScripts")}</h3>
        <Badge variant={input.script_capture_status === "incomplete" ? "destructive" : "secondary"}>
          {input.script_capture_status === "incomplete" ? ui("core.approvals.incomplete") : ui("core.approvals.attached")}
        </Badge>
      </div>
      {files.map((file) => (
        <ScriptFileSnapshot key={file.path} file={file} />
      ))}
      <p className="text-muted-foreground text-xs">{ui("core.approvals.snapshotNote")}</p>
    </section>
  );
}

function ScriptFileSnapshot({ file }: { file: NonNullable<InterceptReviewInput["script_files"]>[number] }) {
  const ui = useTranslations();
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-visible">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <code className="break-all">{file.path}</code>
        {file.sha256 ? <span className="text-muted-foreground">SHA-256 {file.sha256.slice(0, 12)}…</span> : null}
        {file.bytes != null ? <span className="text-muted-foreground">{file.bytes} {ui("core.common.bytes")}</span> : null}
      </div>
      {file.read_error ? <p className="text-destructive text-xs">{file.read_error}</p> : null}
      {file.content ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start px-0"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronUpIcon data-icon="inline-start" /> : <ChevronDownIcon data-icon="inline-start" />}
            {ui("core.approvals.viewScript")}</Button>
          {open ? <CodeBlock label={ui("core.approvals.scriptReviewSnapshot")} text={file.content} /> : null}
        </>
      ) : null}
    </div>
  );
}

function ModelReviewContext({ input }: { input: InterceptReviewInput }) {
  const ui = useTranslations();
  const t = useTranslations("approval");
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("review.context")}>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">{t("review.context")}</h3>
        <p className="text-muted-foreground text-xs">
          {t("review.snapshotNote")}
          {input.version < 4 ? t("review.legacyInput") : null}
        </p>
      </div>
      <CodeBlock
        label={t("review.currentCall")}
        text={JSON.stringify({ tool_name: input.tool_name, arguments: input.arguments }, null, 2)}
      />
      {input.version >= 2 ? (
        <ReviewBackgroundBlock background={input.background} />
      ) : (
        <>
          {input.turn_input ? (
            <CodeBlock label={t("review.turnInputLegacy")}
              text={input.turn_input} truncated={input.background_truncated} />
          ) : null}
          {input.task ? (
            <>
              <CodeBlock label={t("review.taskDescLegacy")}
                text={input.task.description} truncated={input.task.truncated} />
              <CodeBlock label={t("review.taskGoalLegacy")} text={input.task.goal} truncated={input.task.truncated} />
              <CodeBlock label={t("review.taskConstraintsLegacy")}
                text={JSON.stringify(input.task.constraints, null, 2)} />
            </>
          ) : null}
          {input.worker_intent ? (
            <CodeBlock label={t("review.workerIntentLegacy")}
              text={input.worker_intent} truncated={input.background_truncated} />
          ) : null}
        </>
      )}
      {input.working_directory ? <CodeBlock label={ui("approval.review.workingDir")} text={input.working_directory} /> : null}
      {input.script_files?.length ? (
        <section className="flex min-w-0 flex-col gap-4" aria-label={ui("core.approvals.snapshots")}>
          <div>
            <h3 className="font-medium text-sm">{ui("core.approvals.snapshots")}</h3>
            <p className="text-muted-foreground text-xs">
              {ui("core.approvals.extractNote")}</p>
          </div>
          {input.script_files.map((file) => (
            <div key={`${file.path}:${file.source ?? ""}:${file.sha256 ?? file.read_error ?? ""}`} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="break-all font-mono">{file.path}</span>
                {file.source ? <span className="text-muted-foreground">{file.source === "command" ? ui("core.approvals.inlineScript") : ui("core.approvals.referencedFile")}</span> : null}
                {file.sha256 ? <span className="text-muted-foreground">SHA-256 {file.sha256}</span> : null}
                {file.bytes != null ? <span className="text-muted-foreground">{file.bytes} {ui("core.common.bytes")}</span> : null}
              </div>
              {file.content ? <CodeBlock label={ui("core.approvals.scriptContent")} text={file.content} /> : null}
              {file.read_error ? (
                <Alert variant="destructive">
                  <AlertDescription>{file.read_error}</AlertDescription>
                </Alert>
              ) : null}
              {file.truncated ? (
                <p className="text-muted-foreground text-xs">{ui("core.approvals.noAutoAllow")}</p>
              ) : null}
            </div>
          ))}
          {input.script_capture_status === "incomplete" ? (
            <Alert variant="destructive">
              <AlertDescription>{ui("core.approvals.incompletePolicy")}</AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
      {input.version >= 3 ? (
        <p className="text-muted-foreground text-xs">{t("review.noHistory")}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="font-medium text-muted-foreground text-xs">{t("review.historyTitleLegacy")}</h4>
          {input.history?.length ? (
            input.history.map((entry) => (
              <div key={entry.tool_use_id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                <p className="break-words font-medium text-xs">
                  {entry.tool} · {entry.status === "succeeded" ? t("review.histSucceeded") : t("review.histFailed")}
                </p>
                <CodeBlock label={t("review.histArgs")} text={entry.arguments_preview} truncated={entry.truncated} />
                <CodeBlock label={t("review.histResult")} text={entry.result} truncated={entry.truncated} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">{t("review.noPairable")}</p>
          )}
          {input.history_truncated ? (
            <p className="text-muted-foreground text-xs">{t("review.histTruncated")}</p>
          ) : null}
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <ChevronDownIcon data-icon="inline-start" />
            {t("review.viewFullJson")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <CodeBlock label={t("review.modelInput")} text={JSON.stringify(input, null, 2)} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

type Decide = (id: number, decision: "allowed" | "denied") => Promise<void>;

function DecisionActions({ row, busy, decide }: { row: InterceptApprovalRow; busy: boolean; decide: Decide }) {
  const t = useTranslations("approval");
  if (row.status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void decide(row.id, "allowed")}>
        <CheckIcon data-icon="inline-start" />
        {t("allow")}
      </Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(row.id, "denied")}>
        <XIcon data-icon="inline-start" />
        {t("deny")}
      </Button>
    </div>
  );
}

export function ApprovalDetail({
  row,
  busy,
  decide,
  revision,
  readOnly = false,
  defaultExpanded = false,
  onResolved,
}: {
  row: InterceptApprovalRow;
  busy: boolean;
  decide: Decide;
  revision: number;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  onResolved?: (status: "allowed" | "denied" | "timeout") => void;
}) {
  const fmtTime = useDateTime();
  const ui = useTranslations();
  const t = useTranslations("approval");
  const ruleLabels = useBuiltinRuleLabels();
  const [detail, setDetail] = React.useState<InterceptDetail | null>(null);
  const [rawError, setError] = React.useState<string | null>(null);
  const error = rawError === null ? "" : rawError || t("loadError");
  const [retry, setRetry] = React.useState(0);
  const [more, setMore] = React.useState(defaultExpanded);
  const side = useSideQuestions(`/api/intercept/history/${row.id}`);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Status, refresh and retry invalidate details without closing the panel.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const next = await api.interceptDetail(row.id);
        if (cancelled) return;
        setDetail(next);
        setError(null);
        if (next.status !== "pending") onResolved?.(next.status);
        if (next.status === "pending" || next.audit?.execution_status === "awaiting_result")
          timer = setTimeout(() => void load(), 5000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "");
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [row.id, row.status, revision, retry, onResolved]);

  // Row updates are authoritative until the lazy detail has caught up.
  const current = detail?.status === row.status ? detail : row;
  const audit = detail?.audit;
  let execution = audit ? t(`execution.${audit.execution_status}`) : t("notRecorded");
  if (row.status === "pending") execution = t("execution.not_started");
  if (audit && audit.correlation !== "exact" && audit.effective_action === "allow") execution = t("execution.notCorrelated");
  const command = typeof row.tool_input?.command === "string" ? row.tool_input.command : undefined;
  let initialLabel = source(row) === "model" ? ui("approval.modelInitial") : source(row) === "manual" ? ui("core.approvals.manual") : ui("approval.ruleInitial");
  if (audit?.model_fallback) initialLabel = ui("approval.modelFallback");

  return (
    <SideQuestionWorkspace
      side={side}
      label={ui("core.approvals.sideTitle", { id: row.id, tool: row.tool_name })}
      composerLayout="stacked"
      placeholder={ui("core.approvals.questionPlaceholder")}
      noSnapshotHint={ui("core.approvals.questionReadyHint")}
      emptyDescription={ui("core.approvals.questionDescription")}
      suggestions={[
        ui("core.approvals.askPurpose"),
        ui("core.approvals.askWrites"),
        ui("core.approvals.askDecision"),
        ui("core.approvals.askUnknown"),
      ]}
      className={cn(side.open ? "min-h-[460px]" : "min-h-0")}
      mainClassName="overflow-visible"
    >
      <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-5">
        <div className="grid min-w-0 gap-5 rounded-xl border bg-muted/20 p-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-sm">{ui("core.approvals.context")}</span>
              <SideQuestionButton side={side} />
            </div>
            <CodeBlock
              label={ui("core.approvals.toolRequest", { agent: agentLabel(current, t) })}
              text={JSON.stringify(row.tool_input ?? {}, null, 2)}
            />
            {command ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDownIcon data-icon="inline-start" />
                    {ui("approval.viewCommand")}</Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <CodeBlock label={ui("approval.commandContent")} text={command} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {ui("core.approvals.executionPrefix")}<span className="text-foreground">{detail ? execution : ui("taskDetail.loading")}</span>
            </p>
            {audit?.model_input ? <ScriptSnapshotSummary input={audit.model_input} /> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:pl-5">
            <h3 className="font-medium text-muted-foreground text-xs">
              {current.status === "pending" ? ui("approval.reviewStatus") : ui("approval.approvalVerdict")}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={current.status} />
              <MatchCell row={current} showReason={false} />
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
              {current.reason?.replace(/^\[模型\]\s*/, "") || ui("approval.noApprovalReason")}
            </p>
            {audit?.decision_reason ? <p className="text-sm">{audit.decision_reason}</p> : null}
            {audit?.effective_action ? (
              <p className="text-sm">{ui("core.approvals.actionPrefix")}{t.has(`action.${audit.effective_action}`) ? t(`action.${audit.effective_action}`) : audit.effective_action}</p>
            ) : null}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">{ui("approval.table.source")}</dt>
              <dd className="break-words">
                <ApprovalOrigin row={current} detail />
              </dd>
              <dt className="text-muted-foreground">{ui("approval.requestedAt")}</dt>
              <dd>{fmtTime(row.created_at)}</dd>
              <dt className="text-muted-foreground">{ui("approval.decidedAt")}</dt>
              <dd>{fmtTime(current.decided_at)}</dd>
              {audit?.rule_name ? (
                <>
                  <dt className="text-muted-foreground">{ui("approval.ruleSnapshot")}</dt>
                  <dd>{ruleLabels.name(audit.rule_name)}</dd>
                </>
              ) : null}
              {audit?.profile_id ? (
                <>
                  <dt className="text-muted-foreground">{ui("approval.approvalModelProfile")}</dt>
                  <dd>#{audit.profile_id}</dd>
                </>
              ) : null}
            </dl>
            {!readOnly ? <DecisionActions row={current} busy={busy} decide={decide} /> : null}
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-2">
                <span>{ui("core.approvals.detailFailure")}{error}</span>
                <Button variant="outline" size="sm" onClick={() => setRetry((v) => v + 1)}>
                  {ui("approval.retryDetail")}</Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {!detail && !error ? <Skeleton className="h-8 w-60" /> : null}
        {detail && !audit ? (
          <Alert>
            <AlertDescription>{ui("approval.noDetailSnapshot")}</AlertDescription>
          </Alert>
        ) : null}
        {audit ? (
          <Collapsible open={more} onOpenChange={setMore}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDownIcon data-icon="inline-start" className={cn(more && "rotate-180")} />
                {more ? ui("approval.collapseContext") : ui("approval.viewContextAndResult")}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="flex min-w-0 flex-col gap-5">
                {audit.model_input ? (
                  <ModelReviewContext input={audit.model_input} />
                ) : (
                  <Alert>
                    <AlertDescription>
                      {audit.model_input_digest
                        ? ui("approval.digestOnlyNote")
                        : ui("approval.noModelInputNote")}
                    </AlertDescription>
                  </Alert>
                )}
                {audit.user_message || audit.context?.length ? (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ChevronDownIcon data-icon="inline-start" />
                        {audit.model_input && audit.model_input.version >= 3
                          ? ui("approval.viewAuditFragmentNotSent")
                          : ui("approval.viewAuditFragment")}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="flex min-w-0 flex-col gap-3">
                        {audit.user_message ? (
                          <CodeBlock
                            label={ui("approval.auditCurrentTurn")}
                            text={audit.user_message}
                            truncated={audit.user_truncated}
                          />
                        ) : null}
                        <section className="flex min-w-0 flex-col gap-3">
                          <h3 className="font-medium text-muted-foreground text-xs">{ui("approval.visibleContext")}</h3>
                          <p className="text-muted-foreground text-xs">
                            {ui("core.approvals.savedAtNote", { time: fmtTime(audit.captured_at) })}</p>
                          {audit.context_truncated ? (
                            <p className="text-muted-foreground text-xs">{ui("approval.contextTruncated")}</p>
                          ) : null}
                          {audit.context?.length ? (
                            audit.context.map((entry, index) => (
                              <CodeBlock
                                key={`${entry.kind}-${entry.tool_use_id || index}`}
                                label={`${t.has(`contextKind.${entry.kind}`) ? t(`contextKind.${entry.kind}`) : entry.kind}${entry.tool ? ` · ${entry.tool}` : ""}${entry.is_error ? " · " + ui("core.approvals.errorSuffix") : ""}`}
                                text={entry.text}
                                truncated={entry.truncated}
                              />
                            ))
                          ) : (
                            <p className="text-muted-foreground text-sm">{ui("approval.noRelatedContext")}</p>
                          )}
                        </section>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
                <CodeBlock
                  label={ui("core.common.labelValue", {
                    label: initialLabel,
                    value: t.has(`action.${audit.initial_action}`) ? t(`action.${audit.initial_action}`) : audit.initial_action,
                  })}
                  text={audit.initial_reason.replace(/^\[模型\]\s*/, "")}
                />
                <CodeBlock
                  label={ui("approval.executionOutput")}
                  text={audit.output ?? (audit.execution_status === "not_executed" ? ui("approval.toolNotExecuted") : ui("approval.noOutputYet"))}
                  truncated={audit.output_truncated}
                />
                {audit.correlation !== "exact" ? (
                  <Alert>
                    <AlertDescription>
                      {audit.correlation === "ambiguous"
                        ? ui("approval.ambiguousCorrelation")
                        : ui("approval.noUniqueToolId")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <dl className="grid gap-2 text-muted-foreground text-xs [overflow-wrap:anywhere]">
                  <div>{ui("core.approvals.toolCallId")}{audit.tool_use_id || ui("approval.notRecorded")}</div>
                  <div>{ui("core.approvals.inputHash")}{audit.input_digest}</div>
                  <div>{ui("core.approvals.configHash")}{audit.config_digest || ui("approval.notRecorded")}</div>
                  {audit.model_input_digest ? <div>{ui("core.approvals.reviewHash")}{audit.model_input_digest}</div> : null}
                  {audit.execution_ended_at ? <div>{ui("core.approvals.resultTime")}{fmtTime(audit.execution_ended_at)}</div> : null}
                </dl>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </SideQuestionWorkspace>
  );
}

// Hidden cells do not occupy table columns. Keep the detail span in sync so
// expansion cannot create empty columns and leave a gap in the selected row.
const approvalBreakpoints = ["(min-width: 40rem)", "(min-width: 48rem)", "(min-width: 64rem)", "(min-width: 80rem)"];
function subscribeColumns(onChange: () => void) {
  const queries = approvalBreakpoints.map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}
function visibleColumnCount() {
  const matches = approvalBreakpoints.map((query) => window.matchMedia(query).matches);
  return 3 + Number(matches[0]) + Number(matches[1]) + 2 * Number(matches[2]) + 2 * Number(matches[3]);
}
function serverColumnCount() {
  return 9;
}

function ApprovalTable({
  rows,
  busy,
  decide,
  revision,
  label,
}: {
  rows: InterceptApprovalRow[];
  busy: boolean;
  decide: Decide;
  revision: number;
  label: string;
}) {
  const fmtTime = useDateTime();
  const t = useTranslations("approval");
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());
  const columns = React.useSyncExternalStore(subscribeColumns, visibleColumnCount, serverColumnCount);
  const prefix = React.useId();
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <Table className="table-fixed" aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">{t("table.expandDetail")}</span>
          </TableHead>
          <TableHead className="hidden w-14 sm:table-cell">#</TableHead>
          <TableHead className="w-28">{t("table.tool")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("table.source")}</TableHead>
          <TableHead className="hidden lg:table-cell">{t("table.matchRule")}</TableHead>
          <TableHead className="hidden xl:table-cell">{t("table.params")}</TableHead>
          <TableHead className="w-24">{t("table.status")}</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">{t("requestedAt")}</TableHead>
          <TableHead className="hidden w-36 xl:table-cell">{t("decidedAt")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const open = expanded.has(row.id);
          const panelID = `${prefix}-${row.id}`;
          return (
            <React.Fragment key={row.id}>
              <TableRow
                data-state={open ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => toggle(row.id)}
              >
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("row.toggleAria", { action: open ? t("collapse") : t("expand"), id: row.id })}
                    aria-expanded={open}
                    aria-controls={open ? panelID : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(row.id);
                    }}
                  >
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.id}</TableCell>
                <TableCell>
                  <code className="block truncate text-xs">{row.tool_name}</code>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    <span className="truncate" title={originLabel(row, t)}>
                      <ApprovalOrigin row={row} />
                    </span>
                    <span className="truncate text-muted-foreground text-xs" title={agentLabel(row, t)}>
                      {t("agentLabel", { name: agentLabel(row, t) })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <MatchCell row={row} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <code className="block truncate text-muted-foreground text-xs">{JSON.stringify(row.tool_input)}</code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs lg:table-cell">
                  {fmtTime(row.created_at)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs xl:table-cell">
                  {fmtTime(row.decided_at)}
                </TableCell>
              </TableRow>
              {open ? (
                <TableRow className="hover:bg-transparent has-aria-expanded:bg-transparent">
                  <TableCell colSpan={columns} className="whitespace-normal p-0">
                    <section id={panelID} aria-label={t("detailAria", { id: row.id })}>
                      <ApprovalDetail row={row} busy={busy} decide={decide} revision={revision} />
                    </section>
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ApprovalRecords({ taskId }: { taskId?: string }) {
  const ui = useTranslations();
  const t = useTranslations("approval");
  const [rows, setRows] = React.useState<InterceptApprovalRow[]>([]);
  const [pendingRows, setPendingRows] = React.useState<InterceptPending[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [filter, setFilter] = React.useState<InterceptApprovalFilter>({});
  const [searchText, setSearchText] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [rawError, setError] = React.useState<string | null>(null);
  const error = rawError === null ? "" : rawError || t("loadError");
  const [rawPendingError, setPendingError] = React.useState<string | null>(null);
  const pendingError = rawPendingError === null ? "" : rawPendingError || t("loadError");
  const [deciding, setDeciding] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const request = React.useRef(0);
  const decisionLock = React.useRef(false);
  const filterID = React.useId();
  const filtered = Boolean(filter.status || filter.decision_source || filter.q || filter.from || filter.to);

  // A task can stay mounted while the user switches between task details.
  // Reset the cursor so the new scope always starts at its newest records.
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId intentionally resets pagination when scope changes.
  React.useEffect(() => {
    setPage(1);
  }, [taskId]);

  const load = React.useCallback(
    async (manual = false) => {
      const id = ++request.current;
      if (manual) setRefreshing(true);
      try {
        // The approval queue is independent of the current history page and its
        // filter. Older requests must remain actionable even when newer decisions
        // fill the page or a filter would hide them.
        const [history, pending] = await Promise.allSettled([
          taskId
            ? api.interceptTaskPage(taskId, page, pageSize, filter)
            : api.interceptHistoryPage(page, pageSize, filter),
          api.interceptPending(),
        ]);
        if (id !== request.current) return;
        if (history.status === "fulfilled") {
          setRows(history.value.items);
          setTotal(history.value.total);
          setError(null);
        } else {
          setError((history.reason as Error).message || "");
        }
        if (pending.status === "fulfilled") {
          setPendingRows(pending.value);
          setPendingError(null);
        } else {
          setPendingError((pending.reason as Error).message || "");
        }
        if (manual) setRevision((v) => v + 1);
      } catch (e) {
        if (id === request.current) setError((e as Error).message || "");
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [taskId, page, pageSize, filter],
  );
  const latestLoad = React.useRef(load);
  latestLoad.current = load;

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      request.current++;
      clearInterval(timer);
    };
  }, [load]);

  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

  const changeFilter = (next: InterceptApprovalFilter) => {
    // An in-flight response for the old filter must not repopulate the table.
    request.current++;
    setFilter(next);
    setSearchText(next.q ?? "");
    setFromDate(next.from ?? "");
    setToDate(next.to ?? "");
    setPage(1);
    setRows([]);
    setTotal(0);
    setError(null);
    setLoading(true);
  };

  const submitSearch = () => {
    const q = searchText.trim();
    changeFilter({ ...filter, q: q || undefined });
  };

  const changeDate = (key: "from" | "to", value: string) => {
    changeFilter({ ...filter, [key]: value || undefined });
  };

  React.useEffect(() => {
    const q = searchText.trim();
    if (q === (filter.q ?? "")) return;
    const timer = setTimeout(() => {
      request.current++;
      setFilter((previous) => ({ ...previous, q: q || undefined }));
      setPage(1);
      setRows([]);
      setTotal(0);
      setError(null);
      setLoading(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, filter.q]);

  const decide: Decide = async (id, decision) => {
    if (decisionLock.current) return;
    decisionLock.current = true;
    setDeciding(true);
    try {
      await api.interceptDecide(id, decision);
      // Invalidate a list request started before this decision.
      request.current++;
      // Optimistically drop the decided item from the independent pending queue
      // for instant feedback; the re-fetch below reconciles with server truth.
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: decision, decided_at: new Date().toISOString() } : row)),
      );
      setPendingRows((prev) => prev.filter((row) => row.id !== id));
      setRevision((v) => v + 1);
      toast.success(decision === "allowed" ? t("allowedExecution") : t("deniedExecution"));
      // Re-fetch counts and rows: a decided item may no longer match the filter.
      await latestLoad.current(true);
    } catch (e) {
      toast.error((e as Error).message);
      await latestLoad.current(true);
    } finally {
      decisionLock.current = false;
      setDeciding(false);
    }
  };

  const historyById = new Map(rows.map((row) => [row.id, row]));
  const pending: InterceptApprovalRow[] = pendingRows
    .filter((row) => !taskId || row.task_id === taskId)
    .map((row) => ({
      conv_title: "",
      conv_agent_key: "",
      rule_name: row.rule_id ? t("ruleRef", { id: row.rule_id }) : "",
      ...historyById.get(row.id),
      ...row,
    }));
  const title = taskId ? t("title.task") : t("title.history");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardListIcon className="size-5 text-muted-foreground" />
          <h1 className="font-semibold text-xl">{title}</h1>
          {pending.length ? <Badge variant="secondary">{t("pendingBadge", { count: pending.length})}</Badge> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          {t("refresh")}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {ui("core.approvals.searchDescription")}</p>
      <FieldGroup className="flex-row flex-wrap items-end gap-3" aria-label={ui("approval.filter.label")}>
        <Field className="w-full sm:min-w-80 sm:flex-1">
          <FieldLabel htmlFor={`${filterID}-search`}>{ui("core.approvals.search")}</FieldLabel>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${filterID}-search`}
                className="pl-8"
                value={searchText}
                maxLength={200}
                placeholder={ui("core.approvals.searchPlaceholder")}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearch();
                  }
                }}
              />
            </div>
            <Button type="button" variant="outline" onClick={submitSearch}>
              {ui("search.label")}</Button>
          </div>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>{ui("core.approvals.from")}</FieldLabel>
          <DateSelect
            value={fromDate}
            onValueChange={(value) => changeDate("from", value)}
            optional
            placeholder={ui("core.approvals.startDate")}
            aria-label={ui("core.approvals.from")}
          />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>{ui("core.approvals.to")}</FieldLabel>
          <DateSelect
            value={toDate}
            onValueChange={(value) => changeDate("to", value)}
            optional
            placeholder={ui("core.approvals.endDate")}
            aria-label={ui("core.approvals.to")}
          />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-status`}>{t("filter.status")}</FieldLabel>
          <Select
            value={filter.status ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                status: value === "all" ? undefined : (value as InterceptApprovalFilter["status"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("filter.statusAll")}</SelectItem>
                <SelectItem value="denied">{t("status.denied")}</SelectItem>
                <SelectItem value="pending">{t("status.pending")}</SelectItem>
                <SelectItem value="allowed">{t("status.allowed")}</SelectItem>
                <SelectItem value="timeout">{t("status.timeout")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-source`}>{t("filter.source")}</FieldLabel>
          <Select
            value={filter.decision_source ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                decision_source: value === "all" ? undefined : (value as InterceptApprovalFilter["decision_source"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-source`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{ui("approval.filter.sourceAll")}</SelectItem>
                <SelectItem value="model">{ui("approval.sourceOption.model")}</SelectItem>
                <SelectItem value="rule">{ui("approval.sourceOption.rule")}</SelectItem>
                <SelectItem value="manual">{ui("core.approvals.manual")}</SelectItem>
                <SelectItem value="unknown">{ui("approval.sourceOption.unknown")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => changeFilter({})}>
            {t("filter.clear")}
          </Button>
        ) : null}
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("recordLoadError", {error})}</AlertDescription>
        </Alert>
      ) : null}
      {pendingError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("pendingLoadError", { error: pendingError})}</AlertDescription>
        </Alert>
      ) : null}
      {pending.length ? (
        <section className="rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 font-medium text-sm">
            <ShieldAlertIcon className="size-4" />
            {t("pendingSection", { count: pending.length})}{" "}
            <span className="text-muted-foreground text-xs">{t("pendingHint")}</span>
          </div>
          <ApprovalTable rows={pending} busy={deciding} decide={decide} revision={revision} label={t("pendingTableLabel")}
          />
        </section>
      ) : null}
      <section className="rounded-xl border">
        <div className="border-b px-4 py-3 font-medium text-sm">
          {ui("approval.recordsHeading", { filtered: filtered ? "yes" : "no", total })}
          {filter.q ? (
            <span className="ml-2 break-all font-normal text-muted-foreground text-xs">{ui("core.common.searchPrefix")}{filter.q}</span>
          ) : null}
        </div>
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}
        {!loading && !rows.length && !error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardListIcon />
              </EmptyMedia>
              <EmptyTitle>{filtered ? t("emptyFiltered") : t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? t("emptyFilteredDesc") : t("emptyDesc")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {rows.length ? (
          <ApprovalTable rows={rows} busy={deciding} decide={decide} revision={revision} label={t("historyTableLabel")}
          />
        ) : null}
        {!loading && !error ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            pageSizeOptions={[10, 20, 50]}
          />
        ) : null}
      </section>
    </div>
  );
}
