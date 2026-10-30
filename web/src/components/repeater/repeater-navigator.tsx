"use client";

import * as React from "react";

import { ChevronDown, ChevronRight, ListFilter, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { DEFAULT_FILTERS, matchesRepeaterFilters } from "./repeater-filter";
import { RepeaterHistory } from "./repeater-history";
import type { RepeaterWorkspace } from "./repeater-state";
import { useRepeaterStore } from "./repeater-store";

type Rename = { kind: "tab" | "group"; id: string; name: string };

export function RepeaterNavigator({
  workspace,
  onRename,
  className,
}: {
  workspace: RepeaterWorkspace;
  onRename: (value: Rename) => void;
  className?: string;
}) {
  const store = useRepeaterStore();
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [expanded, setExpanded] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = React.useState(false);
  const visible = React.useMemo(
    () => workspace.tabs.filter((tab) => matchesRepeaterFilters(tab, filters)),
    [workspace.tabs, filters],
  );
  const selectedIds = workspace.tabs.filter((tab) => selected.has(tab.id)).map((tab) => tab.id);
  const visibleIds = new Set(visible.map((tab) => tab.id));
  const hiddenSelected = selectedIds.filter((id) => !visibleIds.has(id)).length;
  const filtering = Object.entries(filters).some(
    ([key, value]) => value !== DEFAULT_FILTERS[key as keyof typeof filters],
  );
  const allSelected = visible.length > 0 && visible.every((tab) => selected.has(tab.id));
  const active = workspace.tabs.find((tab) => tab.id === workspace.activeTabId);
  const methods = [
    ...new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      ...workspace.tabs.map((tab) => tab.method.toUpperCase()),
    ]),
  ];
  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <nav
      aria-label="请求重发分组和标签"
      className={cn(
        "flex h-[28rem] min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-md border p-3 lg:h-[calc(100dvh-14rem)] lg:min-h-[480px] lg:w-80 xl:h-auto xl:min-h-0",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-2">
        <Input
          aria-label="全局搜索重发请求"
          placeholder="搜索全部标题、请求或响应…"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
        <div className="flex gap-2">
          <Select value={filters.method} onValueChange={(method) => setFilters({ ...filters, method })}>
            <SelectTrigger aria-label="筛选请求方法" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部方法</SelectItem>
                {methods.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            aria-expanded={expanded}
            aria-controls="repeater-extra-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <ListFilter />
            筛选
          </Button>
        </div>
        {expanded ? (
          <div id="repeater-extra-filters" className="flex flex-col gap-2">
            <Field className="gap-1">
              <FieldLabel htmlFor="repeater-filter-path" className="text-xs">
                请求路径
              </FieldLabel>
              <Input
                id="repeater-filter-path"
                placeholder="例如 /api/upload"
                value={filters.path}
                onChange={(event) => setFilters({ ...filters, path: event.target.value })}
              />
            </Field>
            <Field className="gap-1">
              <FieldLabel htmlFor="repeater-filter-response" className="text-xs">
                响应内容
              </FieldLabel>
              <Input
                id="repeater-filter-response"
                placeholder="响应头或正文关键字"
                value={filters.response}
                onChange={(event) => setFilters({ ...filters, response: event.target.value })}
              />
            </Field>
            <Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status })}>
              <SelectTrigger aria-label="筛选响应状态" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部响应状态</SelectItem>
                  <SelectItem value="pending">尚未响应</SelectItem>
                  <SelectItem value="error">发送失败</SelectItem>
                  {["1xx", "2xx", "3xx", "4xx", "5xx"].map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
          <span>
            {visible.length} / {workspace.tabs.length} 个请求
          </span>
          {filtering ? (
            <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              清除筛选
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-y py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="repeater-select-visible"
            aria-label="全选筛选结果"
            checked={allSelected || (visible.some((tab) => selected.has(tab.id)) ? "indeterminate" : false)}
            disabled={!visible.length}
            onCheckedChange={(checked) =>
              setSelected((current) => {
                const next = new Set(current);
                for (const tab of visible) {
                  if (checked === true) next.add(tab.id);
                  else next.delete(tab.id);
                }
                return next;
              })
            }
          />
          <label htmlFor="repeater-select-visible" className="text-xs">
            全选结果
          </label>
          <span className="ml-auto text-muted-foreground text-xs">
            已选 {selectedIds.length} 条{hiddenSelected ? `（隐藏 ${hiddenSelected}）` : ""}
          </span>
          {selectedIds.length ? (
            <Button variant="ghost" size="icon-sm" aria-label="清空勾选" onClick={() => setSelected(new Set())}>
              <X />
            </Button>
          ) : null}
        </div>
        {selectedIds.length ? (
          <div className="flex gap-2">
            <Select
              value=""
              onValueChange={(groupId) => {
                store.setTabsGroup(selectedIds, groupId);
                toast.success(`已移动 ${selectedIds.length} 个请求`);
                setSelected(new Set());
              }}
            >
              <SelectTrigger aria-label="批量移动到分组" className="min-w-0 flex-1">
                <SelectValue placeholder="移动到分组…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {workspace.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="destructive" size="sm" onClick={() => setDeleting(true)}>
              删除所选
            </Button>
          </div>
        ) : null}
      </div>
      <section className="min-h-24 flex-1 overflow-y-auto" aria-label="重发请求列表">
        {workspace.groups.map((group) => {
          const tabs = visible.filter((tab) => tab.groupId === group.id);
          if (filtering && !tabs.length) return null;
          const collapsed = group.collapsed && !filtering;
          return (
            <div key={group.id} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${collapsed ? "展开" : "折叠"}分组 ${group.name}`}
                  disabled={filtering}
                  onClick={() => store.toggleGroupCollapsed(group.id)}
                >
                  {collapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
                <span className="min-w-0 flex-1 truncate font-medium text-sm" title={group.name}>
                  {group.name}
                </span>
                <span className="text-muted-foreground text-xs">{tabs.length}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`重命名分组 ${group.name}`}
                  onClick={() => onRename({ kind: "group", id: group.id, name: group.name })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`新建标签 · ${group.name}`}
                  title="新建标签"
                  onClick={() => store.createTab({}, { groupId: group.id })}
                >
                  <Plus />
                </Button>
              </div>
              {!collapsed
                ? tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={cn(
                        "flex min-w-0 items-center gap-1 rounded-md px-1",
                        active?.id === tab.id && "bg-accent",
                      )}
                    >
                      <Checkbox
                        aria-label={`勾选请求 ${tab.title}`}
                        checked={selected.has(tab.id)}
                        onCheckedChange={(checked) => toggle(tab.id, checked === true)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-current={active?.id === tab.id ? "page" : undefined}
                        className="min-w-0 flex-1 justify-start px-1"
                        onClick={() => store.setActiveTab(tab.id)}
                        onDoubleClick={() => onRename({ kind: "tab", id: tab.id, name: tab.title })}
                        title={`${tab.title}\n${tab.url}`}
                      >
                        <span className="truncate">{tab.title}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`重命名标签 ${tab.title}`}
                        onClick={() => onRename({ kind: "tab", id: tab.id, name: tab.title })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`关闭标签 ${tab.title}`}
                        onClick={() => store.closeTab(tab.id)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
        {!visible.length ? (
          <p className="p-2 text-muted-foreground text-xs">没有匹配的请求，清除筛选后可查看全部。</p>
        ) : null}
      </section>
      <div className="flex max-h-[35%] min-h-20 flex-1 flex-col">
        <RepeaterHistory tab={active} />
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除所选的 {selectedIds.length} 个请求？</AlertDialogTitle>
            <AlertDialogDescription>
              这些请求的草稿和历史响应将从当前浏览器删除
              {hiddenSelected ? `，其中包含 ${hiddenSelected} 个被筛选隐藏的请求` : ""}
              。正在发送的请求将不再保存返回结果。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => {
                store.closeTabs(selectedIds);
                toast.success(`已删除 ${selectedIds.length} 个请求`);
                setSelected(new Set());
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
