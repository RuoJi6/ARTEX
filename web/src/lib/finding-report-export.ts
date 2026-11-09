import { collapseDigestGraph, nodeSummary, relLabel, viewKind } from "./exploration-graph-data";
import { statusMeta } from "./status";
import type {
  Edge,
  EvidenceBodyPreview,
  Finding,
  FindingRetest,
  FindingTraffic,
  FindingTrafficDetail,
  TaskNode,
  TrafficEvidenceRole,
} from "./types";

const NODE_LABELS: Record<string, string> = {
  task: "根任务",
  begin: "起点",
  goal: "目标",
  hint: "提示",
  intent: "意图",
  fact: "事实",
  finding: "漏洞",
  digest: "压缩",
};
const TRAFFIC_ROLES: Record<TrafficEvidenceRole, string> = {
  baseline: "正常对照",
  proof: "漏洞证明",
  verification: "补充验证",
  supporting: "辅助证据",
};
// Keep a large captured response from exhausting browser memory. Any omission is
// explicit in the report; the archived original remains available on the page.
const MAX_BODY_BYTES = 1024 * 1024;

type Lineage = { nodes: TaskNode[] | null; edges: Edge[] | null };
type Side = "request" | "response";

export interface FindingReportSource {
  getFinding: (id: string, contextTask?: string) => Promise<Finding>;
  findingLineage: (id: string) => Promise<Lineage>;
  findingTraffic: (id: string, contextTask?: string) => Promise<FindingTraffic>;
  findingTrafficDetail: (id: string, bindingId: string, contextTask?: string) => Promise<FindingTrafficDetail>;
  findingTrafficBody: (
    id: string,
    bindingId: string,
    side: Side,
    offset: number,
    contextTask?: string,
  ) => Promise<EvidenceBodyPreview>;
  findingRetests: (id: string) => Promise<FindingRetest[]>;
}

export interface FindingReportData {
  finding: Finding;
  lineage: Lineage;
  traffic: FindingTraffic;
  packets: FindingTrafficDetail[];
  retests: FindingRetest[];
}

function firstText(...values: (string | undefined)[]) {
  return values.find((value) => value?.trim()) ?? "";
}

function text(value: string) {
  return value.replace(/[\\`*_{}[\]<>()#!|~.+-]/g, "\\$&");
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function codeBlock(value: string, language = "text") {
  const longest = (value.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function time(value: string | number) {
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN");
}

function destination(url: string) {
  return url.replace(/[<>\s]/g, (char) => encodeURIComponent(char));
}

function mermaidLabel(value: string) {
  return oneLine(value).replace(/[&"<>#`\\]/g, (char) => `#${char.charCodeAt(0)};`);
}

export function findingLineageMarkdown(lineage: Lineage) {
  const { viewNodes, viewEdges } = collapseDigestGraph(lineage.nodes ?? [], lineage.edges ?? []);
  if (viewNodes.length === 0) return "无链路可展示（该漏洞未关联探索节点，或所属任务已删除）。";

  // Never interpolate untrusted node IDs into Mermaid syntax.
  const ids = new Map(viewNodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ["flowchart LR"];
  for (const node of viewNodes) {
    const kind = NODE_LABELS[viewKind(node)] ?? node.type;
    const summary = oneLine(firstText(nodeSummary(node), kind));
    const label = `${kind} · ${node.id} · ${summary.length > 160 ? `${summary.slice(0, 160)}…` : summary}`;
    lines.push(`  ${ids.get(node.id)}["${mermaidLabel(label)}"]`);
  }
  for (const edge of viewEdges) {
    const src = ids.get(edge.src);
    const dst = ids.get(edge.dst);
    if (src && dst) lines.push(`  ${src} -->|"${mermaidLabel(relLabel[edge.rel] ?? edge.rel)}"| ${dst}`);
  }
  const descriptions = viewNodes.map((node) => {
    const kind = NODE_LABELS[viewKind(node)] ?? node.type;
    return `- **${text(kind)} ${text(node.id)}**：${text(firstText(nodeSummary(node), "（无描述）")).replace(/\r?\n/g, "\n  ")}`;
  });
  return [
    codeBlock(lines.join("\n"), "mermaid"),
    "> 链路图需使用支持 Mermaid 的 Markdown 阅读器查看。以下节点说明保留完整文字。",
    "### 链路节点说明",
    descriptions.join("\n"),
  ].join("\n\n");
}

async function completeBody(
  source: FindingReportSource,
  id: string,
  bindingId: string,
  side: Side,
  initial: EvidenceBodyPreview,
  contextTask?: string,
): Promise<EvidenceBodyPreview> {
  if (!initial.truncated || initial.binary) return initial;
  const chunks = [initial.content];
  let page = initial;
  while (page.truncated && !page.binary && page.next_offset < MAX_BODY_BYTES) {
    const offset = page.next_offset;
    const next = await source.findingTrafficBody(id, bindingId, side, offset, contextTask);
    if (next.offset !== offset || next.next_offset <= offset) {
      throw new Error(`流量证据 #${bindingId} 正文分页异常，请重试`);
    }
    chunks.push(next.content);
    page = next;
  }
  return { ...page, offset: 0, content: chunks.join("") };
}

// Fetch on demand, even if the user has never opened the lineage tab or a
// packet dialog. Do not silently download a report after a required read fails.
export async function collectFindingReport(
  source: FindingReportSource,
  id: string,
  contextTask?: string,
): Promise<FindingReportData> {
  const [finding, lineage, traffic, retests] = await Promise.all([
    source.getFinding(id, contextTask),
    source.findingLineage(id),
    source.findingTraffic(id, contextTask),
    source.findingRetests(id),
  ]);
  const packets: FindingTrafficDetail[] = [];
  // Sequential bindings bound the number of concurrent requests and preserve
  // the reproduction order selected on the page.
  for (const binding of traffic.bindings) {
    const detail = await source.findingTrafficDetail(id, binding.id, contextTask);
    const [request, response] = await Promise.all(
      (["request", "response"] as const).map((side) =>
        completeBody(source, id, binding.id, side, detail[side], contextTask),
      ),
    );
    // The list endpoint deliberately strips headers; keep the full archived
    // snapshot returned by the detail endpoint, with the list order and notes.
    packets.push({ binding: { ...binding, snapshot: detail.binding.snapshot }, request, response });
  }
  return { finding, lineage, traffic, packets, retests };
}

function packetMarkdown(packet: FindingTrafficDetail, side: Side) {
  const body = packet[side];
  const head = side === "request" ? packet.binding.snapshot.req_head : packet.binding.snapshot.resp_head;
  const content = [head, body.binary ? `（二进制正文，${body.total} 字节，未嵌入 Markdown）` : body.content]
    .filter(Boolean)
    .join("\n\n");
  const parts = [
    side === "request" ? "##### 请求报文" : "##### 响应报文",
    codeBlock(firstText(content, "（空报文）"), "http"),
  ];
  if (!body.binary && body.truncated) {
    parts.push(
      `> 正文超过单侧 1 MiB 导出上限，仅导出前 ${body.next_offset} / ${body.total} 字节；请返回在线报告下载完整正文。`,
    );
  }
  return parts.join("\n\n");
}

export function buildFindingReportMarkdown(data: FindingReportData, pageUrl: string, exportedAt = new Date()) {
  const { finding, lineage, traffic, packets, retests } = data;
  const title = oneLine(firstText(finding.name, finding.vulnclass, "未分类"));
  const parts = [
    `[查看在线报告](<${destination(pageUrl)}>)`,
    `# ${text(title)}`,
    `- 漏洞 ID：${text(finding.id)}\n- 导出时间：${text(exportedAt.toLocaleString("zh-CN"))}`,
    "## 链路图",
    findingLineageMarkdown(lineage),
    "## 概览",
    "### 摘要",
    text(firstText(finding.summary, "（无摘要）")),
    "### 证据 / PoC",
    codeBlock(firstText(finding.evidence, "（无证据）")),
    `### 关联流量（${traffic.bindings.length}）`,
  ];
  if (!packets.length) parts.push("暂无关联流量。");
  for (const [index, packet] of packets.entries()) {
    const { binding } = packet;
    const snapshot = binding.snapshot;
    parts.push(
      `#### ${index + 1}. ${TRAFFIC_ROLES[binding.role] ?? text(binding.role)} · 证据 ${text(binding.id)}`,
      `- URL：${text(snapshot.url)}\n- 请求方法：${text(snapshot.method)}\n- 响应状态：${snapshot.status}\n- 捕获时间：${text(time(snapshot.captured_at))}`,
      text(firstText(binding.note, "（无说明）")),
      packetMarkdown(packet, "request"),
      packetMarkdown(packet, "response"),
    );
  }
  parts.push("## 详细报告");
  if (finding.report_stale || traffic.version !== traffic.report_version) {
    parts.push("> 流量证据已变更，详细报告待更新。以下为当前已保存的报告内容。");
  }
  // Keep the original Markdown intact, including reproduction steps, code
  // fences, screenshots, links and tables authored by the report agent.
  parts.push(firstText(finding.report, "暂无详细报告。"));
  parts.push(
    "## 状态与资产",
    [
      `- 严重等级：${statusMeta("severity", finding.severity).label}`,
      `- 处理状态：${statusMeta("finding", finding.status).label}`,
      `- 漏洞类型：${text(firstText(finding.vulnclass, "—"))}`,
      `- 所属任务：${text(firstText(finding.task_description, finding.task_id, "—（任务已删除）"))}`,
      `- 发现时间：${text(time(finding.ts))}`,
      ...(finding.inherited ? [`- 来源任务：${text(firstText(finding.source_task_id, "—"))}（只读）`] : []),
    ].join("\n"),
    "### 涉及资产",
    finding.assets?.length
      ? finding.assets.map((asset) => `- ${text(asset.label)}（${text(asset.type)}）`).join("\n")
      : "（无关联资产）",
    "## 漏洞复测",
  );
  if (!retests.length) parts.push("暂无复测记录。");
  const statusLabels = {
    pending: "等待启动",
    running: "复测中",
    completed: "已完成",
    failed: "复测失败",
    stopped: "已停止",
  };
  const verdictLabels = { reproduced: "仍可复现", fixed: "已修复", inconclusive: "无法确认" };
  for (const retest of retests) {
    parts.push(`### 复测 #${retest.id} · ${statusLabels[retest.status] ?? retest.status}`);
    if (retest.verdict) parts.push(`结论：${verdictLabels[retest.verdict] ?? text(retest.verdict)}`);
    parts.push(`创建时间：${text(time(retest.created_at))}`);
    if (retest.finished_at) parts.push(`结束时间：${text(time(retest.finished_at))}`);
    if (retest.notes) parts.push(`复测说明：${text(retest.notes)}`);
    if (retest.summary) parts.push(retest.summary);
    if (retest.evidence) parts.push(codeBlock(retest.evidence));
    if (retest.error) parts.push(`错误：${text(retest.error)}`);
  }
  parts.push("> 本报告由 ARTEX 前端导出，可能包含敏感证据，请妥善保管。报告中的在线资源仍可能需要登录原系统访问。");
  return `${parts.join("\n\n")}\n`;
}

export function findingReportFilename(finding: Finding) {
  const safe = (value: string) =>
    oneLine(value)
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")
      .replace(/[. ]+$/g, "");
  const title = Array.from(safe(firstText(finding.name, finding.vulnclass, "未分类")))
    .slice(0, 60)
    .join("");
  return `ARTEX-${safe(finding.id)}-${firstText(title, "报告")}.md`;
}
