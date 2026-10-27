"use client";

import { toast } from "sonner";
import { create } from "zustand";

import { getLocalStorageValue } from "../../lib/local-storage.client";
import type { RepeaterInitial } from "./repeater-http";
import {
  addTab,
  DEFAULT_GROUP_ID,
  defaultWorkspace,
  deserializeWorkspace,
  emptyTab,
  MAX_HISTORY,
  newId,
  type RepeaterHistoryEntry,
  type RepeaterTab,
  type RepeaterWorkspace,
  STORAGE_KEY,
  seedWorkspace,
  serializeWorkspace,
  type TabOptions,
  type TabSeed,
} from "./repeater-state";

export type TabPatch = Partial<
  Pick<
    RepeaterTab,
    "method" | "url" | "headersText" | "body" | "rawRequest" | "targetOrigin" | "useProxy" | "insecure" | "response"
  >
>;
type Store = {
  workspace: RepeaterWorkspace | null;
  inflight: Record<string, number>;
  beginSend: (id: string) => number | undefined;
  isCurrentSend: (id: string, generation: number) => boolean;
  clearInflight: (id: string, generation: number) => void;
  completeSend: (id: string, generation: number, entry: RepeaterHistoryEntry) => void;
  hydrate: () => void;
  createTab: (seed?: TabSeed, opts?: TabOptions) => string;
  closeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  setTabsGroup: (ids: string[], groupId: string) => void;
  renameTab: (id: string, title: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: TabPatch) => void;
  recordSend: (id: string, entry: RepeaterHistoryEntry) => void;
  createGroup: (name?: string) => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  setTabGroup: (tabId: string, groupId: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  clearWorkspace: () => void;
  seedFromEvidence: (initial: RepeaterInitial, meta?: RepeaterTab["source"], opts?: TabOptions) => string;
};

let timer: ReturnType<typeof setTimeout> | undefined;
let nextGeneration = 0;
export function flush() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const workspace = useRepeaterStore.getState().workspace;
  if (!workspace) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(workspace));
  } catch {
    try {
      // Retry with only drafts and response metadata: evict all history, then
      // response bodies. Never shrink the request drafts, even if they exceed quota.
      window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(workspace, 0));
    } catch {
      toast.error("工作区保存失败，浏览器存储空间不足或不可用，请备份请求草稿");
    }
  }
}

export const useRepeaterStore = create<Store>((set, get) => {
  function current() {
    get().hydrate();
    return get().workspace as RepeaterWorkspace;
  }
  function change(workspace: RepeaterWorkspace) {
    set({ workspace });
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }
  function editTab(id: string, patch: Partial<RepeaterTab>) {
    const workspace = current();
    if (!workspace.tabs.some((tab) => tab.id === id)) return;
    change({
      ...workspace,
      tabs: workspace.tabs.map((tab) =>
        tab.id === id ? { ...tab, ...patch, updatedAt: new Date().toISOString() } : tab,
      ),
    });
  }
  return {
    workspace: null,
    inflight: {},
    beginSend: (id) => {
      if (!current().tabs.some((tab) => tab.id === id)) return;
      const generation = ++nextGeneration;
      set({ inflight: { ...get().inflight, [id]: generation } });
      return generation;
    },
    isCurrentSend: (id, generation) =>
      get().inflight[id] === generation && !!get().workspace?.tabs.some((tab) => tab.id === id),
    clearInflight: (id, generation) => {
      if (get().inflight[id] !== generation) return;
      const inflight = { ...get().inflight };
      delete inflight[id];
      set({ inflight });
    },
    completeSend: (id, generation, entry) => {
      if (!get().isCurrentSend(id, generation)) return;
      get().recordSend(id, entry);
      get().clearInflight(id, generation);
    },
    hydrate: () => {
      if (get().workspace || typeof window === "undefined") return;
      set({ workspace: deserializeWorkspace(getLocalStorageValue(STORAGE_KEY)) });
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    },
    createTab: (seed, opts) => {
      const workspace = addTab(current(), seed, opts);
      change(workspace);
      return workspace.tabs[workspace.tabs.length - 1].id;
    },
    closeTab: (id) => get().closeTabs([id]),
    closeTabs: (ids) => {
      const workspace = current();
      const removed = new Set(ids);
      if (!workspace.tabs.some((tab) => removed.has(tab.id))) return;
      const inflight = { ...get().inflight };
      for (const id of removed) delete inflight[id];
      set({ inflight });
      const tabs = workspace.tabs.filter((tab) => !removed.has(tab.id));
      if (!tabs.length) tabs.push(emptyTab());
      const activeIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
      const active =
        tabs.find((tab) => tab.id === workspace.activeTabId) ??
        workspace.tabs.slice(activeIndex + 1).find((tab) => !removed.has(tab.id)) ??
        tabs[tabs.length - 1];
      change({
        ...workspace,
        tabs,
        activeTabId: active.id,
        groups: workspace.groups.map((group) => (group.id === active.groupId ? { ...group, collapsed: false } : group)),
      });
      flush();
    },
    renameTab: (id, title) => {
      if (title.trim()) editTab(id, { title: title.trim() });
    },
    setActiveTab: (id) => {
      const workspace = current();
      const tab = workspace.tabs.find((item) => item.id === id);
      if (tab)
        change({
          ...workspace,
          activeTabId: id,
          groups: workspace.groups.map((group) => (group.id === tab.groupId ? { ...group, collapsed: false } : group)),
        });
    },
    updateTab: editTab,
    recordSend: (id, entry) => {
      const tab = current().tabs.find((item) => item.id === id);
      if (tab) {
        editTab(id, { response: entry.response, history: [entry, ...tab.history].slice(0, MAX_HISTORY) });
        flush();
      }
    },
    createGroup: (name) => {
      const workspace = current();
      change({
        ...workspace,
        groups: [...workspace.groups, { id: newId(), name: name?.trim() || `分组 ${workspace.groups.length + 1}` }],
      });
    },
    renameGroup: (id, name) => {
      if (!name.trim()) return;
      const workspace = current();
      change({
        ...workspace,
        groups: workspace.groups.map((group) => (group.id === id ? { ...group, name: name.trim() } : group)),
      });
    },
    deleteGroup: (id) => {
      if (id === DEFAULT_GROUP_ID) return;
      const workspace = current();
      if (!workspace.groups.some((group) => group.id === id)) return;
      const now = new Date().toISOString();
      const movesTabs = workspace.tabs.some((tab) => tab.groupId === id);
      change({
        ...workspace,
        groups: workspace.groups
          .filter((group) => group.id !== id)
          .map((group) => (movesTabs && group.id === DEFAULT_GROUP_ID ? { ...group, collapsed: false } : group)),
        tabs: workspace.tabs.map((tab) =>
          tab.groupId === id ? { ...tab, groupId: DEFAULT_GROUP_ID, updatedAt: now } : tab,
        ),
      });
      flush();
    },
    setTabGroup: (tabId, groupId) => get().setTabsGroup([tabId], groupId),
    setTabsGroup: (ids, groupId) => {
      const workspace = current();
      if (!workspace.groups.some((group) => group.id === groupId)) return;
      const selected = new Set(ids);
      if (!workspace.tabs.some((tab) => selected.has(tab.id))) return;
      change({
        ...workspace,
        tabs: workspace.tabs.map((tab) =>
          selected.has(tab.id) ? { ...tab, groupId, updatedAt: new Date().toISOString() } : tab,
        ),
        groups: workspace.groups.map((group) => (group.id === groupId ? { ...group, collapsed: false } : group)),
      });
      flush();
    },
    toggleGroupCollapsed: (id) => {
      const workspace = current();
      change({
        ...workspace,
        groups: workspace.groups.map((group) => (group.id === id ? { ...group, collapsed: !group.collapsed } : group)),
      });
    },
    clearWorkspace: () => {
      set({ inflight: {} });
      change(defaultWorkspace());
      flush();
    },
    seedFromEvidence: (initial, meta, opts) => {
      const workspace = seedWorkspace(current(), initial, meta, { groupId: DEFAULT_GROUP_ID, ...opts });
      change(workspace);
      flush();
      return workspace.tabs[workspace.tabs.length - 1].id;
    },
  };
});

export function seedFromEvidence(initial: RepeaterInitial, meta?: RepeaterTab["source"], opts?: TabOptions) {
  return useRepeaterStore.getState().seedFromEvidence(initial, meta, opts);
}
