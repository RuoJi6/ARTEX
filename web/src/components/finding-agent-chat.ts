import { mentionToken } from "@/lib/chat-mentions";
import type { Finding } from "@/lib/types";

type FindingContextFields = Finding & {
  url?: string;
  endpoint?: string;
  entry_point?: string;
};

export function canAskFindingAgent(finding: Pick<Finding, "task_id" | "inherited"> | null | undefined): boolean {
  return Boolean(finding?.task_id && !finding.inherited);
}

export function findingDisplayTitle(finding: Pick<Finding, "id" | "name" | "vulnclass">): string {
  if (finding.name?.trim()) return finding.name;
  if (finding.vulnclass?.trim()) return finding.vulnclass;
  return `漏洞 #${finding.id}`;
}

export function findingAgentUnavailableReason(
  finding: Pick<Finding, "task_id" | "inherited"> | null | undefined,
): string {
  if (!finding?.task_id) return "无所属任务，无法连接到主 Agent。";
  if (finding.inherited) return "继承漏洞只读，请到源任务提问。";
  return "";
}

function truncate(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

/**
 * The finding mention is included once, in the first turn, so later user turns
 * stay short while the task's main Agent still has an unambiguous finding anchor.
 */
export function buildFindingAgentContextMessage(finding: Finding): string {
  const extended = finding as FindingContextFields;
  const numericId = Number(finding.id);
  const mention = mentionToken({
    kind: "finding",
    id: Number.isFinite(numericId) ? numericId : 0,
    label: truncate(findingDisplayTitle(finding), 100),
    description: truncate(finding.summary || "", 200),
  });
  const lines = [
    "用户正在漏洞详情页复现并提问。",
    mention,
    `严重等级：${finding.severity}；漏洞类型：${finding.vulnclass || "未分类"}。`,
  ];
  const summary = truncate(finding.summary || "", 300);
  if (summary) lines.push(`摘要：${summary}`);
  const entryPoint = extended.url || extended.entry_point || extended.endpoint;
  if (entryPoint) lines.push(`入口点：${truncate(entryPoint, 240)}`);
  return lines.join("\n");
}
