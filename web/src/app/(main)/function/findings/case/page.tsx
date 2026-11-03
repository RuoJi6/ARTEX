"use client";

import { useLocaleFormatting } from "@/i18n/formatting";

import { useTranslations } from "next-intl";
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
  const format = useLocaleFormatting();
  const ui = useTranslations();
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
      toast.success(ui("core.cases.queued"));
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
      toast.success(ui("core.cases.removed"));
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
          <Link href="/function/findings">{ui("core.cases.back")}</Link>
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
          <AlertDescription>{ui("core.cases.dissolved")}</AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert>
          <AlertDescription>{ui("core.cases.inherited")}</AlertDescription>
        </Alert>
      ) : (
        <FindingCaseReviewPanel taskId={c.task_id ?? undefined} />
      )}
      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">{ui("core.findings.combinedReport")}</TabsTrigger>
          <TabsTrigger value="members">{ui("core.cases.originalCount", { count: c.count })}</TabsTrigger>
          <TabsTrigger value="history">{ui("core.cases.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>{ui("core.cases.reportTitle")}</CardTitle>
              <CardDescription>{ui("core.cases.reportDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {c.report_version !== c.version ? (
                <Alert>
                  <AlertDescription>{ui("core.cases.stale")}</AlertDescription>
                </Alert>
              ) : null}
              {!readOnly && c.active ? (
                <Button variant="outline" onClick={regenerate} disabled={busy}>
                  {busy ? <Spinner /> : null}{ui("core.cases.regenerate")}</Button>
              ) : null}
              {c.report ? (
                <Markdown text={c.report} />
              ) : (
                <p className="text-muted-foreground text-sm">{ui("core.cases.noReport")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{ui("core.cases.keepOriginal")}</CardTitle>
              <CardDescription>{ui("core.cases.originalDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!readOnly && selected.size > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={busy}>
                      {ui("core.cases.removeSelectedCount", { count: selected.size })}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{ui("core.cases.removeTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {ui("core.cases.removeDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{ui("password.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={detach}>{ui("core.cases.remove")}</AlertDialogAction>
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
              <CardTitle>{ui("core.cases.historyDescription")}</CardTitle>
              <CardDescription>{c.reason}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.events.map((e) => (
                <div key={e.id} className="border-b pb-3 text-sm">
                  <p>
                    {({ reporter: ui("core.cases.reportAgent"), human: ui("core.cases.manual"), system: ui("nav.system") } as Record<string, string>)[e.actor] ??
                      e.actor}{" "}
                    ·{" "}
                    {(
                      {
                        merge: ui("core.cases.merge"),
                        detach: ui("core.cases.removeMember"),
                        member_deleted: ui("core.cases.memberChanged"),
                        report_updated: ui("core.cases.updateReport"),
                      } as Record<string, string>
                    )[e.action] ?? e.action}{" "}
                    · {format.dateTime(new Date(e.created_at), "timestamp")}
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
