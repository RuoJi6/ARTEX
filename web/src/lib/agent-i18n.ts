"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import chinese from "../../messages/zh-CN.json";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/types";

type AgentLabel = { key: string; name: string; description?: string; builtin?: boolean };

export function useAgentLabels() {
  const t = useTranslations("builtinAgents");
  return useMemo(() => {
    const seeded = (key: string, builtin?: boolean) => builtin || key === "retester" || key === "reporter" || key === "credential_processor";
    const display = (key: string, fallback: string) => {
      const original = key.split(".").reduce<unknown>((value, part) =>
        value && typeof value === "object" && Object.hasOwn(value, part)
          ? (value as Record<string, unknown>)[part] : undefined, chinese.builtinAgents);
      return original === fallback && t.has(key) ? t(key) : fallback;
    };
    const name = (agent: AgentLabel) => seeded(agent.key, agent.builtin)
      ? display(`${agent.key}.name`, agent.name) : agent.name;
    const description = (agent: AgentLabel) => seeded(agent.key, agent.builtin)
      ? display(`${agent.key}.description`, agent.description ?? "") : agent.description ?? "";
    const nameByKey = (key: string, lookup: (key: string) => AgentLabel | undefined) => {
      const agent = lookup(key);
      return (agent && name(agent)) || key;
    };
    const varLabel = (key: string, builtin: boolean, variable: string, fallback: string) =>
      seeded(key, builtin) ? display(`${key}.vars.${variable}`, fallback) : fallback;
    return { name, description, nameByKey, varLabel };
  }, [t]);
}

let agentList: Promise<Agent[]> | undefined;
export function useAgentNameByKey() {
  const labels = useAgentLabels();
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    let active = true;
    agentList ??= api.agents().catch((error) => { agentList = undefined; throw error; });
    void agentList.then((list) => { if (active) setAgents(list); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return useCallback((key: string) => labels.nameByKey(key, (id) => agents.find((a) => a.key === id)), [agents, labels]);
}
