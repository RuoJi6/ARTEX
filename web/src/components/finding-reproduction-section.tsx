"use client";

import * as React from "react";

import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { TrafficEvidenceViewer } from "@/components/traffic-evidence-viewer";
import { TrafficPickerDialog } from "@/components/traffic-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { FindingTraffic, FindingTrafficBinding, Reproduction, TrafficEvidenceRole } from "@/lib/types";

const ROLES: Record<TrafficEvidenceRole, string> = {
  baseline: "正常对照",
  proof: "漏洞证明",
  verification: "补充验证",
  supporting: "辅助证据",
};

export function hasStructuredReproduction(reproduction?: Reproduction | null) {
  return Boolean(reproduction && ((reproduction.steps?.length ?? 0) > 0 || reproduction.entry_point));
}

export function FindingReproductionSection({
  findingId,
  reproduction,
  contextTask,
  readOnly,
  onChanged,
}: {
  findingId: string;
  reproduction: Reproduction;
  contextTask?: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [traffic, setTraffic] = React.useState<FindingTraffic | null>(null);
  const [pickerStep, setPickerStep] = React.useState<number | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<FindingTrafficBinding | null>(null);
  const [role, setRole] = React.useState<TrafficEvidenceRole>("supporting");
  const [note, setNote] = React.useState("");
  const [editingStepIndex, setEditingStepIndex] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const load = React.useCallback(() => {
    api
      .findingTraffic(findingId, contextTask)
      .then(setTraffic)
      .catch(() => setTraffic(null));
  }, [findingId, contextTask]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry token intentionally refreshes this request.
  React.useEffect(() => load(), [load, reload]);

  const steps = reproduction.steps ?? [];
  const allBindings = traffic?.bindings ?? [];
  async function mutate(action: () => Promise<FindingTraffic>) {
    setBusy(true);
    try {
      setTraffic(await action());
      setEditing(null);
      onChanged?.();
      toast.success("流量证据已更新");
    } catch (error) {
      toast.error((error as Error).message);
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  function editBinding(item: FindingTrafficBinding) {
    setEditing(item);
    setRole(item.role);
    setNote(item.note);
    setEditingStepIndex(String(item.step_index ?? 0));
  }
  function bindingActions(item: FindingTrafficBinding) {
    return (
      <div key={item.id} className="flex flex-wrap items-center gap-1 rounded border px-2 py-1">
        <Badge variant="outline" className="text-xs">
          {ROLES[item.role]}
        </Badge>
        {item.note ? <span className="max-w-64 truncate text-muted-foreground text-xs">{item.note}</span> : null}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreview(item.id)}>
          <ExternalLinkIcon className="size-3" /> 查看流量
        </Button>
        {!readOnly ? (
          <>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => editBinding(item)}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={busy || !traffic}
              onClick={() => {
                if (traffic)
                  void mutate(() => api.removeFindingTraffic(findingId, item.id, traffic.version, contextTask));
              }}
            >
              解除绑定
            </Button>
          </>
        ) : null}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">测试过程 / 复现</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reproduction.entry_point ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">入口：</span>
            <code className="break-all font-mono">{reproduction.entry_point}</code>
          </div>
        ) : null}
        {(reproduction.prerequisites?.length ?? 0) > 0 ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="text-muted-foreground">前置条件</div>
            <ul className="ml-5 list-disc">
              {reproduction.prerequisites?.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {steps.map((step, index) => {
          const stepIndex = index + 1;
          const bound = allBindings.filter((item) => (item.step_index ?? 0) === stepIndex);
          return (
            <div key={stepIndex} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">步骤 {stepIndex}</Badge>
                {step.expected ? <span className="text-sm">预期：{step.expected}</span> : null}
                {step.proves ? <span className="text-muted-foreground text-sm">证明：{step.proves}</span> : null}
                <div className="ml-auto flex gap-1">
                  {bound.map(bindingActions)}
                  {!readOnly ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setPickerStep(stepIndex)}
                    >
                      <PlusIcon className="size-3" /> 绑定流量
                    </Button>
                  ) : null}
                </div>
              </div>
              {step.request?.trim() ? <HttpCodeBlock raw={step.request} /> : null}
              {step.response?.trim() ? (
                <div>
                  <div className="mb-1 text-muted-foreground text-xs">响应</div>
                  <HttpCodeBlock raw={step.response} />
                </div>
              ) : null}
              {bound.length > 0 ? (
                <div className="text-muted-foreground text-xs">已绑定 {bound.length} 条流量</div>
              ) : null}
            </div>
          );
        })}
        {allBindings.some((item) => (item.step_index ?? 0) > steps.length) ? (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">超出步骤范围</Badge>
              <span className="text-muted-foreground text-sm">这些绑定仍可编辑、解绑或改回总览/有效步骤。</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allBindings.filter((item) => (item.step_index ?? 0) > steps.length).map(bindingActions)}
            </div>
          </div>
        ) : null}
        {reproduction.provenance ? (
          <p className="text-muted-foreground text-xs">来源：{reproduction.provenance}</p>
        ) : null}
        {pickerStep !== null ? (
          <TrafficPickerDialog
            findingId={findingId}
            contextTask={contextTask}
            bound={allBindings}
            stepIndex={pickerStep}
            onClose={() => setPickerStep(null)}
            onBound={() => {
              setPickerStep(null);
              setReload((value) => value + 1);
              onChanged?.();
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
              <DialogDescription>修改用途、说明或所属复现步骤。</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reproduction-evidence-role">用途</FieldLabel>
                <Select value={role} onValueChange={(value) => setRole(value as TrafficEvidenceRole)}>
                  <SelectTrigger id="reproduction-evidence-role">
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
                <FieldLabel htmlFor="reproduction-evidence-note">证据说明</FieldLabel>
                <Textarea
                  id="reproduction-evidence-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="reproduction-evidence-step">复现步骤序号</FieldLabel>
                <Input
                  id="reproduction-evidence-step"
                  type="number"
                  min={0}
                  step={1}
                  value={editingStepIndex}
                  onChange={(event) => setEditingStepIndex(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button
                disabled={busy || !editing || !traffic}
                onClick={() => {
                  if (editing && traffic) {
                    void mutate(() =>
                      api.editFindingTraffic(
                        findingId,
                        editing.id,
                        traffic.version,
                        { role, note, step_index: Math.max(0, Number.parseInt(editingStepIndex, 10) || 0) },
                        contextTask,
                      ),
                    );
                  }
                }}
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
