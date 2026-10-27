import { buildRawResponse } from "./repeater-http";
import type { RepeaterGroup, RepeaterTab } from "./repeater-state";

export type RepeaterFilters = { query: string; method: string; path: string; response: string; status: string };
export const DEFAULT_FILTERS: RepeaterFilters = { query: "", method: "all", path: "", response: "", status: "all" };

export function filterRepeaterTabs(tabs: RepeaterTab[], filters: RepeaterFilters, groupId = "all"): RepeaterTab[] {
  return tabs.filter((tab) => (groupId === "all" || tab.groupId === groupId) && matchesRepeaterFilters(tab, filters));
}

export function groupRepeaterTabs(tabs: RepeaterTab[], groups: RepeaterGroup[]) {
  return groups.map((group) => ({ group, tabs: tabs.filter((tab) => tab.groupId === group.id) }));
}

export function matchesRepeaterFilters(tab: RepeaterTab, filters: RepeaterFilters): boolean {
  const includes = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  if (filters.method !== "all" && tab.method.toUpperCase() !== filters.method) return false;
  let path = tab.url;
  try {
    const url = new URL(tab.url);
    path = url.pathname + url.search;
  } catch {
    /* Incomplete drafts remain searchable. */
  }
  if (!includes(path, filters.path)) return false;
  const rawResponse = tab.response ? `${buildRawResponse(tab.response)}\n${tab.response.error || ""}` : "";
  if (!includes(rawResponse, filters.response)) return false;
  if (filters.status === "pending" && tab.response) return false;
  if (filters.status === "error" && (!tab.response?.error || tab.response.status)) return false;
  if (/^[1-5]xx$/.test(filters.status) && Math.floor((tab.response?.status || 0) / 100) !== Number(filters.status[0]))
    return false;
  return includes(
    [tab.title, tab.url, tab.rawRequest || "", tab.headersText, tab.body, rawResponse].join("\n"),
    filters.query,
  );
}
