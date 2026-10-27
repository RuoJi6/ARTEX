"use client";

import * as React from "react";

import { FolderPlus } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";

import { RepeaterEditor } from "./repeater-editor";
import { RepeaterTopBar } from "./repeater-navigator";
import { useRepeaterStore } from "./repeater-store";

export function RepeaterWorkspace() {
  const store = useRepeaterStore();
  const { workspace, hydrate } = store;
  const [rename, setRename] = React.useState<{ kind: "tab" | "group"; id: string; name: string } | null>(null);
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
    <div className="flex min-h-[calc(100dvh-7rem)] min-w-0 flex-col gap-4 xl:h-[calc(100dvh-8rem)] xl:min-h-[600px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">请求重发</h1>
          <p className="text-muted-foreground text-sm">编辑、发送并比较请求 · 草稿与近期响应保存在此浏览器</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => store.createGroup()}>
            <FolderPlus data-icon="inline-start" />
            新建分组
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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <RepeaterTopBar workspace={workspace} onRename={setRename} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {active ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate font-medium text-sm" title={active.title}>
                  {active.title}
                </h2>
                <Field orientation="horizontal" className="w-auto">
                  <FieldLabel htmlFor="repeater-group">移入分组</FieldLabel>
                  <Select value={active.groupId} onValueChange={(id) => store.setTabGroup(active.id, id)}>
                    <SelectTrigger id="repeater-group" className="w-36">
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
            </>
          ) : (
            <Button onClick={() => store.createTab()}>新建标签</Button>
          )}
        </main>
      </div>
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
