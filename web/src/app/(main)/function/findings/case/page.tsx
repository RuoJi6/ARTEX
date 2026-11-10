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
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { FindingCaseDetail } from "@/lib/types";

function CaseDetail() {
  const { ui } = useUITranslation();

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
      toast.success(ui("screen.1169d18c3ca229"));
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
      toast.success(ui("screen.05de947f40ed2d"));
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
          <Link href="/function/findings">{ui("screen.0618d5a1c961fa")}</Link>
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
          <AlertDescription>{ui("screen.8da7ac0026e848")}</AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert>
          <AlertDescription>{ui("screen.cae190b24fd138")}</AlertDescription>
        </Alert>
      ) : (
        <FindingCaseReviewPanel taskId={c.task_id ?? undefined} />
      )}
      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">{ui("screen.37707567ad4c9b")}</TabsTrigger>
          <TabsTrigger value="members">
            {ui("screen.6c69677e262868")}
            {c.count}
            {ui("punctuation.f2e44c6c95")}
          </TabsTrigger>
          <TabsTrigger value="history">{ui("screen.300b7381491fc0")}</TabsTrigger>
        </TabsList>
        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>{ui("screen.e3ef802bb18ea1")}</CardTitle>
              <CardDescription>{ui("screen.52f0424c627be3")}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {c.report_version !== c.version ? (
                <Alert>
                  <AlertDescription>{ui("screen.5a4461e8cf1ca1")}</AlertDescription>
                </Alert>
              ) : null}
              {!readOnly && c.active ? (
                <Button variant="outline" onClick={regenerate} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {ui("screen.776ce61beef5a0")}
                </Button>
              ) : null}
              {c.report ? (
                <Markdown text={c.report} />
              ) : (
                <p className="text-muted-foreground text-sm">{ui("screen.6d6ba94a0fca2a")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{ui("screen.e30211571e67b5")}</CardTitle>
              <CardDescription>{ui("screen.08bf5edecaeda0")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!readOnly && selected.size > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={busy}>
                      {ui("screen.08c235d9020c8a")}
                      {selected.size}
                      {ui("punctuation.f2e44c6c95")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{ui("screen.43eee10403f01c")}</AlertDialogTitle>
                      <AlertDialogDescription>{ui("screen.f133ded17c223f")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
                      <AlertDialogAction onClick={detach}>{ui("screen.95861c4b5cd644")}</AlertDialogAction>
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
              <CardTitle>{ui("screen.a44627c5d22f36")}</CardTitle>
              <CardDescription>{c.reason}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.events.map((e) => (
                <div key={e.id} className="border-b pb-3 text-sm">
                  <p>
                    {(
                      {
                        reporter: ui("screen.2181e612bd0b2b"),
                        human: ui("screen.f21f45e7986472"),
                        system: ui("screen.5b50d7c4b5950d"),
                      } as Record<string, string>
                    )[e.actor] ?? e.actor}{" "}
                    ·{" "}
                    {(
                      {
                        merge: ui("screen.c63a1da7b7ad44"),
                        detach: ui("screen.71bc4e9f153b8e"),
                        member_deleted: ui("screen.27c02ea4653866"),
                        report_updated: ui("screen.43a4e2bb711282"),
                      } as Record<string, string>
                    )[e.action] ?? e.action}{" "}
                    · {new Date(e.created_at).toLocaleString(ui("screen.91610255157661"))}
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
