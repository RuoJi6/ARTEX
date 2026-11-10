"use client";
import * as React from "react";

import Link from "next/link";

import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CredentialContent, CredentialTrafficViewer, intelligencePreview } from "@/components/credential-content";
import { StatusBadge, ToneDot } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { localizedError } from "@/i18n/errors";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { statusMeta } from "@/lib/status";
import type { IntelligenceKind, IntelligencePage, TaskIntelligence } from "@/lib/types";
import { copyText } from "@/lib/utils";

const KINDS = (ui: UITranslate): { value: IntelligenceKind; label: string }[] => [
  { value: "credential", label: ui("screen.2dfe17d754ddf9") },
  { value: "lead", label: ui("screen.db9b07c21252fb") },
  { value: "sensitive_data", label: ui("screen.9839bf384d517c") },
];
const STATUS = (ui: UITranslate): Record<IntelligenceKind, Record<string, string>> => ({
  credential: {
    unverified: ui("screen.555ee27e0ac34f"),
    verified: ui("screen.0a1b6f1b57f519"),
    invalid: ui("screen.2fe5a8d0eee9f1"),
  },
  lead: {
    pending: ui("screen.75da31470d2f9d"),
    in_progress: ui("screen.3bb1a69df10c78"),
    dismissed: ui("screen.c6f3c8b82c2491"),
    converted: ui("screen.4846c46d98802a"),
  },
  sensitive_data: {
    suspected: ui("screen.f81286d3cf0a66"),
    confirmed: ui("screen.d56a511f498f7e"),
    dismissed: ui("screen.c6f3c8b82c2491"),
  },
});
function time(value: string, ui: UITranslate) {
  return new Date(value).toLocaleString(ui("screen.91610255157661"));
}

function conversationHref(item: TaskIntelligence) {
  return `/function/tasks/detail?id=${item.task_id}&tab=sessions${item.source_session ? `&session=${encodeURIComponent(item.source_session)}` : ""}`;
}

function AssetLinks({ ids, onNavigate }: { ids: number[]; onNavigate?: () => void }) {
  const { ui } = useUITranslation();

  return ids.length ? (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {ids.map((id) => (
        <Link
          key={id}
          href={`/function/assets?asset=${id}`}
          onClick={onNavigate}
          className="underline underline-offset-2"
          aria-label={ui("screen.8b0c30275a36e5", { v0: id })}
        >
          #{id}
        </Link>
      ))}
    </span>
  ) : (
    <>{ui("screen.6b75a35393124b")}</>
  );
}

export function IntelligencePanel({
  scope,
  scopeId,
  onNavigate,
}: {
  scope: "tasks" | "assets";
  scopeId: string;
  onNavigate?: () => void;
}) {
  const { ui } = useUITranslation();

  const { t } = useTranslation();
  const [kind, setKind] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [data, setData] = React.useState<IntelligencePage | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const [selected, setSelected] = React.useState<TaskIntelligence | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [trafficTarget, setTrafficTarget] = React.useState<{ item: TaskIntelligence; id: string } | null>(null);
  React.useEffect(() => {
    if (data)
      setSelected((current) => (current ? (data.items.find((item) => item.id === current.id) ?? current) : null));
  }, [data]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly reloads this resource after a user action.
  React.useEffect(() => {
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const params = new URLSearchParams({ limit: "25", offset: String(page * 25) });
        if (kind !== "all") params.set("kind", kind);
        if (status !== "all") params.set("status", status);
        if (query) params.set("q", query);
        const result = await api.intelligence(scope, scopeId, params);
        if (alive) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e as Error);
      } finally {
        busy = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [scope, scopeId, kind, status, query, page, refresh]);
  const open = (item: TaskIntelligence) => setSelected(item);
  const close = () => setSelected(null);
  const navigate = () => {
    close();
    onNavigate?.();
  };
  const update = async (value: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.updateIntelligence(selected.task_id, selected.id, value);
      setSelected((item) => (item ? { ...item, status: value } : null));
      setRefresh((n) => n + 1);
      toast.success(ui("screen.bc476037600d1b"));
    } catch (e) {
      toast.error(ui("screen.4f2e8a8d4cb328") + localizedError(e, t));
    } finally {
      setSaving(false);
    }
  };
  const statusOptions = kind === "all" ? {} : STATUS(ui)[kind as IntelligenceKind];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data && !data.enabled && scope === "tasks" ? (
        <Alert>
          <AlertTitle>{ui("screen.716b48e64c796a")}</AlertTitle>
          <AlertDescription>
            {ui("screen.69c6f9dd599db6")}{" "}
            <Link href="/system/settings" className="underline">
              {ui("screen.68ea5dd4d7af20")}
            </Link>{" "}
            {ui("screen.07ed4e299cb9cd")}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{scope === "tasks" ? ui("screen.bfaee3ed1f063c") : ui("screen.532bd2d2b50a4d")}</CardTitle>
          <CardDescription>
            {scope === "tasks" ? ui("screen.b3e2ebefaa0c50") : ui("screen.40ca5cfc15060e")}{" "}
            {ui("screen.b3f42ca140cc91")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <Tabs
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setStatus("all");
              setPage(0);
            }}
          >
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="all">
                {ui("screen.5c55a67935af8f")}
                {data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : ""}
              </TabsTrigger>
              {KINDS(ui).map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  <ToneDot tone={statusMeta("intelligence", item.value, t).tone} />
                  {item.label} {data?.counts[item.value] ?? 0}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={ui("screen.05875408bc4e06")}
              placeholder={ui("screen.e4295ec58bc3c7")}
              value={search}
              maxLength={200}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-40 flex-1"
            />
            {kind !== "all" ? (
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(0);
                }}
              >
                <SelectTrigger aria-label={ui("screen.46a5a87a753cb8")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{ui("screen.0a379c1e7398fb")}</SelectItem>
                    {Object.entries(statusOptions).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>
              <RefreshCwIcon data-icon="inline-start" />
              {ui("screen.aee88743413144")}
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{ui("screen.5d405d1f4eff39")}</AlertTitle>
              <AlertDescription>{localizedError(error, t)}</AlertDescription>
            </Alert>
          ) : null}
          {!data && !error ? (
            <Skeleton className="h-40 w-full" />
          ) : data?.items.length ? (
            <Table className="min-w-[68rem] table-fixed">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[35%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[6%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{ui("screen.1d993bee31ed0b")}</TableHead>
                  <TableHead>{ui("screen.52541bcf47e2be")}</TableHead>
                  <TableHead>{ui("screen.6320b4a8722a85")}</TableHead>
                  <TableHead>{ui("screen.6bf6d3f3d6261b")}</TableHead>
                  <TableHead>{ui("screen.5f45bb826b168f")}</TableHead>
                  <TableHead>{ui("screen.8e2a2e97e23d2a")}</TableHead>
                  <TableHead>{ui("screen.ed31fbb483ee1b")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <StatusBadge domain="intelligence" value={item.kind} />
                        <span className="max-w-full [overflow-wrap:anywhere]">{item.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex min-w-0 flex-col gap-2">
                        <CredentialContent
                          item={item}
                          enabled={data.credential_agent_enabled}
                          onDetails={() => open(item)}
                          onTraffic={(id) => setTrafficTarget({ item, id })}
                        />
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          <span>{ui("screen.c1ef66481c9004")}</span>
                          <p className="whitespace-pre-wrap break-all">{intelligencePreview(item.evidence, 220)}</p>
                          {Array.from(item.evidence).length > 220 ? (
                            <button type="button" className="text-left underline" onClick={() => open(item)}>
                              {ui("screen.51b8809cfaa069")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline">{STATUS(ui)[item.kind]?.[item.status] ?? item.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.confidence === "observed" ? ui("screen.96159c750bd67e") : ui("screen.aa1259dcc001cc")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col gap-1">
                        <Link href={conversationHref(item)} onClick={navigate} className="underline">
                          {item.source_session ? ui("screen.0ca06fc30628b1") : ui("screen.a43578959a4c12")}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {ui("screen.e5b1cc0dc459e5")}
                          {item.task_id} · {item.worker || "Agent"}
                          {item.node_id ? ui("screen.ffd66d0f33a967", { v0: item.node_id }) : ""}
                        </span>
                        {item.inherited ? <Badge variant="outline">{ui("screen.44630dd91821d1")}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <AssetLinks ids={item.asset_ids} onNavigate={navigate} />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal text-xs">{time(item.created_at, ui)}</TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <Button size="sm" variant="outline" onClick={() => open(item)}>
                        {ui("screen.979a332955c855")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : data ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{ui("screen.f05fe8b62ff1f5")}</EmptyTitle>
                <EmptyDescription>
                  {query || kind !== "all" || status !== "all"
                    ? ui("screen.13062dbaa48b90")
                    : data.enabled
                      ? ui("screen.6bcd04860e0644")
                      : ui("screen.392b81a8a56edc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {ui("screen.76e547a8fa5463")}
            {data?.total ?? 0} {ui("screen.a2792a889b0ce9")}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
              {ui("screen.c9b9ae7a61444a")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || (page + 1) * 25 >= data.total}
              onClick={() => setPage((n) => n + 1)}
            >
              {ui("screen.8a8542f6964852")}
            </Button>
          </div>
        </CardFooter>
      </Card>
      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? ui("screen.7057d77bf96878")}</DialogTitle>
            <DialogDescription>{ui("screen.ab3470fa286145")}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge domain="intelligence" value={selected.kind} />
                <Badge variant="outline">
                  {selected.confidence === "observed" ? ui("screen.96159c750bd67e") : ui("screen.aa1259dcc001cc")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {ui("screen.e5b1cc0dc459e5")}
                  {selected.task_id}
                  {selected.node_id ? ui("screen.471ff42139451b", { v0: selected.node_id }) : ""} ·{" "}
                  {selected.worker || "Agent"}
                </span>
              </div>
              {scope === "tasks" && !selected.inherited ? (
                <Select value={selected.status} disabled={saving} onValueChange={(value) => void update(value)}>
                  <SelectTrigger aria-label={ui("screen.8762ff29949cd7")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(STATUS(ui)[selected.kind] ?? {}).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {STATUS(ui)[selected.kind]?.[selected.status] ?? selected.status} {ui("screen.33d3109c8c0f85")}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{ui("screen.7a688306423bec")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await copyText(selected.content)) toast.success(ui("screen.8f6f8d979c981c"));
                    else toast.error(ui("screen.3889e92517c51b"));
                  }}
                >
                  <CopyIcon data-icon="inline-start" />
                  {ui("screen.63d90d977348ab")}
                </Button>
              </div>
              <CredentialContent
                item={selected}
                detail
                enabled={data?.credential_agent_enabled}
                onTraffic={(id) => setTrafficTarget({ item: selected, id })}
              />
              {selected.kind === "credential" && !selected.inherited && data?.credential_agent_enabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    retrying || selected.credentials?.state === "processing" || selected.credentials?.state === "queued"
                  }
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      await api.retryCredentials(selected.task_id, selected.id);
                      setRefresh((n) => n + 1);
                      toast.success(ui("screen.c2397476f0d8c7"));
                    } catch (e) {
                      toast.error(localizedError(e, t));
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {ui("screen.dce0ca588989fe")}
                </Button>
              ) : null}
              <p className="text-sm">{ui("screen.c1ef66481c9004")}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                {selected.evidence}
              </pre>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>
                  {ui("screen.13a873aee6bb65")}
                  <AssetLinks ids={selected.asset_ids} onNavigate={navigate} />
                </span>
                <span>
                  {ui("screen.6b9e2700d43205")}
                  {time(selected.created_at, ui)}
                </span>
              </div>
              <Link href={conversationHref(selected)} onClick={navigate} className="text-sm underline">
                {selected.source_session ? ui("screen.b9879568404181") : ui("screen.f9b00e44eb4e57")}
              </Link>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <CredentialTrafficViewer
        scope={scope}
        scopeId={scopeId}
        item={trafficTarget?.item ?? null}
        trafficId={trafficTarget?.id ?? null}
        onClose={() => setTrafficTarget(null)}
      />
    </div>
  );
}
