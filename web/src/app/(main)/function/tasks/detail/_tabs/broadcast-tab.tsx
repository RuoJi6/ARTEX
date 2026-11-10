"use client";
import * as React from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  BugIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  FlagIcon,
  FlaskConicalIcon,
  LayersIcon,
  LightbulbIcon,
  type LucideIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  TargetIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { type Tone, toneClasses, toneDot } from "@/lib/status";
import { taskAssetTypeLabel } from "@/lib/task-assets";
import type { Edge, ExploreKind, FindingAsset, NewAssetType, TaskNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [20, 50, 100];
const POLL_MS = 8000;

type KindMeta = { label: string; icon: LucideIcon; dot: string; chip: string };

// 播报板自己的展示元数据。刻意不复用探索链路图那份:图是拓扑视角(节点卡片、连线配色),
// 播报是流水视角(时间轴行),两边的信息密度和配色需求不同,各自演进更省事。
const KIND_META = (ui: UITranslate): Record<string, KindMeta> => ({
  begin: {
    label: ui("screen.5491701e1c3a8c"),
    icon: FlagIcon,
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  task: {
    label: ui("screen.4eee0f3f31e245"),
    icon: FlagIcon,
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  goal: {
    label: ui("screen.57060c88a36bf3"),
    icon: TargetIcon,
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  intent: {
    label: ui("screen.8edf354cc37206"),
    icon: CompassIcon,
    dot: "bg-blue-500",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  fact: {
    label: ui("screen.be0d338c857893"),
    icon: FlaskConicalIcon,
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  finding: {
    label: ui("screen.b0475a364bcbc5"),
    icon: BugIcon,
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  hint: {
    label: ui("screen.f56c6c82203b33"),
    icon: LightbulbIcon,
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  digest: {
    label: ui("screen.a22879cda61a8d"),
    icon: LayersIcon,
    dot: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
});

// 可筛选的类型。起点(fact/state=origin)不单独列,它跟着「事实」一起过滤。
const FILTER_KINDS: ExploreKind[] = ["goal", "intent", "fact", "finding", "hint", "digest"];

const REL_LABEL = (ui: UITranslate): Record<string, string> => ({
  spawns: ui("screen.47c097841ba5a1"),
  derived_from: ui("screen.957403b772c0fe"),
  yields: ui("screen.4c97f9db086dc1"),
  proves: ui("screen.90b793146f0590"),
  covers: ui("screen.a22879cda61a8d"),
});

// goal / intent 的状态语义由全局 status 表提供(StatusBadge);其余类型的状态只在
// 图和播报里出现,这里补一份。
const STATE_META = (ui: UITranslate): Record<string, Record<string, { label: string; tone: Tone }>> => ({
  fact: {
    origin: { label: ui("screen.5491701e1c3a8c"), tone: "slate" },
    confirmed: { label: ui("screen.d56a511f498f7e"), tone: "green" },
    dismissed: { label: ui("screen.22110e723d26c5"), tone: "slate" },
  },
  finding: {
    confirmed: { label: ui("screen.d56a511f498f7e"), tone: "red" },
    dismissed: { label: ui("screen.c6f3c8b82c2491"), tone: "slate" },
  },
  hint: {
    active: { label: ui("screen.e052431bc7a187"), tone: "violet" },
    consumed: { label: ui("screen.b00a76bfc6f5df"), tone: "slate" },
  },
  digest: {
    active: { label: ui("screen.317c984c99efcf"), tone: "green" },
    superseded: { label: ui("screen.3bcdf755497339"), tone: "slate" },
  },
});

// 任务根是 state=origin 的 fact,播报里读作「起点」。
function viewKind(n: TaskNode): string {
  return n.type === "fact" && n.state === "origin" ? "begin" : n.type;
}

const SUMMARY_FIELDS: Record<string, string[]> = {
  begin: ["summary", "description"],
  task: ["summary", "description"],
  goal: ["text"],
  intent: ["summary"],
  fact: ["summary"],
  finding: ["name", "summary"],
  hint: ["text", "summary"],
  digest: ["body", "summary"],
};

function summaryOf(n: TaskNode): string {
  const raw = n.payload ?? "";
  if (!raw.trim()) return "";
  for (const field of SUMMARY_FIELDS[viewKind(n)] ?? []) {
    try {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        const v = (obj as Record<string, unknown>)[field];
        if (typeof v === "string" && v.trim()) return v;
      }
    } catch {
      return raw; // 非 JSON payload:原样播报
    }
  }
  return raw;
}

function prettyPayload(raw: string | undefined, ui: UITranslate): string {
  if (!raw?.trim()) return ui("screen.1f44183f17e00c");
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function relTime(ts: number, now: number, ui: UITranslate): string {
  if (!now || !ts) return "";
  const sec = Math.max(0, (now - ts) / 1000);
  if (sec < 60) return ui("screen.de6785d99e0289");
  if (sec < 3600) return ui("screen.d802d53cbfbf16", { v0: Math.floor(sec / 60) });
  if (sec < 86400) return ui("screen.652624eeaa4601", { v0: Math.floor(sec / 3600) });
  return ui("screen.3d7fd62e22c08e", { v0: Math.floor(sec / 86400) });
}

const dayFmt = (ui: UITranslate) =>
  new Intl.DateTimeFormat(ui("screen.91610255157661"), { month: "long", day: "numeric", weekday: "short" });
const clockFmt = (ui: UITranslate) =>
  new Intl.DateTimeFormat(ui("screen.91610255157661"), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

function NodeStateBadge({ node }: { node: TaskNode }) {
  const { ui } = useUITranslation();

  if (node.type === "goal") return <StatusBadge domain="goal" value={node.state} dot />;
  if (node.type === "intent") return <StatusBadge domain="intent" value={node.state} dot />;
  const meta = STATE_META(ui)[node.type]?.[node.state];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[meta.tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneDot[meta.tone])} />
      {meta.label}
    </span>
  );
}

function KindChip({ kind }: { kind: string }) {
  const { ui } = useUITranslation();

  const meta = KIND_META(ui)[kind] ?? KIND_META(ui).fact;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", meta.chip)}>{meta.label}</span>
  );
}

// 节点锚定的资产:类型标签 + 可辨识文本。数据随播报页一起下发(node id → 资产),
// 展开时直接展示,不额外请求。
function AssetList({ assets, dense = false }: { assets: FindingAsset[]; dense?: boolean }) {
  const { ui } = useUITranslation();

  if (assets.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {ui("screen.43dd7390ec1c18")}
        {assets.length}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {assets.map((a) => {
          // 运行时 a.type 可能是标签表未覆盖的类型,退回原始字符串。转一层类型让回退不被判成多余。
          const typeLabel =
            (taskAssetTypeLabel as (t: NewAssetType) => string | undefined)(a.type as NewAssetType) || a.type;
          return (
            <li
              key={a.id}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5",
                dense && "text-xs",
              )}
              title={`${typeLabel} · ${a.label}`}
            >
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{typeLabel}</span>
              <code className="truncate font-mono text-xs">{a.label}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 悬停在上下游条目上时弹出的节点名片:类型/状态/来源/时间 + 摘要 + payload 片段 + 涉及资产。
// 数据来自本页已经拿到的 refs,不额外发请求——播报接口已经把邻居节点整份带回来了。
function RelatedNodeCard({ node, assets }: { node: TaskNode; assets: FindingAsset[] }) {
  const { ui } = useUITranslation();

  const kind = viewKind(node);
  const meta = KIND_META(ui)[kind] ?? KIND_META(ui).fact;
  const ts = Date.parse(node.ts);
  const summary = summaryOf(node);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip kind={kind} />
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{node.id}</code>
        <NodeStateBadge node={node} />
        {node.priority > 0 && (kind === "goal" || kind === "intent") && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">P{node.priority}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {ui("screen.ba40014ff496f6")}
          {meta.label}
        </span>
        <span>
          {ui("screen.a488e93d69cc12")}
          {node.origin || "system"}
        </span>
        <span>{Number.isNaN(ts) ? node.ts : new Date(ts).toLocaleString(ui("screen.91610255157661"))}</span>
      </div>
      <p className="line-clamp-4 text-xs break-words">{summary || ui("screen.e0cea5c3049cb8")}</p>
      <AssetList assets={assets} dense />
      <pre className="max-h-40 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
        {prettyPayload(node.payload, ui)}
      </pre>
    </div>
  );
}

// 一条播报涉及的上下游:上游 = 指向本节点的边,下游 = 本节点指出去的边。
function RelatedList({
  title,
  rows,
  refs,
  assets,
}: {
  title: string;
  rows: Array<{ rel: string; id: string }>;
  refs: Record<string, TaskNode>;
  assets: Record<string, FindingAsset[]>;
}) {
  const { ui } = useUITranslation();

  if (rows.length === 0) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const node = refs[row.id];
          return (
            <li key={`${row.rel}-${row.id}`} className="flex min-w-0 items-center gap-2 text-xs">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {REL_LABEL(ui)[row.rel] ?? row.rel}
              </span>
              {node ? (
                <HoverCard openDelay={150} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 cursor-help items-center gap-2 text-left hover:underline"
                    >
                      <KindChip kind={viewKind(node)} />
                      <span className="truncate">
                        {summaryOf(node) || ui("screen.fd5cd9b2448cd1", { v0: node.id })}
                      </span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" className="w-96">
                    <RelatedNodeCard node={node} assets={assets[node.id] ?? []} />
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <span className="text-muted-foreground">
                  {ui("screen.35970a35ec84a5")}
                  {row.id}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BroadcastRow({
  node,
  edges,
  refs,
  assets,
  now,
  fresh,
}: {
  node: TaskNode;
  edges: Edge[];
  refs: Record<string, TaskNode>;
  assets: Record<string, FindingAsset[]>;
  now: number;
  fresh: boolean;
}) {
  const { ui } = useUITranslation();

  const [open, setOpen] = React.useState(false);
  const kind = viewKind(node);
  const meta = KIND_META(ui)[kind] ?? KIND_META(ui).fact;
  const Icon = meta.icon;
  const ts = Date.parse(node.ts);
  const summary = summaryOf(node);
  const upstream = edges.filter((e) => e.dst === node.id).map((e) => ({ rel: e.rel, id: e.src }));
  const downstream = edges.filter((e) => e.src === node.id).map((e) => ({ rel: e.rel, id: e.dst }));

  return (
    <div className={cn("relative grid grid-cols-[4.5rem_1.75rem_1fr] gap-x-2", fresh && "bg-primary/5")}>
      {/* 时间列 */}
      <div className="py-3 text-right text-xs text-muted-foreground tabular-nums">
        <div>{Number.isNaN(ts) ? "--:--:--" : clockFmt(ui).format(ts)}</div>
        <div className="text-[11px] opacity-70">{relTime(ts, now, ui)}</div>
      </div>

      {/* 时间轴:竖线 + 类型圆点 */}
      <div className="relative flex justify-center">
        <span className="absolute inset-y-0 w-px bg-border" />
        <span
          className={cn(
            "relative mt-3.5 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-background",
            meta.dot,
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>

      {/* 内容列 */}
      <div className="min-w-0 border-b py-3 pr-1 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full min-w-0 items-start gap-2 text-left"
        >
          <ChevronRightIcon
            className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <KindChip kind={kind} />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{node.id}</code>
              <NodeStateBadge node={node} />
              {node.priority > 0 && (kind === "goal" || kind === "intent") && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">P{node.priority}</span>
              )}
              {fresh && (
                <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {ui("screen.3cc493bc5b3b9b")}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{node.origin || "system"}</span>
            </div>
            <p className={cn("mt-1 text-sm", !open && "line-clamp-2")}>
              {summary || ui("screen.fd5cd9b2448cd1", { v0: node.id })}
            </p>
          </div>
        </button>

        {open && (
          <div className="mt-2 ml-5 flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {ui("screen.2410d860f093b7")}
                <code className="font-mono">#{node.id}</code>
              </span>
              <span>
                {ui("screen.ba40014ff496f6")}
                {meta.label}
              </span>
              <span>
                {ui("screen.a488e93d69cc12")}
                {node.origin || "system"}
              </span>
              <span>{Number.isNaN(ts) ? node.ts : new Date(ts).toLocaleString(ui("screen.91610255157661"))}</span>
            </div>
            {node.state === "deleted" && node.delete_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                <span className="font-medium text-destructive">{ui("screen.bc4e7c36df412a")}</span>
                <span className="ml-2 break-words text-muted-foreground">{node.delete_reason}</span>
              </div>
            )}
            <AssetList assets={assets[node.id] ?? []} />
            {(upstream.length > 0 || downstream.length > 0) && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <RelatedList title={ui("screen.d6d276a7314cbb")} rows={upstream} refs={refs} assets={assets} />
                <RelatedList title={ui("screen.abf913ab69a8ae")} rows={downstream} refs={refs} assets={assets} />
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">payload</div>
              <pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                {prettyPayload(node.payload, ui)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BroadcastTab({ taskId }: { taskId: string }) {
  const { ui } = useUITranslation();

  const [kinds, setKinds] = React.useState<ExploreKind[]>([]);
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [order, setOrder] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(20);
  const [live, setLive] = React.useState(true);

  const [items, setItems] = React.useState<TaskNode[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [refs, setRefs] = React.useState<Record<string, TaskNode>>({});
  const [assets, setAssets] = React.useState<Record<string, FindingAsset[]>>({});
  const [total, setTotal] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const [freshIDs, setFreshIDs] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(0);
  const [now, setNow] = React.useState(0);

  const seenRef = React.useRef<Set<string>>(new Set());
  const baselineRef = React.useRef<number | null>(null);
  const streamRef = React.useRef("");
  // 只有「最新在前的第 1 页」才是真正的直播位；其余位置轮询只更新未读计数，
  // 不动列表，免得翻页/展开时内容在脚下变。
  const atLive = page === 1 && order === "desc";

  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // 输入防抖:打字停 300ms 才真正查询,并回到第一页。
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  React.useEffect(() => {
    let alive = true;
    let rendered = false; // 本次查询是否已经把内容渲染出来过
    // 换任务/筛选/排序 = 换了一条播报流:清掉「新」标记和未读基线。翻页不算换流,
    // 否则回到最新时就没有未读计数可算了。
    const stream = `${taskId}|${kinds.join(",")}|${query}|${order}`;
    if (streamRef.current !== stream) {
      streamRef.current = stream;
      seenRef.current = new Set();
      baselineRef.current = null;
      setPending(0);
    }
    const load = () =>
      api
        .explorationNodes(taskId, { page, size, kinds, q: query, order })
        .then((r) => {
          if (!alive) return;
          // 直播位每轮都刷新;其它位置只渲染第一次,之后轮询仅更新未读计数。
          if (atLive || !rendered) {
            rendered = true;
            setItems(r.items);
            setEdges(r.edges);
            setRefs(r.refs);
            setAssets(r.assets);
          }
          setTotal(r.total);
          if (atLive) {
            const seen = seenRef.current;
            setFreshIDs(seen.size === 0 ? new Set() : new Set(r.items.filter((n) => !seen.has(n.id)).map((n) => n.id)));
            seenRef.current = new Set(r.items.map((n) => n.id));
            baselineRef.current = r.total;
            setPending(0);
          } else {
            const base = baselineRef.current;
            setPending(base === null ? 0 : Math.max(0, r.total - base));
          }
          setLoaded(true);
        })
        .catch(() => {
          // 轮询是尽力而为:保留上一次成功的播报内容,下一轮自动重试。
        });
    void load();
    if (!live) {
      return () => {
        alive = false;
      };
    }
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [taskId, page, size, kinds, query, order, live, atLive]);

  const toggleKind = (kind: ExploreKind) => {
    setKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
    setPage(1);
  };

  const backToLive = () => {
    setPage(1);
    setOrder("desc");
    setPending(0);
  };

  // 服务端的 refs 只补「不在本页的邻居」,同页节点之间的引用要靠 items 自己兜底,
  // 否则相邻两条播报互相引用时会退化成光秃秃的「节点 #id」。
  const nodeIndex = React.useMemo(() => {
    const idx: Record<string, TaskNode> = { ...refs };
    for (const n of items) idx[n.id] = n;
    return idx;
  }, [refs, items]);

  const pageCount = Math.max(1, Math.ceil(total / size));
  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = (page - 1) * size + items.length;

  // 换任务或筛选后条数变少时,把越界的页码收回来。
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // 按天分组:播报流按日期断行,长任务翻页时还能认出「这是哪天的事」。
  const groups: Array<{ day: string; rows: TaskNode[] }> = [];
  for (const node of items) {
    const ts = Date.parse(node.ts);
    const day = Number.isNaN(ts) ? ui("screen.a3f1cde9f177e2") : dayFmt(ui).format(ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(node);
    else groups.push({ day, rows: [node] });
  }

  return (
    <Card className="overflow-hidden py-0">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={ui("screen.90cde35737c0bf")}
            className="h-8 pl-8"
            aria-label={ui("screen.1aa5781ebca0c9")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_KINDS.map((kind) => {
            const meta = KIND_META(ui)[kind];
            const active = kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={active}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                  active ? meta.chip : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                {meta.label}
              </button>
            );
          })}
          {kinds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setKinds([]);
                setPage(1);
              }}
            >
              {ui("screen.bce2377283c245")}
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setOrder((o) => (o === "desc" ? "asc" : "desc"));
              setPage(1);
            }}
            aria-label={order === "desc" ? ui("screen.23dc624f699777") : ui("screen.f35474133ac9c4")}
          >
            {order === "desc" ? <ArrowDownIcon /> : <ArrowUpIcon />}
            {order === "desc" ? ui("screen.c2fb4c34d47102") : ui("screen.c7a4163933cfbf")}
          </Button>
          <Button
            variant={live ? "outline" : "secondary"}
            size="sm"
            className="h-8"
            onClick={() => setLive((v) => !v)}
            aria-label={live ? ui("screen.0dc83c30ce7a87") : ui("screen.cc68cc58f0a751")}
          >
            {live ? <PauseIcon /> : <PlayIcon />}
            {live ? ui("screen.98073e15fa0329") : ui("screen.eb0c326b60ae89")}
          </Button>
        </div>
      </div>

      {/* 离开直播位时的未读提示 */}
      {!atLive && pending > 0 && (
        <button
          type="button"
          onClick={backToLive}
          className="flex w-full items-center justify-center gap-1.5 border-b bg-primary/10 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
        >
          <ArrowUpToLineIcon className="size-3.5" />
          {pending > 99 ? "99+" : pending} {ui("screen.7bdac7736ca87e")}
        </button>
      )}

      <CardContent className="px-4 py-0">
        {!loaded ? (
          <div className="flex flex-col gap-3 py-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query || kinds.length > 0 ? ui("screen.e8fef2ad9fa99b") : ui("screen.5f778ac662bf71")}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.day}>
              <div className="py-2 pl-[6.25rem] text-xs font-medium text-muted-foreground">{group.day}</div>
              {group.rows.map((node) => (
                <BroadcastRow
                  key={node.id}
                  node={node}
                  edges={edges}
                  refs={nodeIndex}
                  assets={assets}
                  now={now}
                  fresh={freshIDs.has(node.id)}
                />
              ))}
            </div>
          ))
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Select
          value={String(size)}
          onValueChange={(v) => {
            setSize(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {ui("screen.785e3cd53901f4")}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {start}–{end} / {total}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label={ui("screen.c9b9ae7a61444a")}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            aria-label={ui("screen.8a8542f6964852")}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
