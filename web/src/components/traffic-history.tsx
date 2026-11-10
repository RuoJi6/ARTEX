"use client";
import * as React from "react";

import { useRouter } from "next/navigation";

import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  EraserIcon,
  FilterXIcon,
  ListChecksIcon,
  Loader2Icon,
  RadioTowerIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { LinkTrafficDialog } from "@/components/link-traffic-dialog";
import { requestFromTraffic } from "@/components/repeater/repeater-http";
import { seedFromEvidence } from "@/components/repeater/repeater-store";
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
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SortableHead } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { useStoredSortPreference } from "@/lib/sort-preference";
import type { TrafficDetail, TrafficExchange, TrafficHost, TrafficResp } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

function fmtTime(ts: string, ui: UITranslate) {
  return new Date(ts).toLocaleString(ui("screen.91610255157661"), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtBytes(n: number) {
  if (n <= 0) return "0 B";
  // GB matters for the reclaimed-space figure a full purge reports; a capture-heavy
  // instance can hand back several.
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function statusTone(status: number) {
  if (status >= 500) return "text-red-500";
  if (status >= 400) return "text-amber-500";
  if (status >= 300) return "text-blue-500";
  if (status >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

function MethodBadge({ method }: { method: string }) {
  return <Badge className="shrink-0 font-mono">{method}</Badge>;
}

function TrafficID({ id }: { id: string }) {
  const { ui } = useUITranslation();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-1 font-mono text-xs"
      title={ui("screen.8a134471206fdb")}
      aria-label={ui("screen.54649a31e8d4c8", { v0: id })}
      onClick={async (event) => {
        event.stopPropagation();
        if (await copyText(id)) {
          toast.success(ui("screen.9b466f01119f3f"));
        } else {
          toast.error(ui("screen.5c3930aa096ff4"));
        }
      }}
    >
      {id}
      <CopyIcon className="size-3 shrink-0" />
    </Button>
  );
}

// Older captures may predate Host persistence because net/http keeps Host
// outside Request.Header. Fill it for display while newly recorded traffic is
// fixed at the recorder layer as well.
function requestWithHost(raw: string, exchange: TrafficExchange): string {
  if (!raw.trim() || /^host\s*:/im.test(raw)) return raw;
  let host = exchange.host;
  try {
    host = new URL(exchange.url).host || host;
  } catch {
    // Relative or legacy URLs fall back to the indexed host.
  }
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const firstLineEnd = raw.indexOf(newline);
  if (firstLineEnd < 0) return `${raw}${newline}Host: ${host}`;
  return `${raw.slice(0, firstLineEnd + newline.length)}Host: ${host}${newline}${raw.slice(firstLineEnd + newline.length)}`;
}

// Fixed method set (server filters exact-match); avoids deriving options from a
// single page, which would only ever list the methods on that page.
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const PAGE_SIZES = [25, 50, 100, 200];
type HostCountSortDirection = "asc" | "desc";

// Server-sortable columns. The list is sent to the backend verbatim as `sort`,
// which whitelists these same names, so keep them in sync with traffic.Page.
const SORT_FIELDS = ["ts", "status", "resp_len"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const SORT_STORAGE_KEY = "traffic-sort";

// Status-class buckets for the filter dropdown; the value is sent as `status`,
// which the backend reads as either an exact code or an "Nxx" class band.
const STATUS_BUCKETS = ["2xx", "3xx", "4xx", "5xx"];

export function TrafficHistory({ taskId }: { taskId?: string }) {
  const { ui, liveUI } = useUITranslation();

  const taskScoped = Boolean(taskId);
  const [selectedFlows, setSelectedFlows] = React.useState<Map<string, TrafficExchange>>(() => new Map());
  const router = useRouter();
  const [importing, setImporting] = React.useState(false);
  const importLock = React.useRef(false);
  const [linking, setLinking] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(50);
  const [host, setHost] = React.useState(""); // raw host input
  const [hostQ, setHostQ] = React.useState(""); // debounced → server
  const [query, setQuery] = React.useState(""); // raw free-text input
  const [queryQ, setQueryQ] = React.useState(""); // debounced → server
  const [method, setMethod] = React.useState("all");

  // Advanced filters (issue #177): response-body content, path, status class and
  // response-size range. Text inputs are debounced like host/query; the status
  // select applies immediately.
  const [body, setBody] = React.useState("");
  const [bodyQ, setBodyQ] = React.useState("");
  const [path, setPath] = React.useState("");
  const [pathQ, setPathQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [respMin, setRespMin] = React.useState("");
  const [respMinQ, setRespMinQ] = React.useState("");
  const [respMax, setRespMax] = React.useState("");
  const [respMaxQ, setRespMaxQ] = React.useState("");
  const [sort, setSort] = useStoredSortPreference<SortField>(SORT_STORAGE_KEY, SORT_FIELDS, "ts", "desc");

  const [traffic, setTraffic] = React.useState<TrafficResp | null>(null);
  const [selected, setSelected] = React.useState<TrafficExchange | null>(null);
  const [detail, setDetail] = React.useState<TrafficDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [hosts, setHosts] = React.useState<TrafficHost[]>([]); // target picker
  const [selectedHosts, setSelectedHosts] = React.useState<string[]>([]); // checked in picker
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [hostCountSortDirection, setHostCountSortDirection] = React.useState<HostCountSortDirection>("desc");

  const [deleteMode, setDeleteMode] = React.useState<"filter" | "selected" | "all" | null>(null); // null = dialog closed
  const [deleting, setDeleting] = React.useState(false);
  const [reloadTick, setReloadTick] = React.useState(0); // manual refetch trigger

  // Debounce both filters so we don't refetch on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setHostQ(host.trim()), 300);
    return () => clearTimeout(t);
  }, [host]);
  React.useEffect(() => {
    const t = setTimeout(() => setQueryQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  React.useEffect(() => {
    const t = setTimeout(() => setBodyQ(body.trim()), 300);
    return () => clearTimeout(t);
  }, [body]);
  React.useEffect(() => {
    const t = setTimeout(() => setPathQ(path.trim()), 300);
    return () => clearTimeout(t);
  }, [path]);
  React.useEffect(() => {
    const t = setTimeout(() => setRespMinQ(respMin.trim()), 300);
    return () => clearTimeout(t);
  }, [respMin]);
  React.useEffect(() => {
    const t = setTimeout(() => setRespMaxQ(respMax.trim()), 300);
    return () => clearTimeout(t);
  }, [respMax]);

  const hasAdvancedFilter = Boolean(bodyQ || pathQ || respMinQ || respMaxQ) || statusFilter !== "all";
  const resetAdvancedFilters = () => {
    setBody("");
    setBodyQ("");
    setPath("");
    setPathQ("");
    setStatusFilter("all");
    setRespMin("");
    setRespMinQ("");
    setRespMax("");
    setRespMaxQ("");
  };

  // Any filter/size/sort change resets to the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these values intentionally trigger a page reset.
  React.useEffect(() => {
    setPage(0);
  }, [hostQ, queryQ, method, size, bodyQ, pathQ, statusFilter, respMinQ, respMaxQ, sort, taskId]);

  // Load the current page. Auto-refresh only on page 0 (newest) so paging back
  // through history isn't yanked out from under the user.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an explicit manual-refetch trigger.
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .traffic(page, size, hostQ, method, queryQ, {
          taskId,
          body: bodyQ,
          path: pathQ,
          status: statusFilter,
          respMin: respMinQ,
          respMax: respMaxQ,
          sort: sort.field,
          order: sort.direction,
        })
        .then((r) => {
          if (alive) setTraffic(r);
        })
        .catch(() => {
          // Keep the last successful snapshot during transient refresh failures.
        });
      if (!taskScoped) {
        api
          .trafficHosts()
          .then((r) => {
            if (alive) setHosts(r.hosts ?? []);
          })
          .catch(() => {
            // Keep the last successful host list during transient refresh failures.
          });
      } else if (alive) {
        setHosts([]);
      }
    };
    load();
    const t = setInterval(() => {
      if (page !== 0) return; // only auto-refresh the newest page
      load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [
    page,
    size,
    hostQ,
    method,
    queryQ,
    bodyQ,
    pathQ,
    statusFilter,
    respMinQ,
    respMaxQ,
    sort,
    reloadTick,
    taskId,
    taskScoped,
  ]);

  // Delete traffic for the current host filter (substring) or the checked
  // hosts (exact batch), then refetch.
  const allSelected = hosts.length > 0 && hosts.every((h) => selectedHosts.includes(h.host));
  const sortedHosts = React.useMemo(
    () =>
      [...hosts].sort((a, b) => {
        const countOrder = hostCountSortDirection === "asc" ? a.count - b.count : b.count - a.count;
        return countOrder || a.host.localeCompare(b.host);
      }),
    [hosts, hostCountSortDirection],
  );

  // "清空" for the unfiltered purge, "删除" for the host-scoped ones — the dialog's
  // title and its confirm button both follow from which is in play.
  const deleteVerb = deleteMode === "all" ? ui("screen.1ef3de06b32e52") : ui("screen.2f9daa828907b9");
  const deleteTitle = deleteMode
    ? {
        all: ui("screen.20a10fd336ecc6"),
        selected: ui("screen.331ce0fdfdcad6", { v0: selectedHosts.length }),
        filter: ui("screen.b47e0e2255192b"),
      }[deleteMode]
    : "";

  // `reclaimed` only comes back from the full purge; the host-scoped deletions
  // report the row count alone.
  const requestDelete = (mode: "filter" | "selected" | "all"): Promise<{ deleted: number; reclaimed?: number }> => {
    if (mode === "all") return api.trafficDeleteAll();
    if (mode === "selected") return api.trafficDeleteHosts(selectedHosts);
    return api.trafficDeleteHost(hostQ);
  };

  const confirmDelete = () => {
    if (!deleteMode) return;
    setDeleting(true);
    const mode = deleteMode;
    requestDelete(mode)
      .then((r) => {
        setDeleteMode(null);
        setSelected(null);
        setDetail(null);
        if (mode !== "filter") {
          setSelectedHosts([]);
          setPickerOpen(false);
        }
        if (mode === "all") {
          // Reclaimed space is the whole point of compacting an emptied index, so say so.
          const reclaimed = r.reclaimed ?? 0;
          const freed = reclaimed > 0 ? ui("screen.6960a3f6384445", { v0: fmtBytes(reclaimed) }) : "";
          toast.success(ui("screen.38496069e0a73b", { v0: r.deleted, v1: freed }));
        }
        setPage(0);
        setReloadTick((t) => t + 1);
      })
      .catch((e) => {
        // Keep the confirmation open so the user can retry a failed deletion.
        if (mode === "all") toast.error(ui("screen.3a6ecda56c2904", { v0: (e as Error).message }));
      })
      .finally(() => setDeleting(false));
  };

  // Lazy-load the raw request/response for the selected exchange.
  React.useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetail(null);
    api
      .trafficExchange(selected.id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setDetail({ req: liveUI("screen.68bf9e536ea4fb"), resp: "" });
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected, liveUI]);

  async function openRepeater(flows: TrafficExchange[]) {
    if (!flows.length || importLock.current) return;
    importLock.current = true;
    setImporting(true);
    let imported = 0;
    try {
      // Sequential loading limits pressure when a whole page is selected. A bad
      // capture does not discard drafts imported successfully before it.
      for (const flow of flows) {
        try {
          const raw = await api.trafficExchange(flow.id);
          seedFromEvidence(
            requestFromTraffic(raw.req, flow),
            { label: ui("screen.0590a3959d138f", { v0: flow.id }) },
            { title: `${flow.method} ${flow.host}` },
          );
          imported += 1;
        } catch (error) {
          toast.error(`${flow.host}：${(error as Error).message}`);
        }
      }
      if (imported) {
        toast.success(ui("screen.088cfdca89e540", { v0: imported }));
        setSelected(null);
        router.push("/function/repeater");
      }
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  }

  // Toggle direction when re-clicking the active column, else sort the new column
  // newest/largest-first.
  const toggleSort = (field: SortField) =>
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "desc" },
    );

  const exchanges = React.useMemo(() => traffic?.exchanges ?? [], [traffic]);
  const total = traffic?.total ?? exchanges.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const rangeStart = total === 0 ? 0 : page * size + 1;
  const rangeEnd = page * size + exchanges.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{ui("screen.81a9d0b5a2a24f")}</h1>
          <p className="text-muted-foreground text-sm">
            {taskScoped ? ui("screen.b59cef826dcb71") : ui("screen.023b708247de16")}
          </p>
          {taskScoped && traffic && !traffic.enabled ? (
            <p className="text-amber-600 text-xs dark:text-amber-400">{ui("screen.c7704b52416f68")}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
              traffic?.enabled
                ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "border-transparent bg-muted text-muted-foreground",
            )}
          >
            <RadioTowerIcon className="size-3.5" />
            {traffic?.enabled ? ui("screen.2224a30ee2cdf9") : ui("screen.a8c3698b5b8c48")}
          </span>
          {traffic?.proxy && <span className="font-mono text-xs text-muted-foreground">{traffic.proxy}</span>}
          <span className="text-xs text-muted-foreground">
            {ui("screen.76e547a8fa5463")}
            <span className="tabular-nums">{traffic?.count ?? 0}</span> {ui("screen.f004f1d84cf962")}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!taskScoped && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <ListChecksIcon className="size-3.5" />
                {selectedHosts.length > 0
                  ? ui("screen.b1e47beadfd16f", { v0: selectedHosts.length })
                  : ui("screen.d0dfdbc61da230")}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[calc(100vw-2rem)] p-0 data-open:animate-none data-closed:animate-none sm:w-80"
              align="start"
              collisionPadding={16}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">{ui("screen.0e6c18682bee41")}</span>
                <div className="flex items-center gap-1">
                  {hosts.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setHostCountSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
                          aria-label={
                            hostCountSortDirection === "desc"
                              ? ui("screen.9c09feb6321670")
                              : ui("screen.fee4f789fe317c")
                          }
                        >
                          {hostCountSortDirection === "desc" ? <ArrowDownWideNarrowIcon /> : <ArrowUpNarrowWideIcon />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {ui("screen.1d69013fdfc36b")}
                        {hostCountSortDirection === "desc" ? ui("screen.7fd0cf65b630d3") : ui("screen.6d91624318cd6e")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {hosts.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setSelectedHosts(allSelected ? [] : hosts.map((h) => h.host))}
                    >
                      {allSelected ? ui("screen.f4d4bae588c4c0") : ui("screen.3a5040b68abf75")}
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {hosts.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {ui("screen.d9b44442e02e8c")}
                  </div>
                ) : (
                  sortedHosts.map((h, index) => (
                    <label
                      key={h.host}
                      htmlFor={`traffic-host-${index}`}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        id={`traffic-host-${index}`}
                        checked={selectedHosts.includes(h.host)}
                        onCheckedChange={() =>
                          setSelectedHosts((prev) =>
                            prev.includes(h.host) ? prev.filter((x) => x !== h.host) : [...prev, h.host],
                          )
                        }
                      />
                      <span className="truncate font-mono">{h.host}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{h.count}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="border-t p-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={selectedHosts.length === 0}
                  onClick={() => {
                    setDeleteMode("selected");
                    setPickerOpen(false);
                  }}
                >
                  {ui("screen.88b78952c85ed9")}
                  {selectedHosts.length}
                  {ui("punctuation.f2e44c6c95")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <div className="relative w-48">
          <Input placeholder="host…" value={host} onChange={(e) => setHost(e.target.value)} className="h-8" />
        </div>
        {!taskScoped && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            disabled={!hostQ || deleting}
            title={hostQ ? undefined : ui("screen.28527602429cf4")}
            onClick={() => setDeleteMode("filter")}
          >
            <Trash2Icon className="size-3.5" />
            {ui("screen.967568fd42269f")}
          </Button>
        )}
        {/* Outline rather than a second destructive button: this one ignores every
            filter, so it must not look one mis-click away from "删除该目标". */}
        {!taskScoped && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!traffic?.count || deleting}
            title={traffic?.count ? ui("screen.6e3ee1bd5ec3c5") : ui("screen.cd7dfff78c06d7")}
            onClick={() => setDeleteMode("all")}
          >
            <EraserIcon className="size-3.5" />
            {ui("screen.1b590914091ca1")}
          </Button>
        )}
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={ui("screen.4da8755f77bbac")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder={ui("screen.22b9f0b6621280")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ui("screen.470f9e522dbc29")}</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {ui("screen.785e3cd53901f4")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {rangeStart}–{rangeEnd} / {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {/* Advanced filters (issue #177): narrow 660k+ exchanges down to the one packet. */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
        <span className="pl-1 text-xs font-medium text-muted-foreground">{ui("screen.97a1d7b98ba6de")}</span>
        <div className="relative w-56">
          <Input
            placeholder={ui("screen.5cba4dfcb02d73")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="relative w-52">
          <Input
            placeholder={ui("screen.acdead918ec785")}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="h-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder={ui("screen.06f7d73412128f")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ui("screen.27554bb50ad8e5")}</SelectItem>
            {STATUS_BUCKETS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{ui("screen.71150dc5f9bf29")}</span>
          <Input
            type="number"
            min={0}
            placeholder={ui("screen.81ccd8b89d0289")}
            value={respMin}
            onChange={(e) => setRespMin(e.target.value)}
            className="h-8 w-24"
          />
          <span>–</span>
          <Input
            type="number"
            min={0}
            placeholder={ui("screen.c0191c7ae4b381")}
            value={respMax}
            onChange={(e) => setRespMax(e.target.value)}
            className="h-8 w-24"
          />
        </div>
        {hasAdvancedFilter ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={resetAdvancedFilters}>
            <FilterXIcon className="size-3.5" />
            {ui("screen.657d9cbf45ec9e")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {ui("screen.7ecf1cde648680")}
          {selectedFlows.size} {ui("screen.68b6937344542d")}
        </span>
        <Button variant="outline" size="sm" disabled={selectedFlows.size === 0} onClick={() => setLinking(true)}>
          {ui("screen.ab5bc41d5f9382")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedFlows.size === 0 || importing}
          onClick={() => void openRepeater([...selectedFlows.values()])}
        >
          {importing ? ui("screen.73a589a315aab8") : ui("screen.f69052b85f5594")}
        </Button>
        {selectedFlows.size > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setSelectedFlows(new Map())}>
            {ui("screen.a3c9748924640c")}
          </Button>
        ) : null}
      </div>
      {/* History table */}
      <div className="flex h-[calc(100vh-15rem)] min-h-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={ui("screen.7f7a0502cab321")}
                      checked={exchanges.length > 0 && exchanges.every((e) => selectedFlows.has(e.id))}
                      onCheckedChange={(checked) =>
                        setSelectedFlows((previous) => {
                          const next = new Map(previous);
                          for (const e of exchanges) {
                            if (checked === true) next.set(e.id, e);
                            else next.delete(e.id);
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                  <TableHead className="w-44">{ui("screen.1079886b92d48a")}</TableHead>
                  <SortableHead
                    field="ts"
                    label={ui("screen.8b6ff498515bcc")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    className="w-36"
                  />
                  <TableHead className="w-44">host</TableHead>
                  <TableHead className="w-20">{ui("screen.22b9f0b6621280")}</TableHead>
                  <TableHead>URL</TableHead>
                  <SortableHead
                    field="status"
                    label={ui("screen.06f7d73412128f")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    className="w-20"
                  />
                  <TableHead className="w-36">content-type</TableHead>
                  <SortableHead
                    field="resp_len"
                    label={ui("screen.71150dc5f9bf29")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    align="right"
                    className="w-24 text-right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exchanges.map((e) => (
                  <TableRow
                    key={e.id}
                    className={cn("cursor-pointer", selected?.id === e.id && "bg-accent hover:bg-accent")}
                    onClick={() => setSelected(e)}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={ui("screen.be085904b7f30c", { v0: e.id })}
                        checked={selectedFlows.has(e.id)}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) =>
                          setSelectedFlows((previous) => {
                            const next = new Map(previous);
                            if (checked === true) next.set(e.id, e);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TrafficID id={e.id} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(e.ts, ui)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.host}</TableCell>
                    <TableCell>
                      <MethodBadge method={e.method} />
                    </TableCell>
                    <TableCell className="max-w-0">
                      <span className="block truncate font-mono text-xs">{e.url}</span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("font-mono text-xs font-semibold tabular-nums", statusTone(e.status))}>
                        {e.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.content_type}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtBytes(e.resp_len)}</TableCell>
                  </TableRow>
                ))}
                {exchanges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                      {traffic === null ? ui("screen.4927a53bcc886a") : ui("screen.2e8f51bea742fa")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {linking ? (
        <LinkTrafficDialog
          trafficIds={[...selectedFlows.keys()]}
          onClose={() => setLinking(false)}
          onBound={() => setSelectedFlows(new Map())}
        />
      ) : null}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full! max-w-none! gap-0 p-0 sm:w-[72rem]! sm:max-w-[72rem]!">
          {selected && (
            <>
              <SheetHeader className="border-b px-5 py-4">
                <div className="flex items-center gap-2 pr-8">
                  <MethodBadge method={selected.method} />
                  <Badge variant="secondary" className={cn("font-mono tabular-nums", statusTone(selected.status))}>
                    {selected.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmtTime(selected.ts, ui)}</span>
                </div>
                <SheetTitle className="break-all font-mono">{selected.host}</SheetTitle>
                <SheetDescription className="break-all font-mono">{selected.url}</SheetDescription>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {ui("screen.426b811ca45fb8")}
                  <TrafficID id={selected.id} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-fit"
                  disabled={importing}
                  onClick={() => void openRepeater([selected])}
                >
                  {importing ? ui("screen.73a589a315aab8") : ui("screen.f69052b85f5594")}
                </Button>
              </SheetHeader>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-2 sm:grid-cols-2">
                {[
                  ["request", ui("screen.719dd828ca88c8"), requestWithHost(detail?.req ?? "", selected)],
                  ["response", ui("screen.946902266aa212"), detail?.resp ?? ""],
                ].map(([key, label, raw]) => (
                  <div key={key} className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden">
                    <span className="px-1 text-[11px] font-medium text-muted-foreground">{label}</span>
                    {detailLoading ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-md border bg-muted/10 text-xs text-muted-foreground">
                        <Loader2Icon className="size-3.5 animate-spin" />
                        {ui("screen.8382563d05503e")}
                      </div>
                    ) : (
                      <HttpCodeBlock raw={raw} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteMode !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "all" && (
                <>
                  {ui("screen.f756f5dec5b5c3")}
                  <span className="font-semibold tabular-nums">{traffic?.count ?? 0}</span>{" "}
                  {ui("screen.0a94e6bbe20981")}
                  <br />
                  <span className="text-muted-foreground">{ui("screen.057cc97c1f3669")}</span>
                </>
              )}
              {deleteMode === "selected" && (
                <>
                  {ui("screen.cf89e2d397024a")}
                  <span className="font-semibold tabular-nums">{selectedHosts.length}</span>{" "}
                  {ui("screen.796083e945b112")}
                  <span className="font-mono">
                    {selectedHosts.slice(0, 3).join("、")}
                    {selectedHosts.length > 3 ? "…" : ""}
                  </span>
                  {ui("screen.0a73ec12397eb2")}
                </>
              )}
              {deleteMode === "filter" && (
                <>
                  {ui("screen.9bbb71c95e0271")}
                  <span className="font-mono font-semibold">{hostQ}</span> {ui("screen.09a4cb59071655")}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? ui("screen.9afff630f8de55", { v0: deleteVerb })
                : ui("screen.22d91d9657a582", { v0: deleteVerb })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
