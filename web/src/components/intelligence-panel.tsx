"use client";

import * as React from "react";

import Link from "next/link";

import { CopyIcon, RefreshCwIcon } from "lucide-react";
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
import { api } from "@/lib/api";
import { statusMeta } from "@/lib/status";
import type { IntelligenceKind, IntelligencePage, TaskIntelligence } from "@/lib/types";
import { copyText } from "@/lib/utils";

const KINDS: { value: IntelligenceKind; label: string }[] = [
  { value: "credential", label: "凭据" },
  { value: "lead", label: "重要线索" },
  { value: "sensitive_data", label: "敏感数据" },
];
const STATUS: Record<IntelligenceKind, Record<string, string>> = {
  credential: { unverified: "未验证", verified: "已验证", invalid: "已失效" },
  lead: { pending: "待跟进", in_progress: "跟进中", dismissed: "已排除", converted: "已转漏洞" },
  sensitive_data: { suspected: "疑似", confirmed: "已确认", dismissed: "已排除" },
};
function time(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function conversationHref(item: TaskIntelligence) {
  return `/function/tasks/detail?id=${item.task_id}&tab=sessions${item.source_session ? `&session=${encodeURIComponent(item.source_session)}` : ""}`;
}

function AssetLinks({ ids, onNavigate }: { ids: number[]; onNavigate?: () => void }) {
  return ids.length ? (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {ids.map((id) => (
        <Link
          key={id}
          href={`/function/assets?asset=${id}`}
          onClick={onNavigate}
          className="underline underline-offset-2"
          aria-label={`查看资产 #${id}`}
        >
          #{id}
        </Link>
      ))}
    </span>
  ) : (
    <>未关联</>
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
  const [kind, setKind] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [data, setData] = React.useState<IntelligencePage | null>(null);
  const [error, setError] = React.useState("");
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
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
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
      toast.success("情报状态已更新");
    } catch (e) {
      toast.error("更新失败：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const statusOptions = kind === "all" ? {} : STATUS[kind as IntelligenceKind];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data && !data.enabled && scope === "tasks" ? (
        <Alert>
          <AlertTitle>自动记录已关闭</AlertTitle>
          <AlertDescription>
            已有情报仍可查看。前往{" "}
            <Link href="/system/settings" className="underline">
              系统设置
            </Link>{" "}
            开启后，Agent 将在执行中记录新增情报，并产生额外 Token 消耗。
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{scope === "tasks" ? "任务情报" : "资产关联情报"}</CardTitle>
          <CardDescription>
            {scope === "tasks" ? "集中查看本次获取与直接关联任务继承的情报。" : "按来源任务查看此资产关联的情报。"}{" "}
            直接展示凭据、敏感数据及来源证据，发现凭据不代表验证成功。
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
                全部 {data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : ""}
              </TabsTrigger>
              {KINDS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  <ToneDot tone={statusMeta("intelligence", item.value).tone} />
                  {item.label} {data?.counts[item.value] ?? 0}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="搜索情报标题、内容或上报者"
              placeholder="搜索标题、内容或上报者"
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
                <SelectTrigger aria-label="筛选情报状态">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
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
              刷新
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>读取情报失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
                  <TableHead>类别 / 标题</TableHead>
                  <TableHead>内容 / 来源证据</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>对话</TableHead>
                  <TableHead>资产</TableHead>
                  <TableHead>发现时间</TableHead>
                  <TableHead>操作</TableHead>
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
                          <span>来源证据</span>
                          <p className="whitespace-pre-wrap break-all">{intelligencePreview(item.evidence, 220)}</p>
                          {Array.from(item.evidence).length > 220 ? (
                            <button type="button" className="text-left underline" onClick={() => open(item)}>
                              详情查看完整证据
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline">{STATUS[item.kind][item.status] ?? item.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.confidence === "observed" ? "直接观察" : "推测"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col gap-1">
                        <Link href={conversationHref(item)} onClick={navigate} className="underline">
                          {item.source_session ? "查看对话" : "查看任务对话"}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          任务 #{item.task_id} · {item.worker || "Agent"}
                          {item.node_id ? ` · 节点 #${item.node_id}` : ""}
                        </span>
                        {item.inherited ? <Badge variant="outline">继承 · 只读</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <AssetLinks ids={item.asset_ids} onNavigate={navigate} />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal text-xs">{time(item.created_at)}</TableCell>
                    <TableCell className="align-top whitespace-normal [overflow-wrap:anywhere]">
                      <Button size="sm" variant="outline" onClick={() => open(item)}>
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : data ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无符合条件的情报</EmptyTitle>
                <EmptyDescription>
                  {query || kind !== "all" || status !== "all"
                    ? "尝试调整分类或筛选条件。"
                    : data.enabled
                      ? "Agent 在后续执行中发现有价值的信息后，会在此显示。"
                      : "开启自动记录后，新增情报会在此显示；历史会话不会自动补提取。"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条 · 每页 25 条</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || (page + 1) * 25 >= data.total}
              onClick={() => setPage((n) => n + 1)}
            >
              下一页
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
            <DialogTitle>{selected?.title ?? "情报详情"}</DialogTitle>
            <DialogDescription>完整展示记录内容与实际来源证据。</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge domain="intelligence" value={selected.kind} />
                <Badge variant="outline">{selected.confidence === "observed" ? "直接观察" : "推测"}</Badge>
                <span className="text-xs text-muted-foreground">
                  任务 #{selected.task_id}
                  {selected.node_id ? ` · 来源节点 #${selected.node_id}` : ""} · {selected.worker || "Agent"}
                </span>
              </div>
              {scope === "tasks" && !selected.inherited ? (
                <Select value={selected.status} disabled={saving} onValueChange={(value) => void update(value)}>
                  <SelectTrigger aria-label="更新情报状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(STATUS[selected.kind]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {STATUS[selected.kind][selected.status]} · 请到来源任务修改状态
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">内容</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await copyText(selected.content)) toast.success("已复制");
                    else toast.error("复制失败，请手动选择内容复制");
                  }}
                >
                  <CopyIcon data-icon="inline-start" />
                  复制
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
                      toast.success("已加入凭据处理队列");
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  重新处理凭据
                </Button>
              ) : null}
              <p className="text-sm">来源证据</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                {selected.evidence}
              </pre>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>
                  关联资产：
                  <AssetLinks ids={selected.asset_ids} onNavigate={navigate} />
                </span>
                <span>发现于 {time(selected.created_at)}</span>
              </div>
              <Link href={conversationHref(selected)} onClick={navigate} className="text-sm underline">
                {selected.source_session ? "查看来源任务会话" : "查看来源任务"}
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
