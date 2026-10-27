"use client";

import * as React from "react";

import { ExternalLinkIcon, PlusIcon } from "lucide-react";

import { HttpCodeBlock } from "@/components/http-code-block";
import { TrafficEvidenceViewer } from "@/components/traffic-evidence-viewer";
import { TrafficPickerDialog } from "@/components/traffic-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { FindingTraffic, Reproduction } from "@/lib/types";

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
  const [reload, setReload] = React.useState(0);
  const load = React.useCallback(() => {
    api.findingTraffic(findingId, contextTask).then(setTraffic).catch(() => setTraffic(null));
  }, [findingId, contextTask]);
  React.useEffect(() => load(), [load, reload]);

  const steps = reproduction.steps ?? [];
  const allBindings = traffic?.bindings ?? [];
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
              {reproduction.prerequisites?.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
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
                {step.proves ? <span className="text-sm text-muted-foreground">证明：{step.proves}</span> : null}
                <div className="ml-auto flex gap-1">
                  {bound.map((item) => (
                    <Button key={item.id} variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreview(item.id)}>
                      <ExternalLinkIcon className="size-3" /> 查看流量
                    </Button>
                  ))}
                  {!readOnly ? (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerStep(stepIndex)}>
                      <PlusIcon className="size-3" /> 绑定流量
                    </Button>
                  ) : null}
                </div>
              </div>
              {step.request?.trim() ? <HttpCodeBlock raw={step.request} /> : null}
              {step.response?.trim() ? (
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">响应</div>
                  <HttpCodeBlock raw={step.response} />
                </div>
              ) : null}
              {bound.length > 0 ? <div className="text-xs text-muted-foreground">已绑定 {bound.length} 条流量</div> : null}
            </div>
          );
        })}
        {reproduction.provenance ? <p className="text-xs text-muted-foreground">来源：{reproduction.provenance}</p> : null}
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
        <TrafficEvidenceViewer findingId={findingId} bindingId={preview} contextTask={contextTask} onClose={() => setPreview(null)} />
      </CardContent>
    </Card>
  );
}
