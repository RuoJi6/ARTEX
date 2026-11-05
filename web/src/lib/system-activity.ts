// Fixed activity labels written by the backend (planner round markers and a few
// system notices). They are stored in Chinese; translate only exact generated
// text at display time so stored activity and custom text remain verbatim.
type Translate = (key: string, values?: Record<string, string | number>) => string;

const PATTERNS: [RegExp, string, string[]][] = [
  [/^第 0 轮目标拆解$/, "roundGoals", []],
  [/^第 (\d+) 轮规划$/, "roundPlanning", ["round"]],
  [/^任务超时收尾·终局判定\(第 (\d+) 轮\)$/, "roundTimeout", ["round"]],
  [/^目标已全部达成，直投意图已执行完毕，任务结束$/, "directIntentsDone", []],
  [/^已排队：当前没有可运行的 LLM 配置，配置恢复后自动开始$/, "queuedNoProfile", []],
  [/^(.+) 绑定的 LLM 配置 #(\d+) 已恢复，可以继续领取任务$/, "profileRecovered", ["worker", "id"]],
];

export function systemActivityText(summary: string, t: Translate): string {
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(summary);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return summary;
}

// Generated origin-fact wrapper (db/tasks.go). Edited summaries do not match.
export function originParts(
  node: { type: string; state?: string },
  payload: Record<string, unknown>,
): { description: string; goal: string } | null {
  const { description, goal, summary } = payload;
  if (node.type !== "fact" || node.state !== "origin") return null;
  if (typeof description !== "string" || typeof goal !== "string") return null;
  return summary === `任务起点：${description}；目标：${goal}` ? { description, goal } : null;
}
