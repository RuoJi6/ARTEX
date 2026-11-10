"use client";
import * as React from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  LinkIcon,
  type LucideIcon,
  NetworkIcon,
  PlusIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { AssetDslSearch } from "@/components/asset-dsl-search";
import { ScopeTextEditor } from "@/components/scope-text-editor";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { parseCompanyScopeText } from "@/lib/company-scope";
import { taskAssetSourceLabel } from "@/lib/task-assets";
import type { Asset, NewAssetType } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 200];

const METHOD_COLOR: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-700",
  HEAD: "bg-purple-100 text-purple-700",
  OPTIONS: "bg-slate-100 text-slate-600",
  PATCH: "bg-orange-100 text-orange-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
};

const TABS = (ui: UITranslate): { key: NewAssetType; label: string; icon: LucideIcon }[] => [
  { key: "root_domain", label: ui("screen.bc208f697acff9"), icon: GlobeIcon },
  { key: "ip", label: "IP", icon: NetworkIcon },
  { key: "subdomain", label: ui("screen.4b4788120c34db"), icon: GlobeIcon },
  { key: "app", label: ui("screen.63c73c4730f447"), icon: SmartphoneIcon },
  { key: "service", label: ui("screen.ec309ab207ef7f"), icon: LayoutTemplateIcon },
  { key: "endpoint", label: ui("screen.c80d519245a7e8"), icon: LinkIcon },
];

function firstText(values: Array<string | undefined>, fallback: string): string {
  return values.find((value) => value?.trim()) ?? fallback;
}

function assetLabel(asset: Asset): string {
  switch (asset.type) {
    case "root_domain":
    case "subdomain":
      return firstText([asset.domain], `#${asset.id}`);
    case "ip":
      return firstText([asset.ip], `#${asset.id}`);
    case "app":
      return firstText([asset.app_name, asset.url], `#${asset.id}`);
    case "service": {
      const host = firstText([asset.ip, asset.domain], "");
      const address = [host, asset.port].filter((value) => value !== undefined && value !== "").join(":");
      return firstText([asset.url, address, asset.service_name], `#${asset.id}`);
    }
    case "endpoint":
      return firstText([[asset.method, asset.url].filter(Boolean).join(" ")], `#${asset.id}`);
  }
}

function MethodBadge({ method }: { method: string }) {
  const normalized = method.toUpperCase();
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono font-semibold text-[10px] leading-none",
        METHOD_COLOR[normalized] ?? "bg-muted text-muted-foreground",
      )}
    >
      {normalized || "—"}
    </span>
  );
}

function statusTone(code: number) {
  if (code >= 500) return "text-red-500";
  if (code >= 400) return "text-amber-500";
  if (code >= 300) return "text-blue-500";
  if (code >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

function fmtBytes(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${index === 0 ? value : (value / 1024 ** index).toFixed(1)} ${units[index]}`;
}

function Chips({ items, mono }: { items: string[]; mono?: boolean }) {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {clean.map((item) => (
        <Badge key={item} variant="outline" className={cn(mono && "font-mono")}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function SourceCell({ asset }: { asset: Asset }) {
  const { ui } = useUITranslation();

  const source = firstText([asset.task_source], "legacy");
  const summary = firstText([asset.task_source_summary], ui("screen.cbad47cba1e374"));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="max-w-28 shrink-0 font-normal">
          <span className="truncate">{taskAssetSourceLabel(source, ui)}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="left" align="start" className="max-w-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{taskAssetSourceLabel(source, ui)}</span>
          <span className="[overflow-wrap:anywhere]">{summary}</span>
          {asset.task_source_node_id ? (
            <span className="font-mono opacity-80">
              {ui("screen.cfadf0ecee01f2")}
              {asset.task_source_node_id}
            </span>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function AssetCard({
  children,
  cols,
  loaded,
  onPage,
  onSize,
  page,
  size,
  total,
}: {
  children: React.ReactNode;
  cols: string[];
  loaded: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  page: number;
  size: number;
  total: number;
}) {
  const { ui } = useUITranslation();

  const rows = React.Children.toArray(children);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const start = total === 0 ? 0 : page * size + 1;
  const end = Math.min(total, page * size + rows.length);
  let tableRows: React.ReactNode;
  if (!loaded) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={cols.length} className="py-14 text-center">
          <Spinner className="mx-auto" />
        </TableCell>
      </TableRow>
    );
  } else if (rows.length > 0) {
    tableRows = rows;
  } else {
    tableRows = (
      <TableRow>
        <TableCell colSpan={cols.length} className="py-10 text-center text-muted-foreground text-sm">
          {ui("screen.b75b7beeea1cbf")}
        </TableCell>
      </TableRow>
    );
  }
  return (
    <Card className="flex min-h-0 flex-1 flex-col py-0">
      <CardContent className="scrollbar-thin scrollbar-track-transparent min-h-0 flex-1 overflow-auto p-0">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {cols.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{tableRows}</TableBody>
        </Table>
      </CardContent>
      {total > 0 ? (
        <CardFooter className="gap-2 px-3 py-1.5 text-muted-foreground text-xs">
          <Select
            value={String(size)}
            onValueChange={(value) => {
              onSize(Number(value));
              onPage(0);
            }}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PAGE_SIZES.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} {ui("screen.785e3cd53901f4")}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="tabular-nums">
            {start}–{end} / {total}
          </span>
          {pageCount > 1 ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 0}
                onClick={() => onPage(Math.max(0, page - 1))}
                aria-label={ui("screen.c9b9ae7a61444a")}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page + 1 >= pageCount}
                onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
                aria-label={ui("screen.8a8542f6964852")}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function AddTaskAssetsSheet({
  onAttached,
  onOpenChange,
  open,
  taskId,
}: {
  onAttached: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  taskId: string;
}) {
  const { ui } = useUITranslation();

  const [scopeText, setScopeText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const parsedScope = React.useMemo(() => parseCompanyScopeText(scopeText), [scopeText]);

  React.useEffect(() => {
    if (!open) return;
    setScopeText("");
  }, [open]);

  const attach = async () => {
    if (parsedScope.rules.length === 0 || parsedScope.errors.length > 0) return;
    setSaving(true);
    try {
      const result = await api.registerTaskAssetScopes(taskId, parsedScope.rules);
      const assetSummary = result.assets_linked + result.assets_existing;
      toast.success(ui("screen.787156bd3645a3", { v0: result.requested, v1: assetSummary }));
      onAttached();
      onOpenChange(false);
    } catch (reason) {
      toast.error(ui("screen.cc9d52cbd65a7b", { v0: String((reason as Error)?.message ?? reason) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{ui("screen.c4f675a491e4b9")}</SheetTitle>
          <SheetDescription>{ui("screen.4fc437dbed9daa")}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
          <ScopeTextEditor
            id="task-asset-scope"
            value={scopeText}
            onValueChange={setScopeText}
            parsed={parsedScope}
            label={ui("screen.2effa559734919")}
            description={ui("screen.65bc0f45993c04")}
          />
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {ui("screen.2cd0f3be8738a8")}
          </Button>
          <Button
            onClick={() => void attach()}
            disabled={saving || parsedScope.rules.length === 0 || parsedScope.errors.length > 0}
          >
            {saving ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            {ui("screen.3cf1e4dc9adcb8")}
            {parsedScope.rules.length > 0 ? parsedScope.rules.length : ""} {ui("screen.f004f1d84cf962")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function AssetsTab({ taskId }: { taskId: string }) {
  const { ui, liveUI } = useUITranslation();

  const [rows, setRows] = React.useState<Asset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [tab, setTab] = React.useState<NewAssetType>("root_domain");
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(50);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [dslError, setDslError] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [addOpen, setAddOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Asset | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const assetsRequestRef = React.useRef(0);
  const dslMode = query.trim() !== "";

  React.useEffect(() => {
    setPage(0);
    setRows([]);
    setLoaded(false);
  }, []);

  // Switching type tabs resets the search (DSL fields differ per type; matches
  // the global asset view).
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab changes intentionally reset tab-local controls.
  React.useEffect(() => {
    setQuery("");
    setDslError("");
  }, [tab]);

  // Query / tab / page-size changes restart server pagination.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these controls intentionally reset server pagination.
  React.useEffect(() => setPage(0), [tab, size, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an explicit manual-reload trigger.
  React.useEffect(() => {
    let active = true;
    const dsl = query.trim();
    const request = ++assetsRequestRef.current;
    const load = async () => {
      setLoading(true);
      try {
        // The search always stays within this task's assets: taskAssets and
        // searchTaskAssets both pin task_id server-side.
        const [current, nextCounts] = await Promise.all([
          dsl
            ? api.searchTaskAssets(taskId, dsl, tab, size, page * size)
            : api.taskAssets(taskId, tab, size, page * size),
          api.assetCounts(taskId),
        ]);
        if (!active || assetsRequestRef.current !== request) return;
        setRows(current.assets);
        setTotal(current.total);
        setCounts(nextCounts ?? {});
        setDslError("");
      } catch (reason) {
        if (!active || assetsRequestRef.current !== request) return;
        const message = String((reason as Error)?.message ?? reason);
        if (dsl) {
          setDslError(message);
          setRows([]);
          setTotal(0);
        } else {
          toast.error(liveUI("screen.b4289647e26c27", { v0: message }));
        }
      } finally {
        if (active && assetsRequestRef.current === request) {
          setLoading(false);
          setLoaded(true);
        }
      }
    };
    // Debounce DSL keystrokes; plain (re)loads and polling run immediately.
    const debounce = setTimeout(() => void load(), dsl ? 400 : 0);
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [page, query, refreshKey, size, tab, taskId, liveUI]);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / size) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [page, size, total]);

  const refresh = React.useCallback(() => {
    setLoaded(false);
    setRefreshKey((current) => current + 1);
  }, []);

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.detachTaskAsset(taskId, removeTarget.id);
      toast.success(ui("screen.5c8434e971a0b8", { v0: assetLabel(removeTarget) }));
      setRemoveTarget(null);
      refresh();
    } catch (reason) {
      toast.error(ui("screen.9e0adb4df22f5d", { v0: String((reason as Error)?.message ?? reason) }));
    } finally {
      setRemoving(false);
    }
  };

  const removeButton = (asset: Asset) => (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setRemoveTarget(asset)}
      aria-label={ui("screen.72f1e881eb2a02", { v0: assetLabel(asset) })}
      title={ui("screen.b3bdc5bee6f1e5")}
    >
      <Trash2Icon />
    </Button>
  );

  const commonCardProps = { loaded, onPage: setPage, onSize: setSize, page, size, total };
  const totalAll = TABS(ui).reduce((sum, item) => sum + (counts[item.key] ?? 0), 0);

  const searchBox = (
    <AssetDslSearch
      query={query}
      onChange={setQuery}
      loading={loading}
      error={dslError}
      count={dslMode ? total : undefined}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-sm">{ui("screen.e3a1dbbaefc3d7")}</h2>
          <p className="text-muted-foreground text-xs">
            {ui("screen.dd4503e875e58b")}
            {totalAll} {ui("screen.a5670ed30b06da")}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {ui("screen.c4f675a491e4b9")}
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as NewAssetType)}
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList className="w-max">
            {TABS(ui).map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                <item.icon data-icon="inline-start" />
                {item.label}
                <span className="text-muted-foreground tabular-nums">{counts[item.key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {searchBox}

        <TabsContent value="root_domain" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              ui("screen.222952431147e5"),
              ui("screen.b49f6a22e68943"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="font-medium font-mono text-xs">{asset.domain}</TableCell>
                <TableCell className="text-xs">{asset.icp || "—"}</TableCell>
                <TableCell>
                  <SourceCell asset={asset} />
                </TableCell>
                <TableCell className="w-16">{removeButton(asset)}</TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        <TabsContent value="ip" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              "IP",
              ui("screen.ace9cc9aa062fe"),
              ui("screen.dd799f925f944f"),
              ui("screen.b4de56b75bf521"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="font-medium font-mono text-xs">{asset.ip}</TableCell>
                <TableCell className="font-mono text-xs">{asset.c_segment || "—"}</TableCell>
                <TableCell>
                  <Chips items={asset.bound_domains ?? []} mono />
                </TableCell>
                <TableCell>
                  <Chips
                    items={(asset.open_ports ?? []).map((item) =>
                      item.service ? `${item.port}/${item.service}` : String(item.port),
                    )}
                    mono
                  />
                </TableCell>
                <TableCell>
                  <SourceCell asset={asset} />
                </TableCell>
                <TableCell className="w-16">{removeButton(asset)}</TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        <TabsContent value="subdomain" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              ui("screen.222952431147e5"),
              ui("screen.bc208f697acff9"),
              ui("screen.d45e6a43ac7291"),
              ui("screen.5632a6a4e5429f"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="font-medium font-mono text-xs">{asset.domain}</TableCell>
                <TableCell className="font-mono text-xs">{asset.root_domain || "—"}</TableCell>
                <TableCell className="text-xs">{asset.record_type || "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs">
                  {(Array.isArray(asset.record_value) ? asset.record_value.join(", ") : asset.record_value) || "—"}
                </TableCell>
                <TableCell>
                  <SourceCell asset={asset} />
                </TableCell>
                <TableCell className="w-16">{removeButton(asset)}</TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        <TabsContent value="app" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              ui("screen.63c73c4730f447"),
              ui("screen.37aac5b4e639b9"),
              ui("screen.515559957fd3ac"),
              ui("screen.c3405f8c7d9d39"),
              ui("screen.0d6a14a9ab254e"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="max-w-48 truncate font-medium text-xs">{asset.app_name || "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs" title={asset.url}>
                  {asset.url || "—"}
                </TableCell>
                <TableCell className="text-xs">{asset.category || "—"}</TableCell>
                <TableCell className="max-w-48 truncate text-xs">{asset.page_title || "—"}</TableCell>
                <TableCell>
                  <Chips items={asset.technologies ?? []} />
                </TableCell>
                <TableCell>
                  <SourceCell asset={asset} />
                </TableCell>
                <TableCell className="w-16">{removeButton(asset)}</TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        <TabsContent value="service" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              ui("screen.bad0e733662dba"),
              ui("screen.222952431147e5"),
              "IP",
              ui("screen.e71ac32b544b0e"),
              ui("screen.06f7d73412128f"),
              ui("screen.c3405f8c7d9d39"),
              ui("screen.71150dc5f9bf29"),
              ui("screen.0d6a14a9ab254e"),
              ui("screen.d2d648bd1c94b7"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => {
              const isHttp = asset.service_type === "http";
              const address = isHttp
                ? asset.url || ""
                : asset.service_name || [asset.ip || asset.domain, asset.port].filter(Boolean).join(":");
              return (
                <TableRow key={asset.id}>
                  <TableCell className="max-w-xs truncate font-mono text-xs" title={address}>
                    {address || "—"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs" title={asset.domain}>
                    {asset.domain || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{asset.ip || "—"}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{asset.port ?? "—"}</TableCell>
                  <TableCell>
                    {asset.status_code != null ? (
                      <span
                        className={cn("font-mono font-semibold text-xs tabular-nums", statusTone(asset.status_code))}
                      >
                        {asset.status_code}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs">{asset.page_title || "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums">{fmtBytes(asset.content_length)}</TableCell>
                  <TableCell>
                    <Chips items={asset.technologies ?? []} />
                  </TableCell>
                  <TableCell>
                    {(asset.auth ?? []).length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      (asset.auth ?? []).map((authItem) => {
                        const item = authItem as Record<string, string>;
                        return (
                          <span
                            key={`${asset.id}-${item.type ?? ""}-${item.username ?? ""}-${JSON.stringify(item)}`}
                            className="inline-flex items-center gap-1 text-[11px]"
                          >
                            <KeyRoundIcon className="size-3 text-muted-foreground" />
                            <span className="font-mono">
                              {item.type || item.username || ui("screen.d2d648bd1c94b7")}
                            </span>
                          </span>
                        );
                      })
                    )}
                  </TableCell>
                  <TableCell>
                    <SourceCell asset={asset} />
                  </TableCell>
                  <TableCell className="w-16">{removeButton(asset)}</TableCell>
                </TableRow>
              );
            })}
          </AssetCard>
        </TabsContent>

        <TabsContent value="endpoint" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AssetCard
            cols={[
              ui("screen.22b9f0b6621280"),
              ui("screen.cfd721ac9e2819"),
              ui("screen.9634fb0832be62"),
              ui("screen.a488e93d69cc12"),
              ui("screen.ed31fbb483ee1b"),
            ]}
            {...commonCardProps}
          >
            {rows.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="w-16">
                  <MethodBadge method={asset.method || ""} />
                </TableCell>
                <TableCell className="max-w-sm truncate font-mono text-xs" title={asset.url}>
                  {asset.url || "—"}
                </TableCell>
                <TableCell>
                  <Chips
                    items={(asset.params ?? []).map((param) => {
                      const item = param as Record<string, string>;
                      return item.name ? `${item.name}(${item.location || item.in || "?"})` : "?";
                    })}
                    mono
                  />
                </TableCell>
                <TableCell>
                  <SourceCell asset={asset} />
                </TableCell>
                <TableCell className="w-16">{removeButton(asset)}</TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>
      </Tabs>

      <AddTaskAssetsSheet onAttached={refresh} onOpenChange={setAddOpen} open={addOpen} taskId={taskId} />

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && !removing && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ui("screen.29b4b3870f0ba9")}</AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              {removeTarget ? ui("screen.a36eec4b1d6084", { v0: assetLabel(removeTarget) }) : ""}
              {ui("screen.5177f3f1ef71c5")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {removing ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
              {removing ? ui("screen.6889702382140a") : ui("screen.ff27eec8d046cc")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
