import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Match Next's extensionless TS imports when running these pure helpers in Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { buildFindingReportMarkdown, collectFindingReport, findingLineageMarkdown, findingReportFilename } =
  await import("./finding-report-export.ts");
const { collapseDigestGraph } = await import("./exploration-graph-data.ts");

const finding = {
  id: "f-17",
  name: "内网域控 DC01 完全控制",
  vulnclass: "Domain Compromise",
  severity: "critical",
  status: "confirmed",
  summary: "摘要第一行\n第二行",
  evidence: "whoami\n```\nSYSTEM\n````",
  report: "## 漏洞概述\n原始报告\n\n### 复现步骤\n\n```sh\nwhoami\n```",
  ts: "2026-07-26T08:20:00+08:00",
  assets: [{ id: "a-1", type: "ip", label: "10.10.10.10" }],
  task_id: "t-1",
  task_description: "内部渗透",
};
const node = (id, type, summary, extra = {}) => ({
  id,
  type,
  payload: JSON.stringify({ summary }),
  state: "confirmed",
  priority: 1,
  origin: "test",
  ts: finding.ts,
  ...extra,
});
const lineage = {
  nodes: [
    node("root", "fact", "任务起点", { state: "origin" }),
    node("intent", "intent", "登录验证"),
    node("f-17", "finding", "完全控制"),
  ],
  edges: [
    { src: "root", dst: "intent", rel: "spawns" },
    { src: "intent", dst: "f-17", rel: "yields" },
  ],
};
const binding = {
  id: "901",
  finding_id: "f-17",
  snapshot_id: "s-1",
  role: "proof",
  note: "以 svc_deploy 登录域控",
  position: 1,
  created_at: finding.ts,
  snapshot: {
    id: "s-1",
    source_traffic_id: "t-901",
    captured_at: 1785029280,
    url: "https://10.10.10.10:445/psexec",
    method: "POST",
    status: 200,
    req_head: "POST /psexec HTTP/1.1\r\nHost: 10.10.10.10",
    resp_head: "HTTP/1.1 200 OK",
    req_len: 3,
    resp_len: 6,
  },
};
const preview = (content, extra = {}) => ({
  content,
  offset: 0,
  total: content.length,
  next_offset: content.length,
  truncated: false,
  binary: false,
  ...extra,
});
const packet = { binding, request: preview("req"), response: preview("SYSTEM") };
const traffic = { finding_id: "f-17", version: 2, report_version: 2, bindings: [binding] };
const data = () => structuredClone({ finding, lineage, traffic, packets: [packet], retests: [] });
const pageUrl = "https://artex.example/function/findings/detail?id=f-17&context_task=t-2";
const source = (overrides = {}) => ({
  getFinding: async () => structuredClone(finding),
  findingLineage: async () => structuredClone(lineage),
  findingTraffic: async () => structuredClone(traffic),
  findingTrafficDetail: async () => structuredClone(packet),
  findingTrafficBody: async () => {
    throw new Error("unexpected continuation");
  },
  findingRetests: async () => [],
  ...overrides,
});

test("exports source link, graph, overview and unmodified detailed Markdown in order", () => {
  const markdown = buildFindingReportMarkdown(data(), pageUrl, new Date("2026-11-09T08:00:00Z"));
  assert.ok(markdown.startsWith(`[查看在线报告](<${pageUrl}>)`));
  const sections = [
    "## 链路图",
    "## 概览",
    "### 摘要",
    "### 证据 / PoC",
    "### 关联流量",
    "## 详细报告",
    "## 状态与资产",
    "## 漏洞复测",
  ];
  for (let i = 1; i < sections.length; i++)
    assert.ok(markdown.indexOf(sections[i - 1]) < markdown.indexOf(sections[i]));
  for (const content of [
    "flowchart LR",
    'n0 -->|"派生"| n1',
    'n1 -->|"产出"| n2',
    "起点",
    "POST /psexec HTTP/1.1",
    "HTTP/1.1 200 OK",
    "SYSTEM",
    "严重",
    "已确认",
    "10\\.10\\.10\\.10",
    "暂无复测记录。",
    finding.report,
  ])
    assert.ok(markdown.includes(content), content);
  assert.ok(
    markdown.includes(`\n\n\`\`\`\`\`text\n${finding.evidence}\n\`\`\`\`\``),
    "embedded fences must not terminate evidence block",
  );
});

test("empty sections are explicit and a missing task is exportable", () => {
  const value = data();
  value.lineage = { nodes: [], edges: [] };
  value.finding = {
    ...finding,
    name: "",
    summary: "",
    evidence: "",
    report: "",
    assets: [],
    task_id: undefined,
    task_description: undefined,
  };
  value.traffic.bindings = [];
  value.packets = [];
  const markdown = buildFindingReportMarkdown(value, pageUrl);
  for (const phrase of [
    "# Domain Compromise",
    "无链路可展示",
    "（无摘要）",
    "（无证据）",
    "暂无关联流量",
    "暂无详细报告",
    "任务已删除",
    "无关联资产",
  ])
    assert.ok(markdown.includes(phrase), phrase);
});

test("marks stale reports and preserves read-only source context", () => {
  const value = data();
  value.traffic.report_version = 1;
  value.finding.inherited = true;
  value.finding.source_task_id = "source-task";
  const markdown = buildFindingReportMarkdown(value, pageUrl);
  assert.ok(markdown.includes("详细报告待更新"));
  assert.ok(markdown.includes("source\\-task（只读）"));
  assert.ok(markdown.includes("context_task=t-2"));
});

test("retains full long node descriptions but uses bounded Mermaid labels", () => {
  const long = "完整节点说明".repeat(100);
  const markdown = findingLineageMarkdown({ nodes: [node("n", "intent", long)], edges: [] });
  assert.ok(markdown.includes("…"));
  assert.ok(markdown.includes(long));
});

test("escapes Mermaid labels and never treats raw node IDs as graph syntax", () => {
  const attack = 'x"] --> evil["injected"]\n```\n<script>&#quot;\\';
  const markdown = findingLineageMarkdown({
    nodes: [node(attack, "intent", attack)],
    edges: [{ src: attack, dst: "missing", rel: "yields" }],
  });
  const diagram = markdown.split("```mermaid\n")[1].split("\n```")[0];
  assert.match(diagram, /^flowchart LR\n {2}n0\["/);
  assert.ok(!diagram.includes("\n```"));
  assert.ok(!diagram.includes("<script>"));
  assert.ok(!diagram.includes('x"]'));
  assert.ok(diagram.includes("#34;"));
  assert.ok(!diagram.includes(" -->|"), "edges to missing nodes are omitted");
});

test("uses the same digest folding and inverse-edge deduplication as the interactive graph", () => {
  const graph = {
    nodes: [
      node("d", "digest", "", { state: "active", payload: '{"body":"压缩链路"}' }),
      node("i", "intent", "已折叠"),
      node("f", "finding", "终点"),
      node("old", "digest", "", { state: "superseded" }),
    ],
    edges: [
      { src: "d", dst: "i", rel: "covers" },
      { src: "i", dst: "f", rel: "yields" },
      { src: "f", dst: "i", rel: "derived_from" },
    ],
  };
  const folded = collapseDigestGraph(graph.nodes, graph.edges);
  assert.deepEqual(
    folded.viewNodes.map((n) => n.id),
    ["d", "f"],
  );
  assert.deepEqual(folded.viewEdges, [{ src: "d", dst: "f", rel: "yields" }]);
  const markdown = findingLineageMarkdown(graph);
  assert.ok(markdown.includes("压缩链路"));
  assert.ok(!markdown.includes("已折叠"));
});

test("fetches all sections without requiring a mounted lineage tab and forwards task context", async () => {
  const calls = [];
  const api = source();
  for (const [method, fn] of Object.entries(api))
    api[method] = async (...args) => {
      calls.push([method, ...args]);
      return fn(...args);
    };
  const result = await collectFindingReport(api, "f-17", "t-2");
  assert.deepEqual(result, data());
  assert.ok(calls.some((call) => JSON.stringify(call) === '["getFinding","f-17","t-2"]'));
  assert.ok(calls.some((call) => JSON.stringify(call) === '["findingTraffic","f-17","t-2"]'));
  assert.ok(calls.some((call) => JSON.stringify(call) === '["findingTrafficDetail","f-17","901","t-2"]'));
  assert.ok(calls.some(([method]) => method === "findingLineage"));
});

test("fetches continuation pages rather than silently exporting only the 8 KiB preview", async () => {
  const first = preview("first", { next_offset: 5, total: 15, truncated: true });
  const calls = [];
  const result = await collectFindingReport(
    source({
      findingTrafficDetail: async () => ({ ...packet, response: first }),
      findingTrafficBody: async (...args) => {
        calls.push(args);
        return args[3] === 5
          ? preview(" next", { offset: 5, next_offset: 10, total: 15, truncated: true })
          : preview(" last", { offset: 10, next_offset: 15, total: 15 });
      },
    }),
    "f-17",
    "t-2",
  );
  assert.equal(result.packets[0].response.content, "first next last");
  assert.deepEqual(calls, [
    ["f-17", "901", "response", 5, "t-2"],
    ["f-17", "901", "response", 10, "t-2"],
  ]);
});

test("fails rather than saving incomplete output when an API read fails", async () => {
  await assert.rejects(
    collectFindingReport(
      source({
        findingLineage: async () => {
          throw new Error("network failure");
        },
      }),
      "f-17",
    ),
    /network failure/,
  );
  await assert.rejects(
    collectFindingReport(
      source({
        findingTrafficDetail: async () => {
          throw new Error("evidence missing");
        },
      }),
      "f-17",
    ),
    /evidence missing/,
  );
});

test("rejects non-advancing body pagination to avoid an infinite export", async () => {
  const first = preview("first", { next_offset: 5, total: 15, truncated: true });
  await assert.rejects(
    collectFindingReport(
      source({
        findingTrafficDetail: async () => ({ ...packet, response: first }),
        findingTrafficBody: async () => preview("", { offset: 5, next_offset: 5, total: 15, truncated: true }),
      }),
      "f-17",
    ),
    /正文分页异常/,
  );
});

test("caps huge traffic bodies, identifies binary evidence, and explains omissions", async () => {
  let reads = 0;
  const result = await collectFindingReport(
    source({
      findingTrafficDetail: async () => ({
        ...packet,
        request: preview("binary", { total: 500, binary: true, truncated: true }),
        response: preview("huge", { next_offset: 1024 * 1024, total: 2000000, truncated: true }),
      }),
      findingTrafficBody: async () => {
        reads++;
        throw new Error("must not fetch binary or already-capped bodies");
      },
    }),
    "f-17",
  );
  assert.equal(reads, 0);
  const markdown = buildFindingReportMarkdown(result, pageUrl);
  assert.ok(markdown.includes("二进制正文，500 字节"));
  assert.ok(markdown.includes("1 MiB 导出上限"));
  assert.ok(markdown.includes("1048576 / 2000000"));
});

test("keeps bound traffic in server order", async () => {
  const second = { ...binding, id: "902", position: 2 };
  const result = await collectFindingReport(
    source({
      findingTraffic: async () => ({ ...traffic, bindings: [second, binding] }),
      findingTrafficDetail: async (_id, bindingId) => ({
        ...packet,
        binding: bindingId === second.id ? second : binding,
      }),
    }),
    "f-17",
  );
  assert.deepEqual(
    result.packets.map((p) => p.binding.id),
    ["902", "901"],
  );
});

test("includes retest verdict, notes and evidence", () => {
  const value = data();
  value.retests = [
    {
      id: 1,
      status: "completed",
      verdict: "fixed",
      created_at: finding.ts,
      finished_at: finding.ts,
      notes: "验证修复",
      summary: "访问已拒绝",
      evidence: "HTTP 403",
      error: "",
    },
  ];
  const markdown = buildFindingReportMarkdown(value, pageUrl);
  for (const phrase of ["复测 #1", "结论：已修复", "验证修复", "访问已拒绝", "HTTP 403"])
    assert.ok(markdown.includes(phrase));
});

test("generates a safe, bounded Unicode filename", () => {
  const filename = findingReportFilename({ ...finding, name: `报告/\\:*?"<>|\n危险\u0000${"长".repeat(150)}` });
  assert.ok(filename.startsWith("ARTEX-f-17-报告"));
  assert.ok(filename.endsWith(".md"));
  assert.doesNotMatch(filename, /[<>:"/\\|?*\p{Cc}]/u);
  assert.ok(Array.from(filename).length < 100);
});

test("uses archived headers from detail, not the redacted list snapshot", async () => {
  const summaryBinding = { ...binding, snapshot: { ...binding.snapshot, req_head: "", resp_head: "" } };
  const result = await collectFindingReport(
    source({
      findingTraffic: async () => ({ ...traffic, bindings: [summaryBinding] }),
    }),
    "f-17",
  );
  const markdown = buildFindingReportMarkdown(result, pageUrl);
  assert.ok(markdown.includes("POST /psexec HTTP/1.1"));
  assert.ok(markdown.includes("Host: 10.10.10.10"));
  assert.ok(markdown.includes("HTTP/1.1 200 OK"));
});

test("exports the real demo f-17 lineage rather than silently getting an empty mock response", async () => {
  const { mockHandle } = await import("./mock/handler.ts");
  const read = (suffix) => mockHandle("GET", `/exploration/findings/f-17${suffix}`);
  const result = await collectFindingReport(
    {
      getFinding: () => read(""),
      findingLineage: () => read("/lineage"),
      findingTraffic: () => read("/traffic"),
      findingTrafficDetail: (_id, bindingId) => read(`/traffic/${bindingId}`),
      findingTrafficBody: (_id, bindingId, side, offset) =>
        read(`/traffic/${bindingId}/body?side=${side}&offset=${offset}`),
      findingRetests: async () => (await read("/retests")).retests,
    },
    "f-17",
  );
  assert.ok(result.lineage.nodes.length > 1);
  assert.ok(result.lineage.nodes.some((node) => node.id === "root"));
  assert.ok(result.lineage.nodes.some((node) => node.id === "fiDC"));
  assert.ok(
    !result.lineage.nodes.some((node) => node.id === "h1"),
    "unrelated attack branches must not leak into the report",
  );
  const markdown = buildFindingReportMarkdown(result, pageUrl);
  assert.ok(markdown.includes("```mermaid"));
  assert.ok(markdown.includes("flowchart LR"));
  assert.ok(markdown.includes("DC01"));
  assert.ok(markdown.includes("psexec"));
  assert.ok(markdown.includes("Got SYSTEM on DC01"));
  assert.ok(markdown.includes("修复建议"));
  await assert.rejects(mockHandle("GET", "/exploration/findings/does-not-exist/lineage"), /漏洞不存在/);
});
