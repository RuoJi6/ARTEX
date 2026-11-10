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
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { toneClasses } from "@/lib/status";
import type { CredentialAccount, CredentialTraffic, CredentialTrafficDetail, TaskIntelligence } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

export function intelligencePreview(text: string, limit = 260) {
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : text;
}
const FIELDS = (ui: UITranslate) =>
  [
    ["username", ui("screen.311bb313fdeca6"), "blue"],
    ["password", ui("screen.a621ab606db2a1"), "violet"],
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
  const { ui } = useUITranslation();

  const [expanded, setExpanded] = React.useState(false);
  const limit = detail ? 3 : 2;
  const visible = detail && expanded ? traffic : traffic.slice(0, limit);
  const remaining = traffic.length - limit;
  return (
    <section aria-label={ui("screen.a7c31507efd1ff")} className="min-w-0 space-y-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <NetworkIcon className="size-3.5 text-muted-foreground" />
        {ui("screen.a7c31507efd1ff")}
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
          {traffic.length} {ui("screen.f004f1d84cf962")}
        </span>
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
              aria-label={ui("screen.e1cd10d1465b7c", { v0: ref.method, v1: ref.url, v2: ref.id })}
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
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {host || ui("screen.e80f2d3ce1407c")}
                </span>
                <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              </span>
              <span className="block w-full truncate font-mono text-xs">{path}</span>
              <span className="text-[11px] text-muted-foreground">
                {ref.side === "request" ? ui("screen.fe49ba81fc57f6") : ui("screen.fb1585ebbdc6f5")}
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
          {detail
            ? expanded
              ? ui("screen.24b461df9b98d6")
              : ui("screen.026cd703b7e225", { v0: remaining })
            : ui("screen.1ac43d49c3f598", { v0: remaining })}
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
  const { ui } = useUITranslation();

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
              ? ui("screen.c0acb1fec02d65")
              : analysis.state === "queued"
                ? ui("screen.2f4ffa1772433f")
                : analysis.method === "rules"
                  ? ui("screen.83dfc626a28538")
                  : ui("screen.6b1639bd2e2a75")}
          </Badge>
          {analysis.method === "rules" ? <span>{ui("screen.ae0ea3709f865c")}</span> : null}
          {detail && analysis.model ? (
            <span>
              {analysis.model} ·{" "}
              {analysis.input_tokens + analysis.output_tokens > 0
                ? ui("screen.25a981b6b7b3fd", { v0: analysis.input_tokens, v1: analysis.output_tokens })
                : ui("screen.32eb03b312b367")}
            </span>
          ) : null}
        </div>
      ) : !analysis && enabled && item.kind === "credential" ? (
        <span className="text-xs text-muted-foreground">{ui("screen.c6e91ed39fe4b4")}</span>
      ) : null}
      {ready ? (
        <section
          className={cn("flex min-w-0 flex-col gap-2 overflow-y-auto", detail ? "max-h-96" : "max-h-80")}
          aria-label={ui("screen.648426c80dfc7e")}
        >
          {visibleAccounts.map((account, index) => (
            <div
              key={`${index}-${account.username ?? account.token ?? account.cookie}`}
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-2"
            >
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                <span>
                  {ui("screen.2dfe17d754ddf9")}
                  {index + 1}
                </span>
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
                {FIELDS(ui).map(([field, label, tone]) =>
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
                          aria-label={ui("screen.4aa3ca88382326", { v0: label, v1: index + 1 })}
                          onClick={async () => {
                            if (await copyText(account[field] ?? ""))
                              toast.success(ui("screen.ee2d4912273b3b", { v0: label }));
                            else toast.error(ui("screen.3889e92517c51b"));
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
          {accounts.length > 2 ? ui("screen.764305c10336a6", { v0: accounts.length - 2 }) : ui("screen.86407274fb3e60")}
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
          {ready ? <p className="mb-2 text-xs text-muted-foreground">{ui("screen.3bacc7acdcb867")}</p> : null}
          <HighlightedOriginal text={detail ? pretty : intelligencePreview(pretty)} accounts={accounts} />
          {!detail && Array.from(pretty).length > 260 ? (
            <Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={onDetails}>
              {ui("screen.a41eb6b5a23856")}
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
  const { ui } = useUITranslation();

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
          <DialogTitle>{ui("screen.a22a052d4aec7c")}</DialogTitle>
          <DialogDescription className="break-all">
            {data?.reference.url ?? ui("screen.cb7fd4f8d6a1b0")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : data ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {data.reference.method} · HTTP {data.reference.status} ·{" "}
              {data.reference.side === "request" ? ui("screen.87b750f384a2dd") : ui("screen.132c4e0dabc3e0")}
              {ui("screen.97682b00edfbc8")}
            </p>
            <p className="text-sm">{ui("screen.3f71ab3f6361b0")}</p>
            <HttpCodeBlock raw={data.reference.excerpt} />
            {data.unavailable ? (
              <Alert>
                <AlertDescription>{ui("screen.f245f49ba23c3f")}</AlertDescription>
              </Alert>
            ) : (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-1 px-1 text-sm font-medium">{ui("screen.719dd828ca88c8")}</p>
                  <HttpCodeBlock raw={data.req ?? ""} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 px-1 text-sm font-medium">{ui("screen.946902266aa212")}</p>
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
