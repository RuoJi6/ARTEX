"use client";

import * as React from "react";

import { Library, Plus, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { RepeaterEditor } from "./repeater-editor";
import { RepeaterNavigator } from "./repeater-navigator";
import { useRepeaterStore } from "./repeater-store";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-sky-600 dark:text-sky-400",
  POST: "text-emerald-600 dark:text-emerald-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-rose-600 dark:text-rose-400",
};

function methodColor(method: string) {
  return METHOD_COLORS[method.toUpperCase()] ?? "text-muted-foreground";
}

function statusColor(status: number) {
  if (status >= 500) return "text-rose-600 dark:text-rose-400";
  if (status >= 400) return "text-amber-600 dark:text-amber-400";
  if (status >= 300) return "text-sky-600 dark:text-sky-400";
  if (status >= 200) return "text-emerald-600 dark:text-emerald-400";
  return "text-muted-foreground";
}

export function RepeaterWorkspace() {
  const store = useRepeaterStore();
  const { workspace, hydrate } = store;
  const [rename, setRename] = React.useState<{ kind: "tab" | "group"; id: string; name: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  React.useEffect(() => {
    hydrate();
  }, [hydrate]);
  if (!workspace) return <Skeleton className="h-[70vh] w-full" />;
  const active = workspace.tabs.find((tab) => tab.id === workspace.activeTabId);

  function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (!rename?.name.trim()) return;
    if (rename.kind === "tab") store.renameTab(rename.id, rename.name);
    else store.renameGroup(rename.id, rename.name);
    setRename(null);
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] min-w-0 flex-col gap-2 xl:h-[calc(100dvh-8rem)] xl:min-h-[600px]">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <div className="min-w-0">
          <h1 className="font-semibold text-lg tracking-tight">请求重发</h1>
          <p className="text-muted-foreground text-xs">Repeater · 草稿与历史响应保存在此浏览器</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
            <Library data-icon="inline-start" />
            请求库
          </Button>
          <Button size="sm" onClick={() => store.createTab()}>
            <Plus data-icon="inline-start" />
            新建请求
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                清空工作区
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清空请求重发工作区？</AlertDialogTitle>
                <AlertDialogDescription>所有分组、标签、请求草稿和历史响应都会被删除。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => store.clearWorkspace()}>
                  确认清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex min-h-10 min-w-0 items-center rounded-md border bg-muted/20 p-1">
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {workspace.tabs.map((tab) => {
            const selected = tab.id === workspace.activeTabId;
            return (
              <div
                key={tab.id}
                className={cn(
                  "group flex min-w-0 max-w-64 shrink-0 items-center rounded-sm border border-transparent",
                  selected && "border-border bg-background shadow-xs",
                )}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 justify-start gap-2 rounded-sm px-2 text-xs"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => store.setActiveTab(tab.id)}
                  onDoubleClick={() => setRename({ kind: "tab", id: tab.id, name: tab.title })}
                  title={`${tab.title}\n${tab.url}`}
                >
                  <span className={cn("font-mono font-semibold", methodColor(tab.method))}>{tab.method}</span>
                  <span className="truncate">{tab.title}</span>
                  {tab.response?.status ? (
                    <span className={cn("font-mono text-[10px]", statusColor(tab.response.status))}>
                      {tab.response.status}
                    </span>
                  ) : null}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mr-0.5 opacity-60 hover:opacity-100"
                  aria-label={`关闭请求 ${tab.title}`}
                  onClick={() => store.closeTab(tab.id)}
                >
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="新建请求" onClick={() => store.createTab()}>
          <Plus />
        </Button>
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border bg-muted/10 p-2">
        {active ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="truncate font-medium text-sm" title={active.title}>
                {active.title}
              </span>
              <Field orientation="horizontal" className="ml-auto w-auto gap-2">
                <FieldLabel htmlFor="repeater-group" className="text-muted-foreground text-xs">
                  分组
                </FieldLabel>
                <Select value={active.groupId} onValueChange={(id) => store.setTabGroup(active.id, id)}>
                  <SelectTrigger id="repeater-group" className="h-7 w-32 text-xs">
                    <SelectValue />
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
              </Field>
            </div>
            <RepeaterEditor key={active.id} tab={active} />
          </div>
        ) : (
          <Button onClick={() => store.createTab()}>新建请求</Button>
        )}
      </main>
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent side="left" className="w-[min(92vw,380px)] max-w-none p-3">
          <SheetHeader className="px-1 pb-1">
            <SheetTitle>请求库</SheetTitle>
            <SheetDescription>搜索、分组和恢复请求历史。</SheetDescription>
          </SheetHeader>
          <RepeaterNavigator
            workspace={workspace}
            onRename={setRename}
            className="h-full min-h-0 w-full rounded-md border-0 p-1 lg:h-full lg:min-h-0 lg:w-full xl:h-full"
          />
        </SheetContent>
      </Sheet>
      <Dialog
        open={rename !== null}
        onOpenChange={(open) => {
          if (!open) setRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rename?.kind === "group" ? "重命名分组" : "重命名标签"}</DialogTitle>
            <DialogDescription>输入便于识别的名称。</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveName} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="repeater-name">名称</FieldLabel>
              <Input
                id="repeater-name"
                value={rename?.name ?? ""}
                onChange={(event) =>
                  setRename((current) => (current ? { ...current, name: event.target.value } : current))
                }
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRename(null)}>
                取消
              </Button>
              <Button type="submit" disabled={!rename?.name.trim()}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
