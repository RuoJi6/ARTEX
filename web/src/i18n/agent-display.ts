import catalog from "./screen-catalog.json";
import type { UITranslate } from "./use-ui-translation";

// These are shipped names, not arbitrary Agent names or prompt content. Match
// both the reserved key and the original value so user edits remain untouched.
const shippedNames: Record<string, string[]> = {
  goals: ["目标拆解", "目标拆解器"],
  planner: ["规划", "规划者"],
  mainagent: ["主", "主 Agent"],
  worker: ["执行", "Work Agent"],
  auto: ["Auto"],
  asset_mapper: ["资产梳理"],
  pentest: ["渗透测试"],
  retester: ["漏洞复测"],
};

export function agentDisplayName(agent: { key: string; name: string }, ui: (key: string) => string): string {
  return shippedNames[agent.key]?.includes(agent.name) ? ui(`builtinAgent.${agent.key}.name`) : agent.name;
}

const shippedDescriptions = new Map(
  Object.entries(catalog)
    .filter(([key]) => key.startsWith("builtinAgentDescription."))
    .map(([key, pair]) => [pair[0], key]),
);

export function agentDisplayDescription(agent: { key: string; description?: string }, ui: UITranslate): string {
  const text = agent.description ?? "";
  const key = shippedNames[agent.key] ? shippedDescriptions.get(text) : undefined;
  return key ? ui(key) : text;
}
