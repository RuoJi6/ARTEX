"use client";
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
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type {
  InterceptApprovalFilter,
  InterceptApprovalRow,
  InterceptAudit,
  InterceptDetail,
  InterceptPending,
  InterceptReviewInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtTime(value: string | undefined, ui: UITranslate) {
  if (!value) return "—";
  return new Date(value).toLocaleString(ui("screen.91610255157661"), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function source(row: InterceptApprovalRow, ui: UITranslate) {
  if (row.decision_source) return row.decision_source;
  if (row.rule_id) return "rule";
  // Persisted legacy prefixes are protocol data, independent of the UI language.
  return row.reason?.startsWith("[模型]") || row.reason?.startsWith("[Model]") ? "model" : "unknown";
}

function originLabel(row: InterceptApprovalRow, ui: UITranslate) {
  if (row.task_id) return row.task_id;
  if (row.conversation_id) return ui("screen.7cb8ef7708e0c9", { v0: row.conversation_id });
  return "—";
}

// Background task runs carry a pool label such as "work#2 · #2770", while
// conversation-backed runs carry the agent key (for example "reporter").
// Present a stable, human-readable agent label in both cases.
function agentLabel(row: InterceptApprovalRow, ui: UITranslate) {
  const key = (row.conv_agent_key || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    auto: ui("screen.f47916cc6d8bee"),
    mainagent: ui("screen.565311dc5e56ac"),
    planner: ui("screen.27c00694ec29ae"),
    worker: ui("screen.fa408509bb3beb"),
    reporter: ui("screen.4a089c8a70311e"),
    retester: ui("screen.5687b31efebf25"),
    pentest: ui("screen.221e3cbe5ee467"),
  };
  if (key && labels[key]) return labels[key];
  const raw = (row.agent_name || "").trim();
  if (/^work#\d+(?:\s|$)/i.test(raw)) return ui("screen.fa408509bb3beb");
  const rawKey = raw.toLowerCase();
  if (labels[rawKey]) return labels[rawKey];
  return raw || ui("screen.1bc790653b8568");
}

function ApprovalOrigin({ row, detail = false }: { row: InterceptApprovalRow; detail?: boolean }) {
  const { ui } = useUITranslation();

  const [locating, setLocating] = React.useState(false);
  const label = detail && row.task_id ? ui("screen.60af8e99ccd7c5", { v0: row.task_id }) : originLabel(row, ui);
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
      aria-label={ui("screen.ddd9839c5480cc", { v0: row.id, v1: label })}
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
          toast.error((error as Error).message || ui("screen.8f66d5abc0cb9f"));
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
  const { ui } = useUITranslation();

  const labels: Record<string, string> = {
    pending: ui("screen.dcb49342a5e5fb"),
    allowed: ui("screen.75d889ac43a261"),
    denied: ui("screen.f098218a3032a6"),
    timeout: ui("screen.73ce15fee42ed3"),
  };
  let variant: "default" | "destructive" | "secondary" | "outline" = "outline";
  if (status === "allowed") variant = "default";
  if (status === "denied") variant = "destructive";
  if (status === "pending") variant = "secondary";
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

function MatchCell({ row, showReason = true }: { row: InterceptApprovalRow; showReason?: boolean }) {
  const { ui } = useUITranslation();

  const reason = row.reason?.replace(/^\[模型\]\s*/, "");
  const decisionSource = source(row, ui);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {decisionSource === "model" ? (
        <Badge variant="outline">
          <BotIcon />
          {ui("screen.80ae6d5293d6d8")}
        </Badge>
      ) : decisionSource === "manual" ? (
        <Badge variant="outline">{ui("screen.0f99a349059ac0")}</Badge>
      ) : (
        <span className="truncate">{row.rule_name || ui("screen.f841534297bbc5")}</span>
      )}
      {showReason ? (
        <p className="truncate text-muted-foreground text-xs" title={reason}>
          {reason || ui("screen.df246a6a1cbe71")}
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ label, text, truncated = false }: { label: string; text: string; truncated?: boolean }) {
  const { ui } = useUITranslation();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ui("screen.8f6f8d979c981c"));
    } catch {
      toast.error(ui("screen.3889e92517c51b"));
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">{label}</h3>
        {text ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={ui("screen.c3fae971f4051a", { v0: label })}
            onClick={() => void copy()}
          >
            <CopyIcon />
          </Button>
        ) : null}
      </div>
      <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-xs leading-6 [overflow-wrap:anywhere]">
        {text || ui("screen.7450cc5b16e245")}
      </pre>
      {truncated ? <p className="text-muted-foreground text-xs">{ui("screen.a7b110a3ffcacf")}</p> : null}
    </section>
  );
}

const contextLabels = (ui: UITranslate): Record<string, string> => ({
  user: ui("screen.a7dfeaf0c12ca5"),
  assistant: ui("screen.148743ace1f7e4"),
  text: ui("screen.148743ace1f7e4"),
  tool_use: ui("screen.d549abd1ab432d"),
  tool_result: ui("screen.d15e8edc823e30"),
});

const actionLabels = (ui: UITranslate): Record<string, string> => ({
  allow: ui("screen.ce7ef28b670ade"),
  ask: ui("screen.1b1bd81c56e340"),
  deny: ui("screen.136de7a8c46fc8"),
});
const executionLabels = (ui: UITranslate): Record<InterceptAudit["execution_status"], string> => ({
  not_started: ui("screen.b697fe7de3b110"),
  not_executed: ui("screen.231fe220426532"),
  awaiting_result: ui("screen.acfbb4338de315"),
  succeeded: ui("screen.ae3fb35412112c"),
  failed: ui("screen.9344597efd4950"),
  unknown: ui("screen.5403a18bfa5503"),
});

function ReviewBackgroundBlock({ background }: { background?: InterceptReviewInput["background"] }) {
  const { ui } = useUITranslation();

  if (!background) return <p className="text-muted-foreground text-xs">{ui("screen.34fec66763f017")}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CodeBlock
        label={background.source === "user_message" ? ui("screen.a7998174c8da5d") : ui("screen.a068eac309a663")}
        text={background.text}
        truncated={background.truncated}
      />
      <p className="text-muted-foreground text-xs">
        {background.source === "user_message" ? ui("screen.ed50646c0a6922") : ui("screen.c8859f14639f0c")}
      </p>
    </div>
  );
}

function ScriptSnapshotSummary({ input }: { input: InterceptReviewInput }) {
  const { ui } = useUITranslation();

  const files = input.script_files ?? [];
  if (!files.length) return null;
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3"
      aria-label={ui("screen.caff0c789e6adf")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{ui("screen.8a3d39e68bbf9f")}</h3>
        <Badge variant={input.script_capture_status === "incomplete" ? "destructive" : "secondary"}>
          {input.script_capture_status === "incomplete" ? ui("screen.51568f879b3c20") : ui("screen.8e0e5b1ab8ef55")}
        </Badge>
      </div>
      {files.map((file) => (
        <ScriptFileSnapshot key={file.path} file={file} />
      ))}
      <p className="text-muted-foreground text-xs">{ui("screen.5722042ad8038c")}</p>
    </section>
  );
}

function ScriptFileSnapshot({ file }: { file: NonNullable<InterceptReviewInput["script_files"]>[number] }) {
  const { ui } = useUITranslation();

  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-visible">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <code className="break-all">{file.path}</code>
        {file.sha256 ? <span className="text-muted-foreground">SHA-256 {file.sha256.slice(0, 12)}…</span> : null}
        {file.bytes != null ? (
          <span className="text-muted-foreground">
            {file.bytes} {ui("screen.b1c5e73e1471e8")}
          </span>
        ) : null}
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
            {ui("screen.13578e526dec9f")}
          </Button>
          {open ? <CodeBlock label={ui("screen.bff9e003bc48a5")} text={file.content} /> : null}
        </>
      ) : null}
    </div>
  );
}

function ModelReviewContext({ input }: { input: InterceptReviewInput }) {
  const { ui } = useUITranslation();

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={ui("screen.f1850625c2c3ff")}>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">{ui("screen.f1850625c2c3ff")}</h3>
        <p className="text-muted-foreground text-xs">
          {ui("screen.5d9ffb627df38e")}
          {input.version < 4 ? ui("screen.2e6ff6b1b91650") : null}
        </p>
      </div>
      <CodeBlock
        label={ui("screen.7bb233f74685de")}
        text={JSON.stringify({ tool_name: input.tool_name, arguments: input.arguments }, null, 2)}
      />
      {input.version >= 2 ? (
        <ReviewBackgroundBlock background={input.background} />
      ) : (
        <>
          {input.turn_input ? (
            <CodeBlock
              label={ui("screen.7c57f327de339b")}
              text={input.turn_input}
              truncated={input.background_truncated}
            />
          ) : null}
          {input.task ? (
            <>
              <CodeBlock
                label={ui("screen.10ee6fb413ff2f")}
                text={input.task.description}
                truncated={input.task.truncated}
              />
              <CodeBlock label={ui("screen.f75096786bb29d")} text={input.task.goal} truncated={input.task.truncated} />
              <CodeBlock label={ui("screen.c1f8220cfdc4f5")} text={JSON.stringify(input.task.constraints, null, 2)} />
            </>
          ) : null}
          {input.worker_intent ? (
            <CodeBlock
              label={ui("screen.ebf9adefe71bfa")}
              text={input.worker_intent}
              truncated={input.background_truncated}
            />
          ) : null}
        </>
      )}
      {input.working_directory ? (
        <CodeBlock label={ui("screen.3db7b06b5f6de0")} text={input.working_directory} />
      ) : null}
      {input.script_files?.length ? (
        <section className="flex min-w-0 flex-col gap-4" aria-label={ui("screen.008778e27e2165")}>
          <div>
            <h3 className="font-medium text-sm">{ui("screen.008778e27e2165")}</h3>
            <p className="text-muted-foreground text-xs">{ui("screen.d63bc40ac7a1bd")}</p>
          </div>
          {input.script_files.map((file) => (
            <div
              key={`${file.path}:${file.source ?? ""}:${file.sha256 ?? file.read_error ?? ""}`}
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="break-all font-mono">{file.path}</span>
                {file.source ? (
                  <span className="text-muted-foreground">
                    {file.source === "command" ? ui("screen.3eea8dd1e99824") : ui("screen.9350d6a2c014d8")}
                  </span>
                ) : null}
                {file.sha256 ? <span className="text-muted-foreground">SHA-256 {file.sha256}</span> : null}
                {file.bytes != null ? (
                  <span className="text-muted-foreground">
                    {file.bytes} {ui("screen.b1c5e73e1471e8")}
                  </span>
                ) : null}
              </div>
              {file.content ? <CodeBlock label={ui("screen.35b4fca366d15e")} text={file.content} /> : null}
              {file.read_error ? (
                <Alert variant="destructive">
                  <AlertDescription>{file.read_error}</AlertDescription>
                </Alert>
              ) : null}
              {file.truncated ? <p className="text-muted-foreground text-xs">{ui("screen.4f31405bd3a3f4")}</p> : null}
            </div>
          ))}
          {input.script_capture_status === "incomplete" ? (
            <Alert variant="destructive">
              <AlertDescription>{ui("screen.68ece931e0809c")}</AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
      {input.version >= 3 ? (
        <p className="text-muted-foreground text-xs">{ui("screen.8bce0326213eb8")}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="font-medium text-muted-foreground text-xs">{ui("screen.6bc505f9020770")}</h4>
          {input.history?.length ? (
            input.history.map((entry) => (
              <div key={entry.tool_use_id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                <p className="break-words font-medium text-xs">
                  {entry.tool} ·{" "}
                  {entry.status === "succeeded" ? ui("screen.053461ce86d265") : ui("screen.12c133de12d3a7")}
                </p>
                <CodeBlock
                  label={ui("screen.a393ae0c721f8c")}
                  text={entry.arguments_preview}
                  truncated={entry.truncated}
                />
                <CodeBlock label={ui("screen.0ff6a161e750cc")} text={entry.result} truncated={entry.truncated} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">{ui("screen.513287f1afa50f")}</p>
          )}
          {input.history_truncated ? (
            <p className="text-muted-foreground text-xs">{ui("screen.674f64320031ec")}</p>
          ) : null}
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <ChevronDownIcon data-icon="inline-start" />
            {ui("screen.49a4ee15d78aa3")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <CodeBlock label={ui("screen.d0603bb189528a")} text={JSON.stringify(input, null, 2)} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

type Decide = (id: number, decision: "allowed" | "denied") => Promise<void>;

function DecisionActions({ row, busy, decide }: { row: InterceptApprovalRow; busy: boolean; decide: Decide }) {
  const { ui } = useUITranslation();

  if (row.status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void decide(row.id, "allowed")}>
        <CheckIcon data-icon="inline-start" />
        {ui("screen.ce7ef28b670ade")}
      </Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(row.id, "denied")}>
        <XIcon data-icon="inline-start" />
        {ui("screen.136de7a8c46fc8")}
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
  const { ui, liveUI } = useUITranslation();

  const [detail, setDetail] = React.useState<InterceptDetail | null>(null);
  const [error, setError] = React.useState("");
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
        setError("");
        if (next.status !== "pending") onResolved?.(next.status);
        if (next.status === "pending" || next.audit?.execution_status === "awaiting_result")
          timer = setTimeout(() => void load(), 5000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || liveUI("screen.19a7ca44a09a85"));
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [row.id, row.status, revision, retry, onResolved, liveUI]);

  // Row updates are authoritative until the lazy detail has caught up.
  const current = detail?.status === row.status ? detail : row;
  const audit = detail?.audit;
  let execution = audit ? executionLabels(ui)[audit.execution_status] : ui("screen.7450cc5b16e245");
  if (row.status === "pending") execution = ui("screen.b697fe7de3b110");
  if (audit && audit.correlation !== "exact" && audit.effective_action === "allow")
    execution = ui("screen.0c20f40c18c058");
  const command = typeof row.tool_input?.command === "string" ? row.tool_input.command : undefined;
  let initialLabel =
    source(row, ui) === "model"
      ? ui("screen.3e285ad28fd2d8")
      : source(row, ui) === "manual"
        ? ui("screen.0f99a349059ac0")
        : ui("screen.15731399c8bfea");
  if (audit?.model_fallback) initialLabel = ui("screen.89bc2e9f988b76");

  return (
    <SideQuestionWorkspace
      side={side}
      label={ui("screen.181835e9185efb", { v0: row.id, v1: row.tool_name })}
      composerLayout="stacked"
      placeholder={ui("screen.a2d68e35e248e7")}
      noSnapshotHint={ui("screen.8197d17084a3a9")}
      emptyDescription={ui("screen.80b1b3f5232e2e")}
      suggestions={[
        { label: ui("chatUI.approval.scriptPurpose"), question: "此脚本的作用是什么？" },
        { label: ui("chatUI.approval.scriptChanges"), question: "脚本会修改哪些文件或数据？" },
        { label: ui("chatUI.approval.decisionReason"), question: "为什么这次被放行或拦截？" },
        { label: ui("chatUI.approval.uncertainBehavior"), question: "脚本中有哪些未确定行为？" },
      ]}
      className={cn(side.open ? "min-h-[460px]" : "min-h-0")}
      mainClassName="overflow-visible"
    >
      <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-5">
        <div className="grid min-w-0 gap-5 rounded-xl border bg-muted/20 p-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-sm">{ui("screen.dd803ab17c0d64")}</span>
              <SideQuestionButton side={side} />
            </div>
            <CodeBlock
              label={ui("screen.429898ed70227b", { v0: agentLabel(current, ui) })}
              text={JSON.stringify(row.tool_input ?? {}, null, 2)}
            />
            {command ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDownIcon data-icon="inline-start" />
                    {ui("screen.c4f0e7320423c1")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <CodeBlock label={ui("screen.04bf2a9f2a472f")} text={command} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {ui("screen.17b31cc23654a9")}
              <span className="text-foreground">{detail ? execution : ui("screen.4927a53bcc886a")}</span>
            </p>
            {audit?.model_input ? <ScriptSnapshotSummary input={audit.model_input} /> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:pl-5">
            <h3 className="font-medium text-muted-foreground text-xs">
              {current.status === "pending" ? ui("screen.720f57aae33d93") : ui("screen.9e17e62ff60a69")}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={current.status} />
              <MatchCell row={current} showReason={false} />
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
              {current.reason?.replace(/^\[模型\]\s*/, "") || ui("screen.fb73cc98cf22dc")}
            </p>
            {audit?.decision_reason ? <p className="text-sm">{audit.decision_reason}</p> : null}
            {audit?.effective_action ? (
              <p className="text-sm">
                {ui("screen.5d65f7a3ec3d30")}
                {actionLabels(ui)[audit.effective_action]}
              </p>
            ) : null}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">{ui("screen.a488e93d69cc12")}</dt>
              <dd className="break-words">
                <ApprovalOrigin row={current} detail />
              </dd>
              <dt className="text-muted-foreground">{ui("screen.e9b5d944cc4b72")}</dt>
              <dd>{fmtTime(row.created_at, ui)}</dd>
              <dt className="text-muted-foreground">{ui("screen.c5be0c531aca6e")}</dt>
              <dd>{fmtTime(current.decided_at, ui)}</dd>
              {audit?.rule_name ? (
                <>
                  <dt className="text-muted-foreground">{ui("screen.45959434b24c1d")}</dt>
                  <dd>{audit.rule_name}</dd>
                </>
              ) : null}
              {audit?.profile_id ? (
                <>
                  <dt className="text-muted-foreground">{ui("screen.e4c46b9edf47f6")}</dt>
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
                <span>
                  {ui("screen.61291638aed6d7")}
                  {error}
                </span>
                <Button variant="outline" size="sm" onClick={() => setRetry((v) => v + 1)}>
                  {ui("screen.949121236ab917")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {!detail && !error ? <Skeleton className="h-8 w-60" /> : null}
        {detail && !audit ? (
          <Alert>
            <AlertDescription>{ui("screen.3a4be60688885a")}</AlertDescription>
          </Alert>
        ) : null}
        {audit ? (
          <Collapsible open={more} onOpenChange={setMore}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDownIcon data-icon="inline-start" className={cn(more && "rotate-180")} />
                {more ? ui("screen.b0d2627e2d69ad") : ui("screen.41d543e28ae99d")}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="flex min-w-0 flex-col gap-5">
                {audit.model_input ? (
                  <ModelReviewContext input={audit.model_input} />
                ) : (
                  <Alert>
                    <AlertDescription>
                      {audit.model_input_digest ? ui("screen.b1e0db3ba7308f") : ui("screen.93ee5c5d63f01b")}
                    </AlertDescription>
                  </Alert>
                )}
                {audit.user_message || audit.context?.length ? (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ChevronDownIcon data-icon="inline-start" />
                        {audit.model_input && audit.model_input.version >= 3
                          ? ui("screen.c18a2e1cd74e84")
                          : ui("screen.be26708cebeb77")}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="flex min-w-0 flex-col gap-3">
                        {audit.user_message ? (
                          <CodeBlock
                            label={ui("screen.95a1a25bdb8d0b")}
                            text={audit.user_message}
                            truncated={audit.user_truncated}
                          />
                        ) : null}
                        <section className="flex min-w-0 flex-col gap-3">
                          <h3 className="font-medium text-muted-foreground text-xs">{ui("screen.ac4d08c8b23de0")}</h3>
                          <p className="text-muted-foreground text-xs">
                            {ui("screen.b4986fc5162d6f")}
                            {fmtTime(audit.captured_at, ui)} {ui("screen.7a75968934cd29")}
                          </p>
                          {audit.context_truncated ? (
                            <p className="text-muted-foreground text-xs">{ui("screen.47c205defcbdbd")}</p>
                          ) : null}
                          {audit.context?.length ? (
                            audit.context.map((entry, index) => (
                              <CodeBlock
                                key={`${entry.kind}-${entry.tool_use_id || index}`}
                                label={`${contextLabels(ui)[entry.kind] ?? entry.kind}${entry.tool ? ` · ${entry.tool}` : ""}${entry.is_error ? ui("screen.28b1a6ee6940b4") : ""}`}
                                text={entry.text}
                                truncated={entry.truncated}
                              />
                            ))
                          ) : (
                            <p className="text-muted-foreground text-sm">{ui("screen.391a23903e178a")}</p>
                          )}
                        </section>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
                <CodeBlock
                  label={`${initialLabel}：${actionLabels(ui)[audit.initial_action] ?? audit.initial_action}`}
                  text={audit.initial_reason.replace(/^\[模型\]\s*/, "")}
                />
                <CodeBlock
                  label={ui("screen.185191e9e003e7")}
                  text={
                    audit.output ??
                    (audit.execution_status === "not_executed"
                      ? ui("screen.ba070e34242946")
                      : ui("screen.78e40d6f07b937"))
                  }
                  truncated={audit.output_truncated}
                />
                {audit.correlation !== "exact" ? (
                  <Alert>
                    <AlertDescription>
                      {audit.correlation === "ambiguous" ? ui("screen.1d24b2c7a740d8") : ui("screen.1726c7ff05712e")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <dl className="grid gap-2 text-muted-foreground text-xs [overflow-wrap:anywhere]">
                  <div>
                    {ui("screen.bb711c49c28166")}
                    {audit.tool_use_id || ui("screen.7450cc5b16e245")}
                  </div>
                  <div>
                    {ui("screen.be389dfbe3fa68")}
                    {audit.input_digest}
                  </div>
                  <div>
                    {ui("screen.dca3524c282048")}
                    {audit.config_digest || ui("screen.7450cc5b16e245")}
                  </div>
                  {audit.model_input_digest ? (
                    <div>
                      {ui("screen.e452aea446b4c3")}
                      {audit.model_input_digest}
                    </div>
                  ) : null}
                  {audit.execution_ended_at ? (
                    <div>
                      {ui("screen.624bddb71bbda9")}
                      {fmtTime(audit.execution_ended_at, ui)}
                    </div>
                  ) : null}
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
  const { ui } = useUITranslation();

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
            <span className="sr-only">{ui("screen.4bf0fb2140bae8")}</span>
          </TableHead>
          <TableHead className="hidden w-14 sm:table-cell">#</TableHead>
          <TableHead className="w-28">{ui("screen.5ca6730d441522")}</TableHead>
          <TableHead className="hidden md:table-cell">{ui("screen.a488e93d69cc12")}</TableHead>
          <TableHead className="hidden lg:table-cell">{ui("screen.fcaf67982b20e2")}</TableHead>
          <TableHead className="hidden xl:table-cell">{ui("screen.9634fb0832be62")}</TableHead>
          <TableHead className="w-24">{ui("screen.6320b4a8722a85")}</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">{ui("screen.e9b5d944cc4b72")}</TableHead>
          <TableHead className="hidden w-36 xl:table-cell">{ui("screen.c5be0c531aca6e")}</TableHead>
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
                    aria-label={ui("screen.182ed83ea31db4", {
                      v0: open ? ui("screen.afd4b783536b82") : ui("screen.00bd3960fea8ea"),
                      v1: row.id,
                    })}
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
                    <span className="truncate" title={originLabel(row, ui)}>
                      <ApprovalOrigin row={row} />
                    </span>
                    <span className="truncate text-muted-foreground text-xs" title={agentLabel(row, ui)}>
                      {ui("punctuation.ece2891a25")}
                      {agentLabel(row, ui)}
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
                  {fmtTime(row.created_at, ui)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs xl:table-cell">
                  {fmtTime(row.decided_at, ui)}
                </TableCell>
              </TableRow>
              {open ? (
                <TableRow className="hover:bg-transparent has-aria-expanded:bg-transparent">
                  <TableCell colSpan={columns} className="whitespace-normal p-0">
                    <section id={panelID} aria-label={ui("screen.9ae312531e172a", { v0: row.id })}>
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
  const { ui, liveUI } = useUITranslation();

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
  const [error, setError] = React.useState("");
  const [pendingError, setPendingError] = React.useState("");
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
          setError("");
        } else {
          setError((history.reason as Error).message || liveUI("screen.d1d044826a45ef"));
        }
        if (pending.status === "fulfilled") {
          setPendingRows(pending.value);
          setPendingError("");
        } else {
          setPendingError((pending.reason as Error).message || liveUI("screen.d1d044826a45ef"));
        }
        if (manual) setRevision((v) => v + 1);
      } catch (e) {
        if (id === request.current) setError((e as Error).message || liveUI("screen.d1d044826a45ef"));
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [taskId, page, pageSize, filter, liveUI],
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
    setError("");
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
      setError("");
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
      toast.success(decision === "allowed" ? ui("screen.c90e80972b10bf") : ui("screen.846e5cf371bfdc"));
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
      rule_name: row.rule_id ? ui("screen.8562e879652223", { v0: row.rule_id }) : "",
      ...historyById.get(row.id),
      ...row,
    }));
  const title = taskId ? ui("screen.b4c245b6421a35") : ui("screen.b75d0f43cd1eb7");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardListIcon className="size-5 text-muted-foreground" />
          <h1 className="font-semibold text-xl">{title}</h1>
          {pending.length ? (
            <Badge variant="secondary">
              {pending.length} {ui("screen.dcb49342a5e5fb")}
            </Badge>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          {ui("screen.aee88743413144")}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{ui("screen.99a80f89fba868")}</p>
      <FieldGroup className="flex-row flex-wrap items-end gap-3" aria-label={ui("screen.4bc61b64d0c5ca")}>
        <Field className="w-full sm:min-w-80 sm:flex-1">
          <FieldLabel htmlFor={`${filterID}-search`}>{ui("screen.3f025832c5bc06")}</FieldLabel>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${filterID}-search`}
                className="pl-8"
                value={searchText}
                maxLength={200}
                placeholder={ui("screen.07f14d84dbfac0")}
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
              {ui("screen.44ce7ae909bbb2")}
            </Button>
          </div>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>{ui("screen.22aaa59dda96fb")}</FieldLabel>
          <DateSelect
            value={fromDate}
            onValueChange={(value) => changeDate("from", value)}
            optional
            placeholder={ui("screen.c25ee7fd0c3498")}
            aria-label={ui("screen.22aaa59dda96fb")}
          />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>{ui("screen.872bf1a9ad3745")}</FieldLabel>
          <DateSelect
            value={toDate}
            onValueChange={(value) => changeDate("to", value)}
            optional
            placeholder={ui("screen.97b4df10480574")}
            aria-label={ui("screen.872bf1a9ad3745")}
          />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-status`}>{ui("screen.5d9f1d27b14c8a")}</FieldLabel>
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
                <SelectItem value="all">{ui("screen.0a379c1e7398fb")}</SelectItem>
                <SelectItem value="denied">{ui("screen.f098218a3032a6")}</SelectItem>
                <SelectItem value="pending">{ui("screen.dcb49342a5e5fb")}</SelectItem>
                <SelectItem value="allowed">{ui("screen.75d889ac43a261")}</SelectItem>
                <SelectItem value="timeout">{ui("screen.73ce15fee42ed3")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-source`}>{ui("screen.3d7f1b6c6cb3b7")}</FieldLabel>
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
                <SelectItem value="all">{ui("screen.9f357adb6100fa")}</SelectItem>
                <SelectItem value="model">{ui("screen.80ae6d5293d6d8")}</SelectItem>
                <SelectItem value="rule">{ui("screen.1275aca24e0a9b")}</SelectItem>
                <SelectItem value="manual">{ui("screen.0f99a349059ac0")}</SelectItem>
                <SelectItem value="unknown">{ui("screen.e8a1b23e38cdcb")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => changeFilter({})}>
            {ui("screen.657d9cbf45ec9e")}
          </Button>
        ) : null}
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {ui("screen.32fab96dcfaf1b")}
            {error}
            {ui("screen.49248c0ab5297c")}
          </AlertDescription>
        </Alert>
      ) : null}
      {pendingError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {ui("screen.bfe27675d200d4")}
            {pendingError}
            {ui("screen.49248c0ab5297c")}
          </AlertDescription>
        </Alert>
      ) : null}
      {pending.length ? (
        <section className="rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 font-medium text-sm">
            <ShieldAlertIcon className="size-4" />
            {ui("screen.cd8ab9e97af96c")}
            {pending.length}
            {ui("punctuation.f2e44c6c95")}
            <span className="text-muted-foreground text-xs">{ui("screen.7d36855d81f15d")}</span>
          </div>
          <ApprovalTable
            rows={pending}
            busy={deciding}
            decide={decide}
            revision={revision}
            label={ui("screen.ed81cc379d24d7")}
          />
        </section>
      ) : null}
      <section className="rounded-xl border">
        <div className="border-b px-4 py-3 font-medium text-sm">
          {filtered ? ui("screen.479424539ce56d") : ui("screen.e4257920848098")}
          {ui("punctuation.da047c04c9")}
          {total}
          {ui("punctuation.f2e44c6c95")}
          {filter.q ? (
            <span className="ml-2 break-all font-normal text-muted-foreground text-xs">
              {ui("screen.1a122e99038917")}
              {filter.q}
            </span>
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
              <EmptyTitle>{filtered ? ui("screen.341650c0aa69e2") : ui("screen.e0a34c79ee2462")}</EmptyTitle>
              <EmptyDescription>
                {filtered ? ui("screen.7829e7febe1ae4") : ui("screen.c0f62ba93415c1")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {rows.length ? (
          <ApprovalTable
            rows={rows}
            busy={deciding}
            decide={decide}
            revision={revision}
            label={ui("screen.95ac936ed79e1f")}
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
