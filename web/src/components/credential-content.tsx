"use client";

import * as React from "react";

import { ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, NetworkIcon } from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { toneClasses } from "@/lib/status";
import type { CredentialAccount, CredentialTraffic, CredentialTrafficDetail, TaskIntelligence } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

export function intelligencePreview(text: string, limit = 260) {
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : text;
}
const FIELDS = [
  ["username", "账号", "blue"],
  ["password", "密码", "violet"],
  ["token", "Token / API Key", "violet"],
  ["cookie", "Cookie", "amber"],
] as const;
function HighlightedOriginal({ text, accounts }: { text: string; accounts: CredentialAccount[] }) {
  const parts = React.useMemo(() => {
    const values = [
      ...new Set(accounts.flatMap((a) => [a.username, a.password, a.token, a.cookie]).filter((v): v is string => !!v)),
    ]
      .sort((a, b) => b.length - a.length)
      .slice(0, 200);
    if (!values.length) return [text];
    const re = new RegExp(`(${values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re);
  }, [text, accounts]);
  return (
    <pre className="whitespace-pre-wrap break-all font-mono text-xs">
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={`${i}-${part}`} className="rounded bg-primary/15 px-0.5 text-primary">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </pre>
  );
}
function TrafficList({
  traffic,
  detail,
  onTraffic,
  onDetails,
}: {
  traffic: CredentialTraffic[];
  detail: boolean;
  onTraffic?: (id: string) => void;
  onDetails?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const limit = detail ? 3 : 2;
  const visible = detail && expanded ? traffic : traffic.slice(0, limit);
  const remaining = traffic.length - limit;
  return (
    <section aria-label="关联流量" className="min-w-0 space-y-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <NetworkIcon className="size-3.5 text-muted-foreground" />
        关联流量
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{traffic.length} 条</span>
      </div>
      <div className={cn("space-y-1.5", detail && expanded && "max-h-80 overflow-y-auto pr-1")}>
        {visible.map((ref) => {
          let host = "",
            path = ref.url;
          try {
            const url = new URL(ref.url);
            host = url.host;
            path = `${url.pathname}${url.search}${url.hash}`;
          } catch {
            // Retain non-URL references as plain text.
          }
          const tone =
            ref.status >= 500
              ? "red"
              : ref.status >= 400
                ? "amber"
                : ref.status >= 300
                  ? "blue"
                  : ref.status >= 200
                    ? "green"
                    : "neutral";
          return (
            <button
              key={ref.id}
              type="button"
              title={ref.url}
              aria-label={`查看流量 ${ref.method} ${ref.url}，编号 ${ref.id}`}
              onClick={() => onTraffic?.(ref.id)}
              className="group flex w-full min-w-0 flex-col gap-1.5 rounded-md border bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                  {ref.method || "HTTP"}
                </Badge>
                {ref.status > 0 ? (
                  <Badge variant="outline" className={cn("shrink-0 font-mono text-[10px]", toneClasses[tone])}>
                    {ref.status}
                  </Badge>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{host || "流量记录"}</span>
                <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              </span>
              <span className="block w-full truncate font-mono text-xs">{path}</span>
              <span className="text-[11px] text-muted-foreground">
                {ref.side === "request" ? "请求中使用" : "响应中发现"}
              </span>
            </button>
          );
        })}
      </div>
      {remaining > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs text-muted-foreground"
          aria-expanded={detail ? expanded : undefined}
          onClick={detail ? () => setExpanded(!expanded) : onDetails}
        >
          {detail ? (expanded ? "收起流量" : `展开其余 ${remaining} 条流量`) : `还有 ${remaining} 条流量，查看详情`}
          {detail ? expanded ? <ChevronUpIcon /> : <ChevronDownIcon /> : <ArrowUpRightIcon />}
        </Button>
      ) : null}
    </section>
  );
}
export function CredentialContent({
  item,
  detail = false,
  enabled = false,
  onTraffic,
  onDetails,
}: {
  item: TaskIntelligence;
  detail?: boolean;
  enabled?: boolean;
  onTraffic?: (id: string) => void;
  onDetails?: () => void;
}) {
  const analysis = item.kind === "credential" ? item.credentials : undefined;
  const accounts = analysis?.accounts ?? [];
  const ready = accounts.length > 0;
  const visibleAccounts = detail ? accounts : accounts.slice(0, 2);
  const fieldsTruncated =
    !detail &&
    visibleAccounts.some((a) =>
      [a.username, a.password, a.token, a.cookie, a.endpoint, a.label, a.protocol].some(
        (v) => v && Array.from(v).length > 80,
      ),
    );
  let pretty = item.content;
  try {
    pretty = JSON.stringify(JSON.parse(item.content), null, 2);
  } catch {
    // Plain-text reports keep their original representation.
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {analysis && analysis.state !== "error" ? (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Badge variant="outline">
            {analysis.state === "processing"
              ? "正在整理"
              : analysis.state === "queued"
                ? "等待整理"
                : analysis.method === "rules"
                  ? "规则整理"
                  : "Agent 整理"}
          </Badge>
          {analysis.method === "rules" ? <span>未调用模型</span> : null}
          {detail && analysis.model ? (
            <span>
              {analysis.model} ·{" "}
              {analysis.input_tokens + analysis.output_tokens > 0
                ? `输入 ${analysis.input_tokens} / 输出 ${analysis.output_tokens} Token`
                : "模型未返回 Token 用量"}
            </span>
          ) : null}
        </div>
      ) : !analysis && enabled && item.kind === "credential" ? (
        <span className="text-xs text-muted-foreground">等待凭据整理</span>
      ) : null}
      {ready ? (
        <section
          className={cn("flex min-w-0 flex-col gap-2 overflow-y-auto", detail ? "max-h-96" : "max-h-80")}
          aria-label="结构化凭据"
        >
          {visibleAccounts.map((account, index) => (
            <div
              key={`${index}-${account.username ?? account.token ?? account.cookie}`}
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-2"
            >
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                <span>凭据 {index + 1}</span>
                {account.label ? (
                  <span>· {detail ? account.label : intelligencePreview(account.label, 80)}</span>
                ) : null}
                {account.protocol ? (
                  <Badge variant="outline" className="max-w-full whitespace-normal break-all">
                    {detail ? account.protocol : intelligencePreview(account.protocol, 80)}
                  </Badge>
                ) : null}
              </div>
              {account.endpoint ? (
                <span className="break-all text-xs text-muted-foreground">
                  {detail ? account.endpoint : intelligencePreview(account.endpoint, 80)}
                </span>
              ) : null}
              <dl className="flex min-w-0 flex-col gap-1.5">
                {FIELDS.map(([field, label, tone]) =>
                  account[field] ? (
                    <div key={field} className="flex min-w-0 items-start gap-2">
                      <dt className="min-w-10 shrink-0 pt-1 text-xs text-muted-foreground">{label}</dt>
                      <dd className="flex min-w-0 flex-1 items-start gap-1">
                        <code
                          data-credential-field={field}
                          className={cn(
                            "min-w-0 flex-1 whitespace-pre-wrap break-all rounded border px-1.5 py-1 font-mono text-xs",
                            toneClasses[tone],
                          )}
                        >
                          {detail ? account[field] : intelligencePreview(account[field] ?? "", 80)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`复制${label} ${index + 1}`}
                          onClick={async () => {
                            if (await copyText(account[field] ?? "")) toast.success(`${label}已复制`);
                            else toast.error("复制失败，请手动选择内容复制");
                          }}
                        >
                          <CopyIcon />
                        </Button>
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          ))}
        </section>
      ) : null}
      {!detail && ready && (accounts.length > 2 || fieldsTruncated) ? (
        <Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={onDetails}>
          {accounts.length > 2 ? `还有 ${accounts.length - 2} 组凭据，查看详情` : "查看完整凭据"}
        </Button>
      ) : null}
      {ready && analysis?.note ? <p className="text-xs text-muted-foreground">{analysis.note}</p> : null}
      {analysis?.traffic?.length ? (
        <TrafficList
          key={item.id}
          traffic={analysis.traffic}
          detail={detail}
          onTraffic={onTraffic}
          onDetails={onDetails}
        />
      ) : null}
      {detail && analysis?.traffic_note ? (
        <p className="text-xs text-muted-foreground">{analysis.traffic_note}</p>
      ) : null}
      {!ready || detail ? (
        <div className={cn(detail ? "max-h-72 overflow-auto rounded-lg bg-muted p-3" : "")}>
          {ready ? <p className="mb-2 text-xs text-muted-foreground">原始上报内容</p> : null}
          <HighlightedOriginal text={detail ? pretty : intelligencePreview(pretty)} accounts={accounts} />
          {!detail && Array.from(pretty).length > 260 ? (
            <Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={onDetails}>
              查看完整内容
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CredentialTrafficViewer({
  scope,
  scopeId,
  item,
  trafficId,
  onClose,
}: {
  scope: "tasks" | "assets";
  scopeId: string;
  item: TaskIntelligence | null;
  trafficId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<CredentialTrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!item || !trafficId) return;
    let alive = true;
    setData(null);
    setError("");
    api
      .credentialTraffic(scope, scopeId, item.id, trafficId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [scope, scopeId, item, trafficId]);
  return (
    <Dialog
      open={!!trafficId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>凭据关联流量</DialogTitle>
          <DialogDescription className="break-all">{data?.reference.url ?? "读取已绑定的真实流量"}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : data ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {data.reference.method} · HTTP {data.reference.status} ·{" "}
              {data.reference.side === "request" ? "请求包含匹配凭据" : "响应包含匹配凭据"}，不代表认证验证成功。
            </p>
            <p className="text-sm">绑定时保存的匹配片段</p>
            <HttpCodeBlock raw={data.reference.excerpt} />
            {data.unavailable ? (
              <Alert>
                <AlertDescription>原始流量已删除或不可用，仍可查看上方保存的匹配片段。</AlertDescription>
              </Alert>
            ) : (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-1 px-1 text-sm font-medium">请求 Request</p>
                  <HttpCodeBlock raw={data.req ?? ""} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 px-1 text-sm font-medium">响应 Response</p>
                  <HttpCodeBlock raw={data.resp ?? ""} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <Skeleton className="h-40" />
        )}
      </DialogContent>
    </Dialog>
  );
}
