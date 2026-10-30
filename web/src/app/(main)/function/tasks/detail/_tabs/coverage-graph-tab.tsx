"use client";

import * as React from "react";
import type { Graph as G6Graph } from "@antv/g6";
import {
  AppWindow,
  Building2,
  ChevronDown,
  ChevronUp,
  Globe,
  Link2,
  type LucideIcon,
  Radio,
  RotateCcw,
  RefreshCw,
  Server,
  Waypoints,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { CoverageAssetRef, CoverageAssetRefs, CoverageGraphEdge, CoverageGraphNode } from "@/lib/types";
import { cn } from "@/lib/utils";

// 每个父节点下、同一类型的子节点默认展示的数量；超出折叠，"展示更多"每次再拉这么多。
const FOLD_LIMIT = 12;
const FOLD_STEP = 12;

type Kind = CoverageGraphNode["kind"];

type Zone = "internet" | "boundary" | "internal";
type CoverageViewMode = "asset" | "network";

const zoneMeta: Record<Zone, { label: string; description: string; className: string }> = {
  internet: {
    label: "互联网区",
    description: "公网域名 / 外部入口",
    className: "bg-sky-50/70 dark:bg-sky-950/20",
  },
  boundary: {
    label: "边界区",
    description: "服务 / 网关 / 暴露面",
    className: "bg-amber-50/70 dark:bg-amber-950/15",
  },
  internal: {
    label: "内网区",
    description: "业务资产 / 应用 / 端点",
    className: "bg-emerald-50/65 dark:bg-emerald-950/15",
  },
};

// 新数据优先使用后端基于地址/暴露证据计算出的权威区域；旧数据没有
// zone 时才使用类型回退，避免公网 endpoint 被类型规则误放到内网。
function zoneOf(node: CoverageGraphNode): Zone {
  if (node.zone === "internet" || node.zone === "boundary" || node.zone === "internal") {
    return node.zone;
  }
  if (node.kind === "company" || node.kind === "root_domain" || node.kind === "subdomain" || node.kind === "ip") {
    return "internet";
  }
  if (node.kind === "service") return "boundary";
  return "internal";
}

type KindMeta = { label: string; icon: LucideIcon; iconBg: string; hex: string; size: number };

const kindMeta: Record<Kind, KindMeta> = {
  company: { label: "公司", icon: Building2, iconBg: "bg-slate-500", hex: "#64748b", size: 46 },
  root_domain: { label: "根域名", icon: Globe, iconBg: "bg-indigo-500", hex: "#6366f1", size: 38 },
  subdomain: { label: "子域名", icon: Waypoints, iconBg: "bg-blue-500", hex: "#3b82f6", size: 30 },
  ip: { label: "IP", icon: Server, iconBg: "bg-cyan-600", hex: "#0891b2", size: 28 },
  service: { label: "服务", icon: Radio, iconBg: "bg-amber-500", hex: "#f59e0b", size: 26 },
  app: { label: "App", icon: AppWindow, iconBg: "bg-fuchsia-500", hex: "#d946ef", size: 26 },
  endpoint: { label: "端点", icon: Link2, iconBg: "bg-rose-500", hex: "#f43f5e", size: 20 },
};

// G6 节点图标用平台一致的 lucide 图标：把 lucide 的 SVG 路径（v1.22）渲染成白色描边的
// data URI，作为节点 iconSrc（白色在实色/灰色底上都清晰）。手写内嵌，避免 react-dom/server
// 在 React19/Next 客户端打包的问题。
function svgUri(inner: string, filled = false): string {
  const attrs = filled
    ? 'fill="#fff" stroke="none"'
    : 'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const KIND_ICON: Record<Kind, string> = {
  company: svgUri(
    '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  ),
  root_domain: svgUri(
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  ),
  subdomain: svgUri(
    '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>',
  ),
  ip: svgUri(
    '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  ),
  service: svgUri(
    '<path d="M16.247 7.761a6 6 0 0 1 0 8.478"/><path d="M19.075 4.933a10 10 0 0 1 0 14.134"/><path d="M4.925 19.067a10 10 0 0 1 0-14.134"/><path d="M7.753 16.239a6 6 0 0 1 0-8.478"/><circle cx="12" cy="12" r="2"/>',
  ),
  app: svgUri(
    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
  ),
  endpoint: svgUri(
    '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  ),
};

type DatabaseEngine = "mysql" | "sqlserver" | "postgres" | "redis" | "database";

const DATABASE_ICON: Record<DatabaseEngine, string> = {
  mysql: svgUri('<text x="12" y="15" text-anchor="middle" font-size="8" font-weight="700">MY</text>', true),
  sqlserver: svgUri('<text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700">MS</text>', true),
  postgres: svgUri('<text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700">PG</text>', true),
  redis: svgUri('<text x="12" y="15" text-anchor="middle" font-size="8" font-weight="700">RD</text>', true),
  database: svgUri('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v9c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
};

function databaseEngine(node: CoverageGraphNode): DatabaseEngine | null {
  const raw = `${node.service_type ?? ""} ${node.label} ${node.page_title ?? ""}`.toLowerCase();
  if (/mysql|mariadb/.test(raw)) return "mysql";
  if (/sql\s*server|mssql|microsoft sql/.test(raw)) return "sqlserver";
  if (/postgres|postgresql/.test(raw)) return "postgres";
  if (/redis/.test(raw)) return "redis";
  if (/database|数据库|dbms|oracle|mongodb|mongo|clickhouse/.test(raw)) return "database";
  return null;
}

const FOLD_ICON = svgUri(
  '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  true,
);

// ---------------------------------------------------------------------------
// Folding: full graph → currently-visible node/edge set (自顶向下级联折叠)。
// ---------------------------------------------------------------------------
type FoldNode = {
  fold: true;
  key: string;
  groupId: string;
  parentKey: string;
  kind: Kind;
  hidden: CoverageGraphNode[];
};
type AssetRenderNode = { fold: false; key: string; kind: Kind; node: CoverageGraphNode };
type RenderNode = AssetRenderNode | FoldNode;

function sortChildren(a: CoverageGraphNode, b: CoverageGraphNode): number {
  if (a.tested !== b.tested) return a.tested ? -1 : 1;
  return (a.label || "").localeCompare(b.label || "");
}

function computeVisible(
  nodes: CoverageGraphNode[],
  edges: CoverageGraphEdge[],
  expanded: Map<string, number>,
  showAllNetworkNodes = false,
): { renderNodes: RenderNode[]; renderEdges: CoverageGraphEdge[] } {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!byKey.has(e.src) || !byKey.has(e.dst)) continue;
    if (!parentOf.has(e.src)) parentOf.set(e.src, e.dst);
    const arr = childrenOf.get(e.dst);
    if (arr) arr.push(e.src);
    else childrenOf.set(e.dst, [e.src]);
  }

  const renderNodes: RenderNode[] = [];
  const visible = new Set<string>();
  const foldNodes: FoldNode[] = [];

  const queue: string[] = [];
  for (const n of nodes) {
    if (!parentOf.has(n.key)) {
      queue.push(n.key);
      visible.add(n.key);
    }
  }

  for (let qi = 0; qi < queue.length; qi++) {
    const parent = queue[qi];
    const kids = childrenOf.get(parent) ?? [];
    if (kids.length === 0) continue;
    const groups = new Map<Kind, CoverageGraphNode[]>();
    for (const ck of kids) {
      const cn = byKey.get(ck);
      if (!cn) continue;
      const g = groups.get(cn.kind);
      if (g) g.push(cn);
      else groups.set(cn.kind, [cn]);
    }
    for (const [kind, arr] of groups) {
      arr.sort(sortChildren);
      const groupId = `${parent}::${kind}`;
      // Network mode should show the complete topology for ordinary task
      // sizes. Keep folding as a safety valve for very large inventories.
      const shown = showAllNetworkNodes && arr.length <= 80 ? arr.length : (expanded.get(groupId) ?? FOLD_LIMIT);
      const visibleChildren = arr.slice(0, shown);
      const hidden = arr.slice(shown);
      for (const c of visibleChildren) {
        if (!visible.has(c.key)) {
          visible.add(c.key);
          queue.push(c.key);
        }
      }
      if (hidden.length > 0) {
        foldNodes.push({ fold: true, key: `fold:${groupId}`, groupId, parentKey: parent, kind, hidden });
      }
    }
  }

  for (const n of nodes) {
    if (visible.has(n.key)) renderNodes.push({ fold: false, key: n.key, kind: n.kind, node: n });
  }
  const renderEdges: CoverageGraphEdge[] = edges.filter((e) => visible.has(e.src) && visible.has(e.dst));
  for (const f of foldNodes) {
    renderNodes.push(f);
    renderEdges.push({ src: f.key, dst: f.parentKey });
  }
  return { renderNodes, renderEdges };
}

// ---------------------------------------------------------------------------
// G6 数据映射。自定义字段放节点顶层（G6 v5 官方 force 示例约定：style/layout 回调直接读 d.<field>）。
// ---------------------------------------------------------------------------
type G6NodeDatum = {
  id: string;
  kind: Kind;
  fold: boolean;
  tested: boolean;
  inScope: boolean;
  lbl: string;
  size: number;
  active: boolean;
  iconSrc: string;
  x: number;
  y: number;
  // G6 v5 reads the initial position from style.x/style.y. Keeping the
  // coordinates on the datum alone makes every node start at (0, 0), after
  // which fitView magnifies one node and hides the rest.
  style: { x: number; y: number };
};

type G6EdgeDatum = { source: string; target: string; active: boolean };

function trunc(s: string, n = 26): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// 图里的节点文案：服务不显示完整 URL，只显示 端口·标题·状态码；端点只显示 path。
// 其余类型沿用后端给的 label。
function graphLabel(n: CoverageGraphNode, viewMode: CoverageViewMode = "asset"): string {
  if (viewMode === "network") {
    if (n.kind === "endpoint") {
      if (n.url) {
        try {
          return new URL(n.url).pathname || "/";
        } catch {
          /* 非法 URL：回退到资产标签 */
        }
      }
      return n.label || n.domain || n.ip || "端点";
    }
    if (n.kind === "service") {
      const engine = databaseEngine(n);
      const host = n.domain || n.ip || n.label;
      return engine ? `${engine.toUpperCase()} · ${host}${n.port ? `:${n.port}` : ""}` : `${host}${n.port ? `:${n.port}` : ""}`;
    }
    return n.label || n.domain || n.ip || n.app_name || kindMeta[n.kind].label;
  }
  if (n.kind === "service") {
    const parts: string[] = [];
    if (n.port) parts.push(`:${n.port}`);
    if (n.page_title) parts.push(n.page_title);
    if (n.status_code) parts.push(String(n.status_code));
    return parts.length ? parts.join(" · ") : n.domain || n.ip || n.label;
  }
  if (n.kind === "endpoint" && n.url) {
    try {
      return new URL(n.url).pathname || "/";
    } catch {
      /* 非法 URL：回退到完整 label */
    }
  }
  return n.label;
}

function toG6Nodes(
  renderNodes: RenderNode[],
  activeKeys: Set<string>,
  viewMode: CoverageViewMode,
): G6NodeDatum[] {
  const buckets: Record<Zone, RenderNode[]> = { internet: [], boundary: [], internal: [] };
  for (const rn of renderNodes) {
    buckets[rn.fold ? "boundary" : zoneOf(rn.node)].push(rn);
  }
  const maxRows = Math.max(
    ...(["internet", "boundary", "internal"] as Zone[]).map((zone) => Math.ceil(buckets[zone].length / 2)),
    1,
  );
  const virtualHeight = viewMode === "network" ? Math.max(760, maxRows * 78 + 120) : Math.max(760, Math.max(buckets.internet.length, buckets.boundary.length, buckets.internal.length, 1) * 42);
  const positions = new Map<string, { x: number; y: number }>();
  const xByZone: Record<Zone, number> = { internet: 150, boundary: 600, internal: 1050 };
  const xByAssetKind: Partial<Record<Kind, number>> = {
    company: 120,
    root_domain: 180,
    subdomain: 360,
    ip: 520,
    service: 680,
    app: 680,
    endpoint: 1000,
  };
  const placeGrid = (items: RenderNode[], left: number, right: number) => {
    if (items.length === 0) return;
    // Keep the layout deterministic while using multiple columns. A wider
    // graph gets more columns, so large asset groups stop forming a single
    // unreadable vertical chain.
    const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(items.length / 1.5))));
    const rows = Math.ceil(items.length / columns);
    items.forEach((rn, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(rn.key, {
        x: left + ((column + 1) * (right - left)) / (columns + 1),
        y: 70 + ((row + 1) * (virtualHeight - 140)) / (rows + 1),
      });
    });
  };

  if (viewMode === "network") {
    const zoneBounds: Record<Zone, [number, number]> = {
      internet: [35, 415],
      boundary: [485, 865],
      internal: [935, 1315],
    };
    for (const zone of Object.keys(buckets) as Zone[]) {
      const items = [...buckets[zone]].sort((a, b) => {
        const ak = a.fold ? "fold" : a.kind;
        const bk = b.fold ? "fold" : b.kind;
        return ak.localeCompare(bk) || (a.fold ? a.key : a.node.label).localeCompare(b.fold ? b.key : b.node.label);
      });
      // Two generous columns keep long host names readable. A single column is
      // used for short groups so the parent/child relationship remains obvious.
      if (items.length <= 8) {
        items.forEach((rn, index) => positions.set(rn.key, {
          x: (zoneBounds[zone][0] + zoneBounds[zone][1]) / 2,
          y: 90 + ((index + 1) * (virtualHeight - 150)) / (items.length + 1),
        }));
      } else {
        const columns = [zoneBounds[zone][0] + 105, zoneBounds[zone][1] - 105];
        const rows = Math.ceil(items.length / 2);
        items.forEach((rn, index) => positions.set(rn.key, {
          x: columns[index % 2],
          y: 90 + ((Math.floor(index / 2) + 1) * (virtualHeight - 150)) / (rows + 1),
        }));
      }
    }
  } else {
    const byKind = new Map<Kind, RenderNode[]>();
    for (const rn of renderNodes) {
      const group = byKind.get(rn.kind);
      if (group) group.push(rn);
      else byKind.set(rn.kind, [rn]);
    }
    for (const [kind, items] of byKind) {
      const center = xByAssetKind[kind] ?? 600;
      const width = items.length > 1 ? 180 : 0;
      placeGrid(items, center - width / 2, center + width / 2);
    }
  }
  return renderNodes.map((rn) => {
    const position = positions.get(rn.key) ?? { x: 600, y: virtualHeight / 2 };
    if (rn.fold) {
      return {
        id: rn.key,
        kind: rn.kind,
        fold: true,
        tested: false,
        inScope: false,
        lbl: `还有 ${rn.hidden.length} 个${kindMeta[rn.kind].label}`,
        size: 24,
        active: activeKeys.has(rn.key),
        iconSrc: FOLD_ICON,
        style: { x: position.x, y: position.y },
        ...position,
      };
    }
    return {
      id: rn.key,
      kind: rn.kind,
      fold: false,
      tested: rn.node.tested,
      inScope: rn.node.in_scope,
        lbl: `${rn.node.tested ? "✓ " : ""}${trunc(graphLabel(rn.node, viewMode) || kindMeta[rn.kind].label, viewMode === "network" ? (rn.kind === "service" ? 22 : 18) : 26)}`,
      size: kindMeta[rn.kind].size,
      active: activeKeys.has(rn.key),
      iconSrc: viewMode === "network" && databaseEngine(rn.node)
        ? DATABASE_ICON[databaseEngine(rn.node) as DatabaseEngine]
        : KIND_ICON[rn.kind],
      style: { x: position.x, y: position.y },
      ...position,
    };
  });
}

function networkWorldHeight(renderNodes: RenderNode[]): number {
  const counts: Record<Zone, number> = { internet: 0, boundary: 0, internal: 0 };
  for (const node of renderNodes) counts[node.fold ? "boundary" : zoneOf(node.node)] += 1;
  return Math.max(760, Math.max(Math.ceil(counts.internet / 2), Math.ceil(counts.boundary / 2), Math.ceil(counts.internal / 2), 1) * 78 + 120);
}

// G6 的类型把自定义字段归在 data 下，但官方 force 示例（及运行时）按顶层读 d.<field>。
// 回调形参用 unknown 满足 G6 签名，内部用 nd() 强转回我们的顶层结构。
const nd = (d: unknown) => d as G6NodeDatum;

// 已测=实色高亮；范围内未测=灰；范围外/折叠=更淡的灰 + 虚线描边。
function nodeFill(d: G6NodeDatum): string {
  if (d.fold) return "#f1f5f9";
  if (!d.inScope) return "#e2e8f0";
  if (d.tested) return kindMeta[d.kind].hex;
  return "#94a3b8";
}
function nodeStroke(d: G6NodeDatum): string {
  if (d.active) return "#0f766e";
  if (d.fold || !d.inScope) return "#94a3b8";
  if (d.tested) return "#0f766e";
  return "#64748b";
}

// ---------------------------------------------------------------------------
// 抽屉：资产节点看详情；折叠节点看隐藏列表 + "展示更多"。
// ---------------------------------------------------------------------------
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex items-start gap-3 py-1 text-sm">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="text-foreground min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

function RefList({ title, items }: { title: string; items: CoverageAssetRef[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-muted-foreground mb-1 text-xs font-medium">
        {title}（{items.length}）
      </h4>
      <div className="flex flex-col gap-1">
        {items.map((r) => (
          <div
            key={`${r.kind}-${r.id}`}
            className="flex flex-wrap items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
          >
            <span className="shrink-0 font-mono text-muted-foreground">#{r.id}</span>
            {r.state && <span className="shrink-0 text-muted-foreground">{r.state}</span>}
            <span className="min-w-32 flex-1 break-words text-foreground">{r.summary || "—"}</span>
            {r.inherited && r.source_task_id && (
              <Badge variant="outline" className="shrink-0">
                来源 #{r.source_task_id} · 只读
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetSheet({
  node,
  taskId,
  onOpenChange,
}: {
  node: CoverageGraphNode | null;
  taskId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = node ? kindMeta[node.kind] : null;
  const Icon = meta?.icon;
  const raw = node ? JSON.stringify(node, null, 2) : "";
  const [refs, setRefs] = React.useState<CoverageAssetRefs | null>(null);

  React.useEffect(() => {
    setRefs(null);
    if (!node?.asset_id) return;
    let cancelled = false;
    api
      .taskAssetRefs(taskId, node.asset_id)
      .then((r) => {
        if (!cancelled) setRefs(r);
      })
      .catch(() => {
        /* 无关联或出错：不展示该区块 */
      });
    return () => {
      cancelled = true;
    };
  }, [node, taskId]);
  return (
    <Sheet open={node !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-md">
        {node && meta && Icon && (
          <>
            <SheetHeader className="border-b p-4">
              <div className="flex items-center gap-2.5 pr-8">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm", meta.iconBg)}>
                  <Icon className="size-4 text-white" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="leading-tight">{meta.label}</SheetTitle>
                  <span className="text-muted-foreground truncate font-mono text-xs" title={node.label}>
                    {node.label}
                  </span>
                </div>
              </div>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex w-full min-w-0 flex-col gap-4 p-4">
                <section>
                  <h4 className="text-muted-foreground mb-1 text-xs font-medium">属性</h4>
                  <DetailRow label="类型">{meta.label}</DetailRow>
                  <DetailRow label="测试状态">
                    {node.in_scope ? (
                      node.tested ? (
                        <span className="text-emerald-600 dark:text-emerald-400">已测试</span>
                      ) : (
                        <span className="text-neutral-500">未测试</span>
                      )
                    ) : (
                      <span className="text-neutral-400">范围外（连接节点）</span>
                    )}
                  </DetailRow>
                  <DetailRow label="域名">{node.domain}</DetailRow>
                  <DetailRow label="根域名">{node.root_domain}</DetailRow>
                  <DetailRow label="IP">{node.ip}</DetailRow>
                  <DetailRow label="端口">{node.port ? node.port : undefined}</DetailRow>
                  <DetailRow label="URL">
                    {node.url ? <span className="font-mono text-xs break-all">{node.url}</span> : undefined}
                  </DetailRow>
                  <DetailRow label="标题">{node.page_title}</DetailRow>
                  <DetailRow label="状态码">{node.status_code ? node.status_code : undefined}</DetailRow>
                  <DetailRow label="App">{node.app_name}</DetailRow>
                  <DetailRow label="资产ID">
                    {node.asset_id ? <span className="font-mono text-xs">{node.asset_id}</span> : undefined}
                  </DetailRow>
                </section>
                {refs && (refs.intents.length > 0 || refs.facts.length > 0 || refs.findings.length > 0) && (
                  <section className="flex flex-col gap-3 border-t pt-3">
                    <RefList title="关联意图" items={refs.intents} />
                    <RefList title="关联事实" items={refs.facts} />
                    <RefList title="关联发现" items={refs.findings} />
                  </section>
                )}
                <section className="border-t pt-3">
                  <h4 className="text-muted-foreground mb-1.5 text-xs font-medium">原始数据</h4>
                  <pre className="bg-muted/50 text-foreground max-w-full overflow-hidden rounded-md border p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                    {raw}
                  </pre>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FoldSheet({
  fold,
  onOpenChange,
  onShowMore,
  onPick,
}: {
  fold: FoldNode | null;
  onOpenChange: (open: boolean) => void;
  onShowMore: (groupId: string) => void;
  onPick: (n: CoverageGraphNode) => void;
}) {
  const meta = fold ? kindMeta[fold.kind] : null;
  const Icon = meta?.icon;
  return (
    <Sheet open={fold !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-md">
        {fold && meta && Icon && (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="text-base">
                未展示的{meta.label}（{fold.hidden.length}）
              </SheetTitle>
              <p className="text-muted-foreground text-xs">已测优先展示。点「展示更多」把下一批拉进图里。</p>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 p-3">
                {fold.hidden.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => onPick(n)}
                    className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded",
                        n.tested ? meta.iconBg : "bg-neutral-400 dark:bg-neutral-600",
                      )}
                    >
                      <Icon className="size-3 text-white" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={n.label}>
                      {n.label}
                    </span>
                    {n.tested && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="border-t p-3">
              <Button className="w-full" variant="outline" onClick={() => onShowMore(fold.groupId)}>
                展示更多（+{FOLD_STEP}）
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
function GraphInner({ taskId, coverageEnabled = true }: { taskId: string; coverageEnabled?: boolean }) {
  const [data, setData] = React.useState<{
    nodes: CoverageGraphNode[];
    edges: CoverageGraphEdge[];
  } | null>(null);
  const [expanded, setExpanded] = React.useState<Map<string, number>>(new Map());
  const [selectedAsset, setSelectedAsset] = React.useState<CoverageGraphNode | null>(null);
  const [selectedFoldId, setSelectedFoldId] = React.useState<string | null>(null);
  const [activePath, setActivePath] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [mapping, setMapping] = React.useState(false);
  const [mappingConversationId, setMappingConversationId] = React.useState<number | null>(null);
  const [networkReportAt, setNetworkReportAt] = React.useState<Date | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [viewMode, setViewMode] = React.useState<CoverageViewMode>("asset");
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);
  const [viewport, setViewport] = React.useState<{ zoom: number; position: [number, number] }>({
    zoom: 1,
    position: [0, 0],
  });
  const viewModeRef = React.useRef<CoverageViewMode>(viewMode);
  viewModeRef.current = viewMode;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<G6Graph | null>(null);
  // click 处理需要最新的 key→RenderNode 映射（G6 事件回调闭包外读 ref）。
  const renderMapRef = React.useRef<Map<string, RenderNode>>(new Map());
  const gDataRef = React.useRef<{ nodes: G6NodeDatum[]; edges: G6EdgeDatum[] }>({
    nodes: [],
    edges: [],
  });
  const graphDataRef = React.useRef<typeof data>(null);

  const syncViewport = React.useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.destroyed) return;
    const position = graph.getPosition();
    setViewport({ zoom: graph.getZoom(), position: [position[0], position[1]] });
  }, []);

  const resetView = React.useCallback(async (mode: CoverageViewMode = viewModeRef.current) => {
    setActivePath([]);
    setSelectedAsset(null);
    setSelectedFoldId(null);
    const graph = graphRef.current;
    if (!graph || graph.destroyed) return;
    await graph.zoomTo(1);
    if (mode === "network") {
      // Network coordinates are already assigned to the three fixed zone
      // columns. Centering a graph with an empty zone shifts every node into
      // the next visible column and makes the background regions misleading.
      await graph.translateTo([0, 0]);
    } else {
      await graph.fitCenter();
    }
    syncViewport();
  }, [syncViewport]);

  const fetchGraph = React.useCallback(() => {
    setLoading(true);
    api
      .taskCoverageGraph(taskId)
      .then((g) => {
        // 资产覆盖度功能关闭(B1)：仍出图(范围内资产/company 关联依旧可见)，但抹平
        // tested 状态——不显示测试进度、不做已测高亮。
        const nodes = coverageEnabled ? (g.nodes ?? []) : (g.nodes ?? []).map((n) => ({ ...n, tested: false }));
        setData({ nodes, edges: g.edges ?? [] });
        graphDataRef.current = { nodes, edges: g.edges ?? [] };
        setLastSyncedAt(new Date());
      })
      .catch(() => {
        /* 保留上一次数据 */
      })
      .finally(() => setLoading(false));
  }, [taskId, coverageEnabled]);

  const remapNetwork = React.useCallback(async () => {
    setMapping(true);
    setNetworkReportAt(null);
    try {
      const run = await api.startTopologyMapping(taskId);
      setMappingConversationId(run.conversation_id);
    } catch {
      setMapping(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    if (!mappingConversationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await api.conversationMessages(mappingConversationId, 0);
        if (cancelled) return;
        if (!state.running) {
          setMapping(false);
          setMappingConversationId(null);
          // The asset relationship graph is read directly from the asset store;
          // completing the network report must not rebuild or replace it.
          setNetworkReportAt(new Date());
        }
      } catch {
        // Keep the spinner while the conversation endpoint is temporarily unavailable.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mappingConversationId]);

  React.useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  React.useEffect(() => {
    let cancelled = false;
    api
      .topologyMappingStatus(taskId)
      .then((status) => {
        if (cancelled) return;
        setMapping(status.running);
        setMappingConversationId(status.conversation_id ?? null);
      })
      .catch(() => {
        /* status is best effort; the graph remains usable */
      });
    setActivePath([]);
    setSelectedAsset(null);
    setSelectedFoldId(null);
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const { renderNodes, renderEdges } = React.useMemo(
    () =>
      data
        ? computeVisible(data.nodes, data.edges, expanded, viewMode === "network")
        : { renderNodes: [] as RenderNode[], renderEdges: [] as CoverageGraphEdge[] },
    [data, expanded, viewMode],
  );

  const displayNodes = React.useMemo(
    () => renderNodes,
    [renderNodes, viewMode],
  );
  const displayNodeKeys = React.useMemo(() => new Set(displayNodes.map((node) => node.key)), [displayNodes]);
  const displayEdges = React.useMemo(
    () => renderEdges.filter((edge) => displayNodeKeys.has(edge.src) && displayNodeKeys.has(edge.dst)),
    [displayNodeKeys, renderEdges],
  );
  const worldHeight = React.useMemo(() => networkWorldHeight(displayNodes), [displayNodes]);
  const zoneCounts = React.useMemo(() => {
    const counts: Record<Zone, number> = { internet: 0, boundary: 0, internal: 0 };
    for (const node of displayNodes) counts[node.fold ? "boundary" : zoneOf(node.node)] += 1;
    return counts;
  }, [displayNodes]);

  // 结构签名：只在可见节点/边集合变化时重建图 + 重跑布局，避免无谓抖动。
  const sig = React.useMemo(
    () =>
      `${displayNodes.map((n) => `${n.key}:${n.fold ? "f" : n.node.tested ? "t" : "u"}`).sort().join(",")}|${displayEdges.length}|${activePath.join(",")}|${viewMode}`,
    [activePath, displayEdges, displayNodes, viewMode],
  );

  // 维护 gDataRef + renderMapRef（供事件与图数据应用读取）。
  gDataRef.current = {
    nodes: toG6Nodes(displayNodes, new Set(activePath), viewMode),
    edges: displayEdges.map((e) => ({
      // The API stores child → parent containment. Topology reads naturally
      // from internet entry → boundary service → internal asset, so reverse
      // the visual arrow without changing the source graph or lineage logic.
      source: e.dst,
      target: e.src,
      active: activePath.includes(e.src) && activePath.includes(e.dst),
    })),
  };
  const rmap = new Map<string, RenderNode>();
  for (const rn of displayNodes) rmap.set(rn.key, rn);
  renderMapRef.current = rmap;

  const applyData = React.useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.destroyed) return;
    graph.setData(gDataRef.current);
    // render() 异步跑布局;若组件在布局落地前被卸载/销毁,g6 会在已清空的
    // context 上访问 transform 抛错。这是纯 teardown 竞态,吞掉它,不影响功能。
    void graph
      .render()
      .then(() => {
        if (graph.destroyed) return;
        const active = gDataRef.current.nodes.filter((node) => node.active).map((node) => node.id);
        // Keep the zone columns at their assigned coordinates. Centering a
        // network graph with an empty zone causes the remaining nodes to slide
        // into the next column, so network mode starts at the fixed origin.
        const result = active.length > 0
          ? graph.focusElement(active)
          : viewModeRef.current === "network"
            ? graph.translateTo([0, 0])
            : graph.fitCenter();
        return result.then(() => syncViewport());
      })
      .catch((err) => {
        if (!graph.destroyed) console.error("[coverage-graph] render:", err);
      });
  }, [syncViewport]);

  // 建图（一次）。动态 import 避开 SSR/静态导出期的 window 依赖。
  React.useEffect(() => {
    let destroyed = false;
    let graph: G6Graph | null = null;
    void (async () => {
      const { Graph } = await import("@antv/g6");
      if (destroyed || !containerRef.current) return;
      graph = new Graph({
        container: containerRef.current,
        autoResize: true,
        // Keep wheel/trackpad zoom within a readable range. Very small zoom
        // values make labels and the fixed network zones appear to collapse
        // into a single strip; an upper bound also prevents focusElement from
        // pushing the selected node underneath the overlay panel.
        zoomRange: [0.35, 3],
        // Asset mode explicitly centers after rendering. Network mode keeps
        // its fixed world coordinates so the three background zones align.
        background: "transparent",
        node: {
          style: {
            size: (d: unknown) => nd(d).size,
            fill: (d: unknown) => nodeFill(nd(d)),
            stroke: (d: unknown) => nodeStroke(nd(d)),
            lineWidth: (d: unknown) => (nd(d).fold || !nd(d).inScope ? 1 : nd(d).tested ? 3 : 1.5),
            lineDash: (d: unknown) => (nd(d).fold || !nd(d).inScope ? [3, 3] : [0]),
            iconSrc: (d: unknown) => nd(d).iconSrc,
            iconWidth: (d: unknown) => Math.max(12, nd(d).size * 0.55),
            iconHeight: (d: unknown) => Math.max(12, nd(d).size * 0.55),
            labelText: (d: unknown) => nd(d).lbl,
            labelFontSize: () => (viewModeRef.current === "network" ? 9 : 10),
            labelPlacement: "bottom",
            labelFill: "#475569",
            labelBackground: true,
            labelBackgroundFill: "rgba(255,255,255,0.75)",
            labelBackgroundRadius: 3,
            labelPadding: [1, 3],
            opacity: (d: unknown) =>
              gDataRef.current.nodes.some((node) => node.active) && !nd(d).active ? 0.5 : 1,
          },
        },
        edge: {
          style: {
            stroke: (d: unknown) => ((d as G6EdgeDatum).active ? "#0f766e" : "#cbd5e1"),
            lineWidth: (d: unknown) => ((d as G6EdgeDatum).active ? 2.5 : 1),
            opacity: (d: unknown) =>
              gDataRef.current.edges.some((edge) => edge.active) && !(d as G6EdgeDatum).active ? 0.18 : 1,
            endArrow: () => viewModeRef.current === "asset",
          },
        },
        behaviors: ["drag-element", "drag-canvas", "zoom-canvas"],
      });
      graph.on("aftertransform", syncViewport);
      graph.on("afterresize", syncViewport);
      graph.on("node:click", (evt: unknown) => {
        const id = (evt as { target?: { id?: string } }).target?.id;
        if (!id) return;
        const rn = renderMapRef.current.get(id);
        if (!rn) return;
        if (rn.fold) {
          setSelectedFoldId(rn.key);
          return;
        }
        setSelectedAsset(rn.node);
        const parents = new Map<string, string>();
        for (const edge of graphDataRef.current?.edges ?? []) {
          if (!parents.has(edge.src)) parents.set(edge.src, edge.dst);
        }
        const lineage: string[] = [];
        let cursor: string | undefined = rn.node.key;
        while (cursor && !lineage.includes(cursor)) {
          lineage.push(cursor);
          cursor = parents.get(cursor);
        }
        setActivePath(lineage);
        void graph?.focusElement(lineage).then(() => syncViewport());
      });
      graphRef.current = graph;
      applyData();
    })();
    return () => {
      destroyed = true;
      // 先停布局再销毁:尽量缩短"布局在飞、context 被清空"的竞态窗口。
      try {
        graph?.stopLayout();
      } catch {
        /* 图可能尚未建成或已无布局上下文 */
      }
      graph?.destroy();
      graphRef.current = null;
    };
  }, [applyData, resetView, syncViewport]);

  // 可见集合变化 → 重新灌数据 + 布局。sig 只作为重排触发器（applyData 读 gDataRef）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: sig 是刻意的重排触发依赖
  React.useEffect(() => {
    applyData();
  }, [sig, applyData]);

  const showMore = React.useCallback((groupId: string) => {
    setExpanded((prev) => {
      const m = new Map(prev);
      m.set(groupId, (m.get(groupId) ?? FOLD_LIMIT) + FOLD_STEP);
      return m;
    });
  }, []);

  const selectedFold =
    selectedFoldId != null
      ? ((renderNodes.find((n) => n.fold && n.key === selectedFoldId) as FoldNode | undefined) ?? null)
      : null;
  React.useEffect(() => {
    if (selectedFoldId != null && !selectedFold) setSelectedFoldId(null);
  }, [selectedFoldId, selectedFold]);

  const total = data?.nodes.length ?? 0;
  const tested = data?.nodes.filter((n) => n.in_scope && n.tested).length ?? 0;
  const inScope = data?.nodes.filter((n) => n.in_scope).length ?? 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100/80 dark:bg-slate-950/30">
      {viewMode === "network" ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="absolute top-0 left-0 grid w-[1350px] grid-cols-3"
            style={{
              height: worldHeight,
              transform: `translate(${viewport.position[0]}px, ${viewport.position[1]}px) scale(${viewport.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {(Object.keys(zoneMeta) as Zone[]).map((zone, index) => (
              <div
                key={zone}
                className={cn("relative border-r border-slate-200/80 dark:border-slate-800/80", zoneMeta[zone].className, index === 2 && "border-r-0")}
              >
                <div className="absolute top-3 left-4">
                  <div className="text-foreground/80 text-sm font-semibold">{zoneMeta[zone].label}</div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">{zoneMeta[zone].description}</div>
                </div>
                {zoneCounts[zone] === 0 && (
                  <div className="text-muted-foreground/70 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-dashed border-slate-300/70 px-3 py-2 text-center text-xs dark:border-slate-700/70">
                    暂无该区域资产证据
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute top-3 left-4 z-0">
          <div className="text-foreground/80 text-sm font-semibold">资产关系图</div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">按资产层级展示关联关系</div>
        </div>
      )}
      <div ref={containerRef} className="relative z-10 h-full w-full pt-12" />

      {/* 图例 + 统计 + 刷新（叠加层） */}
      <div className={cn(
        "bg-card/95 pointer-events-auto absolute bottom-3 left-3 z-20 rounded-lg border shadow-sm backdrop-blur",
        panelCollapsed
          ? "flex items-center gap-2 px-2.5 py-2 text-xs"
          : "flex w-[min(480px,calc(100%-1.5rem))] max-h-[calc(100%-1.5rem)] flex-col gap-2.5 overflow-auto p-3 text-xs",
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Waypoints className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate font-medium">
                {viewMode === "network" ? "网络拓扑梳理 Agent" : "资产关系图"}
              </div>
              <div className="text-muted-foreground truncate text-[11px]">
                {viewMode === "network"
                  ? mapping
                    ? "正在梳理网络拓扑，并生成两份结果…"
                    : networkReportAt
                      ? `最近梳理 ${networkReportAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                      : "网络拓扑等待梳理"
                  : loading
                    ? "正在读取资产库关系…"
                    : lastSyncedAt
                      ? `资产库实时数据 · ${lastSyncedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                      : "等待读取资产库"}
              </div>
            </div>
          </div>
          {total > 0 ? (
            <span className="text-muted-foreground whitespace-nowrap">
              范围内 <span className="text-foreground font-semibold tabular-nums">{inScope}</span>
              {coverageEnabled && (
                <>
                  {" "}
                  · 已测{" "}
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{tested}</span>
                </>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{loading ? "加载中…" : "暂无范围内资产（先锚定任务范围）"}</span>
          )}
          {!panelCollapsed && <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setPanelCollapsed(true)} title="收起面板">
              <ChevronDown className="size-3.5" />
              <span className="hidden sm:inline">收起</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => void resetView()} title="重置视图">
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">重置视图</span>
            </Button>
            {viewMode === "network" && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2" onClick={() => void remapNetwork()} disabled={mapping} title="重新梳理网络拓扑">
                <RefreshCw className={cn("size-3.5", (loading || mapping) && "animate-spin")} />
                <span className="hidden sm:inline">{mapping ? "正在梳理网络…" : "梳理网络拓扑"}</span>
              </Button>
            )}
          </div>}
          {panelCollapsed && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setPanelCollapsed(false)} title="展开面板">
            <ChevronUp className="size-3.5" />
            <span className="hidden sm:inline">展开</span>
          </Button>}
        </div>
        {!panelCollapsed && <>
        <div className="bg-muted/60 flex items-center gap-1 rounded-md p-1">
          <Button
            variant={viewMode === "asset" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 flex-1 px-2 text-xs"
            onClick={() => {
              setViewMode("asset");
              void resetView("asset");
            }}
          >
            资产关系图
          </Button>
          <Button
            variant={viewMode === "network" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 flex-1 px-2 text-xs"
            onClick={() => {
              setViewMode("network");
              void resetView("network");
            }}
          >
            网络拓扑
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {(Object.keys(kindMeta) as Kind[]).map((k) => {
            const m = kindMeta[k];
            const Icon = m.icon;
            return (
              <span key={k} className="text-foreground inline-flex items-center gap-1.5">
                <span className={cn("flex size-4 items-center justify-center rounded", m.iconBg)}>
                  <Icon className="size-2.5 text-white" />
                </span>
                {m.label}
              </span>
            );
          })}
        </div>
        <div className="border-border/60 text-muted-foreground flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-2">
          {coverageEnabled && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="flex size-3 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">✓</span> 已测（绿色描边）
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-neutral-400" /> 未测
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border border-dashed border-neutral-400 bg-neutral-200" /> 范围外
          </span>
        </div>
        {viewMode === "network" && (
          <div className="border-border/60 flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-2">
            {(Object.keys(zoneMeta) as Zone[]).map((zone) => (
              <span key={zone} className="text-muted-foreground inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", zone === "internet" && "bg-sky-400", zone === "boundary" && "bg-amber-400", zone === "internal" && "bg-emerald-400")} />
                {zoneMeta[zone].label}
              </span>
            ))}
          </div>
        )}
        <p className="text-muted-foreground/80 border-border/60 border-t pt-2 leading-relaxed">
          {viewMode === "network"
            ? "图中只展示有真实资产证据的节点；连线表示资产归属/关联，不代表已验证的网络通信路径。"
            : "资产关系图直接读取资产库，不需要额外梳理；点击节点查看详情并高亮关系链。灰色「⋯」可展开更多资产。"}
        </p>
        </>}
      </div>

      {selectedAsset && activePath.length > 0 && data && (
        <div className="bg-card/95 pointer-events-auto absolute top-3 right-3 z-20 w-[min(310px,calc(100%-2rem))] rounded-lg border p-3 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-foreground text-sm font-semibold">关系路径</div>
              <div className="text-muted-foreground mt-0.5 text-[11px]">从当前资产向上追溯关联关系</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setActivePath([]);
                void resetView();
              }}
            >
              清除高亮
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {[...activePath].reverse().map((key, index, path) => {
              const node = data.nodes.find((item) => item.key === key);
              if (!node) return null;
              return (
                <React.Fragment key={key}>
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                    <span className={cn("size-2 shrink-0 rounded-full", zoneOf(node) === "internet" && "bg-sky-500", zoneOf(node) === "boundary" && "bg-amber-500", zoneOf(node) === "internal" && "bg-emerald-500")} />
                    <span className="text-muted-foreground shrink-0">{zoneMeta[zoneOf(node)].label}</span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={node.label}>{node.label}</span>
                  </div>
                  {index < path.length - 1 && <div className="text-muted-foreground pl-3 text-[10px]">↓</div>}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <AssetSheet node={selectedAsset} taskId={taskId} onOpenChange={(o) => !o && setSelectedAsset(null)} />
      <FoldSheet
        fold={selectedFold}
        onOpenChange={(o) => !o && setSelectedFoldId(null)}
        onShowMore={showMore}
        onPick={(n) => {
          setSelectedFoldId(null);
          setSelectedAsset(n);
        }}
      />
    </div>
  );
}

export function CoverageGraphTab({ taskId, coverageEnabled = true }: { taskId: string; coverageEnabled?: boolean }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="h-[72vh] w-full overflow-hidden rounded-xl">
          <GraphInner taskId={taskId} coverageEnabled={coverageEnabled} />
        </div>
      </CardContent>
    </Card>
  );
}
