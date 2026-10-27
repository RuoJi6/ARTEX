"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { headersFromReqHead, requestFromEvidence } from "@/components/repeater/repeater-http";
import { seedFromEvidence } from "@/components/repeater/repeater-store";
import { TrafficEvidenceViewer } from "@/components/traffic-evidence-viewer";
import { TrafficPickerDialog } from "@/components/traffic-picker-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { FindingTraffic, FindingTrafficBinding, TrafficEvidenceRole } from "@/lib/types";

const ROLES: Record<TrafficEvidenceRole, string> = {
  baseline: "正常对照",
  proof: "漏洞证明",
  verification: "补充验证",
  supporting: "辅助证据",
};

export function FindingTrafficPanel({
  findingId,
  contextTask,
  readOnly,
  onChanged,
  stepIndex: filterStepIndex,
  title,
}: {
  findingId: string;
  contextTask?: string;
  readOnly?: boolean;
  onChanged: () => void;
  stepIndex?: number;
  title?: string;
}) {
  const [data, setData] = React.useState<FindingTraffic | null>(null);
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const router = useRouter();
  const [repeaterBusy, setRepeaterBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<FindingTrafficBinding | null>(null);
  const [role, setRole] = React.useState<TrafficEvidenceRole>("supporting");
  const [note, setNote] = React.useState("");
  const [editingStepIndex, setEditingStepIndex] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry token intentionally refreshes this request.
  React.useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api
      .findingTraffic(findingId, contextTask)
      .then((value) => {
        if (active) {
          setData(value);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [findingId, contextTask, reload, filterStepIndex]);

  async function mutate(action: () => Promise<FindingTraffic>) {
    setBusy(true);
    try {
      setData(await action());
      setEditing(null);
      onChanged();
      toast.success("流量证据已更新");
    } catch (e) {
      toast.error((e as Error).message);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    if (!data) return;
    const visibleBindings = data.bindings.filter(
      (b) => filterStepIndex === undefined || (b.step_index ?? 0) === filterStepIndex,
    );
    const target = visibleBindings[index + delta];
    if (!target) return;
    const ids = data.bindings.map((b) => b.id);
    const from = ids.indexOf(visibleBindings[index].id);
    const to = ids.indexOf(target.id);
    if (from < 0 || to < 0) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void mutate(() => api.orderFindingTraffic(findingId, ids, data.version, contextTask));
  }

  const visibleBindings =
    data?.bindings.filter((b) => filterStepIndex === undefined || (b.step_index ?? 0) === filterStepIndex) ?? [];
  const addStepIndex = filterStepIndex ?? 0;

  function renderBindings() {
    if (!data) return <Skeleton className="h-28 w-full" />;
    if (visibleBindings.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无关联流量</EmptyTitle>
            <EmptyDescription>可绑定正常对照、漏洞证明和补充验证请求。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return visibleBindings.map((b, index) => (
      <div key={b.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {index + 1}. {ROLES[b.role]}
          </Badge>
          <Badge variant="secondary">
            {b.snapshot.method} · {b.snapshot.status}
          </Badge>
          <span className="text-muted-foreground text-xs">证据 #{b.id}</span>
        </div>
        <Button
          variant="link"
          className="h-auto justify-start whitespace-normal p-0 text-left"
          onClick={() => setPreview(b.id)}
        >
          <span className="break-all font-mono text-xs">{b.snapshot.url}</span>
        </Button>
        {b.note ? <p className="whitespace-pre-wrap text-sm">{b.note}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {new Date(b.snapshot.captured_at * 1000).toLocaleString("zh-CN")}
          </span>
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" onClick={() => setPreview(b.id)}>
              查看报文
            </Button>
            <Button variant="outline" size="sm" disabled={repeaterBusy} onClick={() => void seedRepeater(b.id)}>
              送入请求重发
            </Button>
            {!readOnly ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing(b);
                    setRole(b.role);
                    setNote(b.note);
                    setEditingStepIndex(String(b.step_index ?? 0));
                  }}
                >
                  编辑说明
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`上移证据 ${b.id}`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`下移证据 ${b.id}`}
                  disabled={busy || index === visibleBindings.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void mutate(() => api.removeFindingTraffic(findingId, b.id, data.version, contextTask))
                  }
                >
                  解除绑定
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    ));
  }

  async function seedRepeater(bindingId: string) {
    setRepeaterBusy(true);
    try {
      const detail = await api.findingTrafficDetail(findingId, bindingId, contextTask);
      if (detail.request.binary) toast.info("请求体为二进制，已留空；完整正文请先下载");
      else if (detail.request.truncated) toast.info("请求体为预览片段，完整正文请先下载");
      seedFromEvidence(
        requestFromEvidence(
          {
            method: detail.binding.snapshot.method || "GET",
            url: detail.binding.snapshot.url || "",
            headersText: headersFromReqHead(detail.binding.snapshot.req_head),
            body: detail.request.binary ? "" : detail.request.content || "",
          },
          detail.binding.snapshot.req_head,
        ),
        { findingId, bindingId },
      );
      router.push("/function/repeater");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRepeaterBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {title ?? "关联流量"} {data ? `(${visibleBindings.length})` : ""}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  seedFromEvidence({ method: "GET", url: "", headersText: "", body: "" });
                  router.push("/function/repeater");
                }}
              >
                打开请求重发
              </Button>
              {!readOnly ? (
                <Button variant="outline" size="sm" disabled={!data || busy} onClick={() => setAdding(true)}>
                  <PlusIcon data-icon="inline-start" />
                  绑定流量
                </Button>
              ) : (
                <Badge variant="outline">继承证据 · 只读</Badge>
              )}
            </div>
          </div>
          <CardDescription>按复现顺序组织请求与响应。清理原始流量后，已绑定证据仍然保留。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button variant="link" onClick={() => setReload((n) => n + 1)}>
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {renderBindings()}
        </CardContent>
      </Card>
      {adding && data ? (
        <TrafficPickerDialog
          findingId={findingId}
          contextTask={contextTask}
          bound={data.bindings}
          stepIndex={addStepIndex}
          onClose={() => setAdding(false)}
          onBound={() => {
            setReload((n) => n + 1);
            onChanged();
          }}
        />
      ) : null}
      <TrafficEvidenceViewer
        findingId={findingId}
        bindingId={preview}
        contextTask={contextTask}
        onClose={() => setPreview(null)}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑流量证据</DialogTitle>
            <DialogDescription>说明这组请求/响应如何支持漏洞结论。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="evidence-role">用途</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as TrafficEvidenceRole)}>
                <SelectTrigger id="evidence-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(ROLES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-note">证据说明</FieldLabel>
              <Textarea id="evidence-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-step">复现步骤序号</FieldLabel>
              <Input
                id="evidence-step"
                type="number"
                min={0}
                step={1}
                value={editingStepIndex}
                onChange={(e) => setEditingStepIndex(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              disabled={busy || !editing || !data}
              onClick={() => {
                if (editing && data)
                  void mutate(() =>
                    api.editFindingTraffic(
                      findingId,
                      editing.id,
                      data.version,
                      { role, note, step_index: Math.max(0, Number.parseInt(editingStepIndex, 10) || 0) },
                      contextTask,
                    ),
                  );
              }}
            >
              保存说明
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
