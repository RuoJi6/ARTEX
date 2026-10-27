const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildFindingAgentContextMessage,
  canAskFindingAgent,
  findingAgentUnavailableReason,
} = require("../components/finding-agent-chat.ts");

const finding = (overrides = {}) => ({
  id: "42",
  vulnclass: "SQL 注入",
  name: "搜索参数注入",
  severity: "high",
  status: "confirmed",
  summary: "搜索参数可控制数据库查询。",
  evidence: "large evidence omitted",
  ts: "2026-10-27T00:00:00Z",
  task_id: "task-7",
  ...overrides,
});

test("finding without task cannot ask its Agent", () => {
  assert.equal(canAskFindingAgent(finding({ task_id: undefined })), false);
  assert.match(findingAgentUnavailableReason(finding({ task_id: undefined })), /无所属任务/);
});

test("task-owned finding can ask and context contains a finding mention", () => {
  assert.equal(canAskFindingAgent(finding()), true);
  const context = buildFindingAgentContextMessage(finding());
  assert.match(context, /用户正在漏洞详情页复现并提问/);
  assert.match(context, /@\[漏洞#42 搜索参数注入\]/);
  assert.match(context, /SQL 注入/);
});

test("inherited finding is read-only", () => {
  assert.equal(canAskFindingAgent(finding({ inherited: true, source_task_id: "source-1" })), false);
  assert.match(findingAgentUnavailableReason(finding({ inherited: true })), /继承漏洞只读/);
});
