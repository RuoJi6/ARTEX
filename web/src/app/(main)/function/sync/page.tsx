"use client";
import * as React from "react";

import { AlertCircleIcon, CheckCircle2Icon, DownloadIcon, PlugZapIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { SSProject, SSTask } from "@/lib/types";

type SSStatus = {
  exists: boolean;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  url?: string;
  tools: string[];
};

type Dimension = "project" | "task";

const ASSET_TYPES = (ui: UITranslate): { key: string; label: string }[] => [
  { key: "subdomain", label: ui("screen.4b4788120c34db") },
  { key: "service", label: ui("screen.ec309ab207ef7f") },
  { key: "app", label: "App" },
];

export default function AssetSyncPage() {
  const { ui } = useUITranslation();

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="font-semibold text-xl">{ui("screen.7e5cb9a03be9f1")}</h1>
        <p className="text-muted-foreground text-sm">{ui("screen.d0a4a7d7c49970")}</p>
      </div>
      <Tabs defaultValue="scopesentry">
        <TabsList>
          <TabsTrigger value="scopesentry">ScopeSentry</TabsTrigger>
        </TabsList>
        <TabsContent value="scopesentry" className="mt-4">
          <ScopeSentryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScopeSentryPanel() {
  const { ui, liveUI } = useUITranslation();

  const [status, setStatus] = React.useState<SSStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);

  const loadStatus = React.useCallback(() => {
    setLoadingStatus(true);
    api
      .ssStatus()
      .then(setStatus)
      .catch((e) => toast.error(liveUI("screen.657aed58f4bcf5", { v0: e.message })))
      .finally(() => setLoadingStatus(false));
  }, [liveUI]);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const ready = !!status && status.exists && status.configured && status.enabled;

  return (
    <div className="space-y-4">
      <DataSourceCard status={status} loading={loadingStatus} onChanged={loadStatus} />
      {ready ? (
        <SyncWorkbench />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {ui("screen.0b0300d241b68e")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 数据源状态卡 ─────────────────────────────────────────────────────────────

function DataSourceCard({
  status,
  loading,
  onChanged,
}: {
  status: SSStatus | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const { ui } = useUITranslation();

  const [url, setUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (status?.url) setUrl(status.url);
  }, [status?.url]);

  const create = async () => {
    setBusy(true);
    try {
      await api.ssDatasource({});
      toast.success(ui("screen.a1d80b0fd4a89b"));
      onChanged();
    } catch (e) {
      toast.error(ui("screen.12a4969260f84f", { v0: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!url.trim()) return toast.error(ui("screen.521eed25732141"));
    setBusy(true);
    try {
      const r = await api.ssDatasource({ url: url.trim(), api_key: apiKey.trim() });
      toast.success(r.enabled ? ui("screen.d5d55a0d0def0b") : ui("screen.469d6ee1d36e0b"));
      setApiKey("");
      onChanged();
    } catch (e) {
      toast.error(ui("screen.20e1b0f2590bc7", { v0: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZapIcon className="size-4" /> {ui("screen.3f42864475dbcb")}
          <StatusBadge status={status} loading={loading} />
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onChanged} disabled={loading}>
          <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} /> {ui("screen.aee88743413144")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!status?.exists ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">{ui("screen.d897081d82d05a")}</p>
            <Button onClick={create} disabled={busy}>
              {ui("screen.614f222e90e2ad")}
            </Button>
          </div>
        ) : (
          <>
            {!status.configured && (
              <p className="text-amber-600 text-sm dark:text-amber-500">{ui("screen.0af9414ef07146")}</p>
            )}
            {status.configured && !status.enabled && (
              <p className="text-amber-600 text-sm dark:text-amber-500">{ui("screen.45290bb8a108ab")}</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{ui("screen.9d5e991e537cec")}</Label>
                <Input placeholder={ui("screen.4009de0bd10177")} value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui("screen.c63859d89925c8")}</Label>
                <Input
                  type="password"
                  placeholder="ssk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={busy}>
                {ui("screen.8e3f6f8772438f")}
              </Button>
              {status.enabled && status.tools.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  {ui("screen.cc4f958078895a")}
                  {status.tools.length} {ui("screen.e43b2a10830f3e")}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, loading }: { status: SSStatus | null; loading: boolean }) {
  const { ui } = useUITranslation();

  if (loading || !status) return <Badge variant="secondary">{ui("screen.3a1abf3422d22d")}</Badge>;
  if (!status.exists) return <Badge variant="destructive">{ui("screen.90b310149a745e")}</Badge>;
  if (!status.configured) return <Badge variant="outline">{ui("screen.80a57e03f0717f")}</Badge>;
  if (!status.enabled) return <Badge variant="outline">{ui("screen.f95ea7f4c063ee")}</Badge>;
  if (status.reachable)
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2Icon className="mr-1 size-3" /> {ui("screen.5be0323e8adcae")}
      </Badge>
    );
  return (
    <Badge variant="destructive">
      <AlertCircleIcon className="mr-1 size-3" /> {ui("screen.8d7c03019f1dd9")}
    </Badge>
  );
}

// ── 同步工作区（项目 / 任务维度）────────────────────────────────────────────────

function SyncWorkbench() {
  const { ui, liveUI } = useUITranslation();

  const [dimension, setDimension] = React.useState<Dimension>("project");
  const [assetTypes, setAssetTypes] = React.useState<Record<string, boolean>>({
    subdomain: true,
    service: true,
    app: true,
  });
  const [createCompany, setCreateCompany] = React.useState(true);

  const [projects, setProjects] = React.useState<SSProject[]>([]);
  const [tasks, setTasks] = React.useState<SSTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [syncing, setSyncing] = React.useState(false);
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof api.ssSync>> | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setSelected(new Set());
    const fn =
      dimension === "project"
        ? api.ssProjects(page, 50, search).then((r) => setProjects(r.projects))
        : api.ssTasks(page, 50, search).then(setTasks);
    fn.catch((e) => toast.error(liveUI("screen.ae172cac23d0dc", { v0: e.message }))).finally(() => setLoading(false));
  }, [dimension, page, search, liveUI]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows = dimension === "project" ? projects : tasks;
  const idOf = (row: SSProject | SSTask) => (dimension === "project" ? (row as SSProject).id : (row as SSTask).name);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map(idOf))));
  };

  const chosenTypes = ASSET_TYPES(ui)
    .filter((t) => assetTypes[t.key])
    .map((t) => t.key);

  const runSync = async () => {
    if (selected.size === 0)
      return toast.error(
        ui("screen.7628a317256e1b", {
          v0: dimension === "project" ? ui("screen.79f326be4409d5") : ui("screen.5253040db8643c"),
        }),
      );
    if (chosenTypes.length === 0) return toast.error(ui("screen.044e8b935ff588"));
    setSyncing(true);
    setResult(null);
    try {
      const r = await api.ssSync({
        dimension,
        targets: [...selected],
        asset_types: chosenTypes,
        create_company: dimension === "project" ? createCompany : false,
      });
      setResult(r);
      const total = Object.values(r.synced ?? {}).reduce((a, b) => a + b, 0);
      toast.success(ui("screen.9d27a183aca29d", { v0: total }));
    } catch (e) {
      toast.error(ui("screen.087f4198ed24a5", { v0: (e as Error).message }));
    } finally {
      setSyncing(false);
    }
  };

  const renderRows = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
            {ui("screen.4927a53bcc886a")}
          </TableCell>
        </TableRow>
      );
    }
    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
            {ui("screen.ab9ba6d10394a4")}
          </TableCell>
        </TableRow>
      );
    }
    if (dimension === "project") {
      return projects.map((p) => (
        <TableRow key={p.id} className="cursor-pointer" onClick={() => toggle(p.id)}>
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
          </TableCell>
          <TableCell className="font-medium">{p.name}</TableCell>
          <TableCell>{p.tag ? <Badge variant="secondary">{p.tag}</Badge> : "—"}</TableCell>
          <TableCell className="text-right">{p.AssetCount ?? 0}</TableCell>
        </TableRow>
      ));
    }
    return tasks.map((t) => (
      <TableRow key={t.id} className="cursor-pointer" onClick={() => toggle(t.name)}>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected.has(t.name)} onCheckedChange={() => toggle(t.name)} />
        </TableCell>
        <TableCell className="font-medium">{t.name}</TableCell>
        <TableCell>
          <Badge variant={t.progress === 100 ? "secondary" : "outline"}>
            {t.progress != null ? `${t.progress}%` : "—"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">{t.endTime || t.creatTime || "—"}</TableCell>
      </TableRow>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{ui("screen.70eda845ee6e85")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 维度切换 */}
        <Tabs
          value={dimension}
          onValueChange={(v) => {
            setDimension(v as Dimension);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="project">{ui("screen.0fbd79f13199ac")}</TabsTrigger>
            <TabsTrigger value="task">{ui("screen.460e9766d7c671")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 资产类型 + 选项 */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-sm">{ui("screen.c8ff653f7f7606")}</span>
          {ASSET_TYPES(ui).map((t) => (
            <label key={t.key} htmlFor={`at-${t.key}`} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                id={`at-${t.key}`}
                checked={!!assetTypes[t.key]}
                onCheckedChange={(c) => setAssetTypes((prev) => ({ ...prev, [t.key]: !!c }))}
              />
              {t.label}
            </label>
          ))}
          {dimension === "project" && (
            <label htmlFor="create-company" className="flex items-center gap-1.5 text-sm">
              <Checkbox id="create-company" checked={createCompany} onCheckedChange={(c) => setCreateCompany(!!c)} />
              {ui("screen.61ff3f7ee3ae39")}
            </label>
          )}
        </div>

        {/* 搜索 + 操作 */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={dimension === "project" ? ui("screen.4649984592bcfe") : ui("screen.11efb1c9e0037a")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  load();
                }
              }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <div className="flex-1" />
          <span className="text-muted-foreground text-xs">
            {ui("screen.7ecf1cde648680")}
            {selected.size}
          </span>
          <Button onClick={runSync} disabled={syncing || selected.size === 0}>
            <DownloadIcon className={syncing ? "size-4 animate-pulse" : "size-4"} /> {ui("screen.95710794eb29cf")}
          </Button>
        </div>

        {/* 列表 */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={rows.length > 0 && selected.size === rows.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>
                  {dimension === "project" ? ui("screen.5c760c9cd87acc") : ui("screen.2c43cd7db1492f")}
                </TableHead>
                {dimension === "project" ? (
                  <>
                    <TableHead>{ui("screen.1d0fd5f9336d91")}</TableHead>
                    <TableHead className="text-right">{ui("screen.ae4728f0882849")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{ui("screen.6320b4a8722a85")}</TableHead>
                    <TableHead>{ui("screen.8b6ff498515bcc")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>{renderRows()}</TableBody>
          </Table>
        </div>

        {/* 分页 */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            {ui("screen.c9b9ae7a61444a")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {ui("screen.af50a0fe2a50a3")}
            {page} {ui("screen.d24d3c99460c7e")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length < 50 || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {ui("screen.8a8542f6964852")}
          </Button>
        </div>

        {/* 结果 */}
        {result && <SyncResult result={result} />}
      </CardContent>
    </Card>
  );
}

function SyncResult({ result }: { result: Awaited<ReturnType<typeof api.ssSync>> }) {
  const { ui } = useUITranslation();

  const synced = result.synced ?? {};
  const labels: Record<string, string> = {
    subdomain: ui("screen.4b4788120c34db"),
    service: ui("screen.ec309ab207ef7f"),
    app: "App",
    ip: "IP",
  };
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap gap-3">
        {Object.entries(synced).map(([k, v]) => (
          <Badge key={k} variant="secondary">
            {labels[k] ?? k}: {v}
          </Badge>
        ))}
      </div>
      {result.companies && result.companies.length > 0 && (
        <p className="text-muted-foreground">
          {ui("screen.6af39b434c2a70")}
          {result.companies.join("、")}
        </p>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <ul className="list-inside list-disc text-amber-600 dark:text-amber-500">
          {result.warnings.map((wm) => (
            <li key={wm}>{wm}</li>
          ))}
        </ul>
      )}
      {result.errors && result.errors.length > 0 && (
        <ul className="list-inside list-disc text-destructive">
          {result.errors.slice(0, 20).map((em) => (
            <li key={em}>{em}</li>
          ))}
          {result.errors.length > 20 && (
            <li>
              {ui("screen.612b2474d4ad11")}
              {result.errors.length} {ui("screen.4a7974d43c3395")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
