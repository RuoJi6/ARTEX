"use client";
import * as React from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { toast } from "sonner";

import { FindingCaseMembers, FindingCaseReviewPanel, FindingSeverityCounts } from "@/components/finding-case-list";
import { Markdown } from "@/components/markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { FindingCaseDetail } from "@/lib/types";

function CaseDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const contextTask = params.get("context_task") ?? undefined;
  const [data, setData] = React.useState<FindingCaseDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [refresh, setRefresh] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly reloads group after a detach.
  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const v = await api.getFindingCase(id, contextTask);
        if (active) {
          setData(v);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) timer = setTimeout(load, 5000);
      }
    }
    if (id) void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, contextTask, refresh]);
  const readOnly = !!contextTask && contextTask !== data?.case.task_id;
  const select = (fid: string, on: boolean) =>
    setSelected((v) => {
      const n = new Set(v);
      if (on) n.add(fid);
      else n.delete(fid);
      return n;
    });
  async function regenerate() {
    setBusy(true);
    try {
      await api.regenerateFindingCase(id, contextTask);
      toast.success("已提交重新整理，可查看执行状态");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function detach() {
    setBusy(true);
    try {
      for (const fid of selected) await api.removeFindingCaseMember(id, fid, "人工撤销归并");
      setSelected(new Set());
      setRefresh((v) => v + 1);
      toast.success("已移出，原始记录保留");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <Spinner />
    );
  const c = data.case;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/function/findings">返回漏洞列表</Link>
        </Button>
        <h1 className="font-semibold text-xl">{c.title}</h1>
        <FindingSeverityCounts counts={c} />
      </div>
      {error ? (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!c.active ? (
        <Alert>
          <AlertDescription>此文件夹已解散或并入其他组，原始记录仍可从漏洞列表查看。</AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert>
          <AlertDescription>继承任务的漏洞组，只读。</AlertDescription>
        </Alert>
      ) : (
        <FindingCaseReviewPanel taskId={c.task_id ?? undefined} />
      )}
      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">统一报告</TabsTrigger>
          <TabsTrigger value="members">原始上报（{c.count}）</TabsTrigger>
          <TabsTrigger value="history">归并历史</TabsTrigger>
        </TabsList>
        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>完整复现与修复报告</CardTitle>
              <CardDescription>集中查看所有成员的复现步骤、证据与修复建议。</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {c.report_version !== c.version ? (
                <Alert>
                  <AlertDescription>成员或证据已变化，统一报告待更新。</AlertDescription>
                </Alert>
              ) : null}
              {!readOnly && c.active ? (
                <Button variant="outline" onClick={regenerate} disabled={busy}>
                  {busy ? <Spinner /> : null}重新生成统一报告
                </Button>
              ) : null}
              {c.report ? (
                <Markdown text={c.report} />
              ) : (
                <p className="text-muted-foreground text-sm">统一报告尚未生成，原始报告可在“原始上报”中查看。</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>原始报告和证据完整保留</CardTitle>
              <CardDescription>各条原始上报保留各自的等级、报告和证据。</CardDescription>
            </CardHeader>
            <CardContent>
              {!readOnly && selected.size > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={busy}>
                      移出所选（{selected.size}）
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>移出归并组？</AlertDialogTitle>
                      <AlertDialogDescription>
                        原报告和证据保留，Agent 不会自动把这些关系再次归并。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={detach}>移出</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              <FindingCaseMembers
                caseId={id}
                version={c.version}
                selectedIds={selected}
                onSelect={readOnly ? undefined : select}
                contextTask={contextTask}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>判断依据与操作记录</CardTitle>
              <CardDescription>{c.reason}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.events.map((e) => (
                <div key={e.id} className="border-b pb-3 text-sm">
                  <p>
                    {({ reporter: "报告 Agent", human: "人工", system: "系统" } as Record<string, string>)[e.actor] ??
                      e.actor}{" "}
                    ·{" "}
                    {(
                      {
                        merge: "归并",
                        detach: "移出成员",
                        member_deleted: "成员移出或删除",
                        report_updated: "更新统一报告",
                      } as Record<string, string>
                    )[e.action] ?? e.action}{" "}
                    · {new Date(e.created_at).toLocaleString("zh-CN")}
                  </p>
                  <p className="text-muted-foreground">
                    {e.reason}
                    {e.finding_ids.length > 0 ? ` · #${e.finding_ids.join(" / #")}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default function Page() {
  return (
    <React.Suspense fallback={<Spinner />}>
      <CaseDetail />
    </React.Suspense>
  );
}
