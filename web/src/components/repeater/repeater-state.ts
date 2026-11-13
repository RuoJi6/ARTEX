import type { RepeaterSendResponse } from "@/lib/types";

import type { RepeaterInitial } from "./repeater-http";

export const STORAGE_KEY = "mysterysecurityteam_repeater_workspace_v1";
export const MAX_HISTORY = 20;
export const MAX_RESPONSE_CHARS = 256 * 1024;
// Count UTF-16 storage bytes (two per code unit), reserving headroom below 5 MiB
// for the storage key and other browser preferences.
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_GROUP_ID = "default";

export type RepeaterHistoryEntry = {
  id: string;
  method: string;
  url: string;
  headersText: string;
  body: string;
  rawRequest?: string;
  targetOrigin?: string;
  useProxy: boolean;
  insecure: boolean;
  response: RepeaterSendResponse;
  at: string;
};
export type RepeaterTab = Omit<RepeaterHistoryEntry, "at" | "response"> & {
  title: string;
  groupId: string;
  response: RepeaterSendResponse | null;
  history: RepeaterHistoryEntry[];
  source?: { findingId?: string; bindingId?: string; label?: string };
  updatedAt: string;
};
export type RepeaterGroup = { id: string; name: string; collapsed?: boolean };
export type RepeaterWorkspace = {
  version: 1;
  groups: RepeaterGroup[];
  tabs: RepeaterTab[];
  activeTabId: string | null;
};
export type TabSeed = Partial<
  Pick<
    RepeaterTab,
    "method" | "url" | "headersText" | "body" | "rawRequest" | "targetOrigin" | "useProxy" | "insecure" | "source"
  >
>;
export type TabOptions = { groupId?: string; title?: string; activate?: boolean };

let fallbackIdSequence = 0;

export function newId(): string {
  // Local workspace IDs must also work on HTTP LAN origins without randomUUID.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `repeater-${Date.now().toString(36)}-${(++fallbackIdSequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function emptyTab(groupId = DEFAULT_GROUP_ID, title = "Tab 1"): RepeaterTab {
  return {
    id: newId(),
    title,
    groupId,
    method: "GET",
    url: "",
    headersText: "",
    body: "",
    useProxy: true,
    insecure: false,
    response: null,
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

export function defaultWorkspace(): RepeaterWorkspace {
  const tab = emptyTab();
  return { version: 1, groups: [{ id: DEFAULT_GROUP_ID, name: "默认" }], tabs: [tab], activeTabId: tab.id };
}

export function addTab(workspace: RepeaterWorkspace, seed: TabSeed = {}, opts: TabOptions = {}): RepeaterWorkspace {
  const groupId = workspace.groups.some((group) => group.id === opts.groupId) ? opts.groupId : DEFAULT_GROUP_ID;
  const definedSeed = Object.fromEntries(Object.entries(seed).filter(([, value]) => value !== undefined));
  const tab = { ...emptyTab(groupId, opts.title?.trim() || `Tab ${workspace.tabs.length + 1}`), ...definedSeed };
  return {
    ...workspace,
    groups: workspace.groups.map((group) =>
      group.id === groupId && opts.activate !== false ? { ...group, collapsed: false } : group,
    ),
    tabs: [...workspace.tabs, tab],
    activeTabId: opts.activate === false ? workspace.activeTabId : tab.id,
  };
}

export function seedWorkspace(
  workspace: RepeaterWorkspace,
  initial: RepeaterInitial,
  meta: RepeaterTab["source"] = {},
  opts: TabOptions = {},
): RepeaterWorkspace {
  const method = initial.method?.trim().toUpperCase() || "GET";
  let host = "";
  try {
    host = new URL(initial.url ?? "").host;
  } catch {
    /* An empty/unfinished URL is a valid draft. */
  }
  return addTab(
    workspace,
    { ...initial, method, source: meta },
    { ...opts, title: opts.title ?? meta.label ?? `${method} ${host}`.trim() },
  );
}

export function truncateResponse(response: RepeaterSendResponse, limit = MAX_RESPONSE_CHARS): RepeaterSendResponse {
  return {
    ...response,
    body: response.body.slice(0, limit),
    body_truncated: response.body_truncated || response.body.length > limit,
  };
}

export function serializeWorkspace(workspace: RepeaterWorkspace, maxBytes = MAX_STORAGE_BYTES): string {
  const saved: RepeaterWorkspace = {
    ...workspace,
    tabs: workspace.tabs.map((tab) => ({
      ...tab,
      response: tab.response ? truncateResponse(tab.response) : null,
      history: tab.history
        .slice(0, MAX_HISTORY)
        .map((entry) => ({ ...entry, response: truncateResponse(entry.response) })),
    })),
  };
  let json = JSON.stringify(saved);
  const size = () => json.length * 2;
  // Remove the oldest send globally, including its request snapshot, first.
  const oldest = saved.tabs
    .flatMap((tab) => tab.history.map((entry) => ({ tab, entry })))
    .sort((a, b) => a.entry.at.localeCompare(b.entry.at));
  for (const { tab, entry } of oldest) {
    if (size() <= maxBytes) return json;
    tab.history = tab.history.filter((item) => item !== entry);
    json = JSON.stringify(saved);
  }
  for (const tab of [...saved.tabs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (size() <= maxBytes) return json;
    if (tab.response) tab.response = truncateResponse(tab.response, 0);
    json = JSON.stringify(saved);
  }
  // Drafts are never silently discarded, even when drafts alone exceed the soft budget.
  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isResponse(value: unknown): value is RepeaterSendResponse {
  if (!isRecord(value)) return false;
  return (
    ["status", "body_bytes", "elapsed_ms"].every((key) => typeof value[key] === "number") &&
    ["status_text", "proto", "body", "url"].every((key) => typeof value[key] === "string") &&
    typeof value.body_truncated === "boolean" &&
    isRecord(value.headers) &&
    Object.values(value.headers).every(
      (items) => Array.isArray(items) && items.every((item) => typeof item === "string"),
    ) &&
    (value.error === undefined || typeof value.error === "string")
  );
}
function isRequest(
  value: unknown,
): value is Record<string, unknown> &
  Pick<RepeaterHistoryEntry, "id" | "method" | "url" | "headersText" | "body" | "useProxy" | "insecure"> {
  return (
    isRecord(value) &&
    ["id", "method", "url", "headersText", "body"].every((key) => typeof value[key] === "string") &&
    (value.rawRequest === undefined || typeof value.rawRequest === "string") &&
    (value.targetOrigin === undefined || typeof value.targetOrigin === "string") &&
    typeof value.useProxy === "boolean" &&
    typeof value.insecure === "boolean"
  );
}

export function deserializeWorkspace(raw: string | null): RepeaterWorkspace {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.tabs))
      return defaultWorkspace();
    const groups: RepeaterGroup[] = [];
    for (const group of value.groups) {
      if (
        !isRecord(group) ||
        typeof group.id !== "string" ||
        !group.id ||
        typeof group.name !== "string" ||
        !group.name.trim() ||
        groups.some((item) => item.id === group.id)
      )
        return defaultWorkspace();
      groups.push({
        id: group.id,
        name: group.name,
        ...(typeof group.collapsed === "boolean" ? { collapsed: group.collapsed } : {}),
      });
    }
    if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) groups.unshift({ id: DEFAULT_GROUP_ID, name: "默认" });
    const tabs: RepeaterTab[] = [];
    for (const tab of value.tabs) {
      if (
        !isRequest(tab) ||
        !isRecord(tab) ||
        !tab.id ||
        typeof tab.title !== "string" ||
        typeof tab.groupId !== "string" ||
        typeof tab.updatedAt !== "string" ||
        !Array.isArray(tab.history) ||
        tabs.some((item) => item.id === tab.id) ||
        (tab.response !== null && !isResponse(tab.response))
      )
        return defaultWorkspace();
      if (
        !tab.history.every(
          (entry) => isRequest(entry) && isRecord(entry) && typeof entry.at === "string" && isResponse(entry.response),
        )
      )
        return defaultWorkspace();
      const source = isRecord(tab.source)
        ? {
            findingId: typeof tab.source.findingId === "string" ? tab.source.findingId : undefined,
            bindingId: typeof tab.source.bindingId === "string" ? tab.source.bindingId : undefined,
            label: typeof tab.source.label === "string" ? tab.source.label : undefined,
          }
        : undefined;
      tabs.push({
        ...tab,
        source,
        groupId: groups.some((group) => group.id === tab.groupId) ? tab.groupId : DEFAULT_GROUP_ID,
        history: tab.history.slice(0, MAX_HISTORY),
      } as RepeaterTab);
    }
    if (!tabs.length) tabs.push(emptyTab());
    return {
      version: 1,
      groups,
      tabs,
      activeTabId: tabs.some((tab) => tab.id === value.activeTabId) ? (value.activeTabId as string) : tabs[0].id,
    };
  } catch {
    return defaultWorkspace();
  }
}
