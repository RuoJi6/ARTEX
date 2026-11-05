"use client";
import { useLocaleFormatting } from "@/i18n/formatting";

import { useTranslations } from "next-intl";

import * as React from "react";

import { useRouter } from "next/navigation";

import { ChevronDownIcon, ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { Markdown } from "@/components/markdown";
import { headersFromReqHead, requestFromEvidence } from "@/components/repeater/repeater-http";
import { seedFromEvidence } from "@/components/repeater/repeater-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Finding, FindingTrafficBinding, FindingTrafficDetail } from "@/lib/types";

type ReproductionStep = {
  number: number;
  title: string;
  body: string;
};

function extractSection(report: string) {
  const match = report.match(/^##\s+(?:复现步骤|测试过程|复现过程|Reproduction|Steps to reproduce)[^\n]*$/im);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const tail = report.slice(start);
  const end = tail.search(/^##\s+/m);
  return (end >= 0 ? tail.slice(0, end) : tail).trim();
}

function withoutPacket(text: string) {
  return text.replace(/```(?:http|bash|shell|sh|json|text)?\s*\n[\s\S]*?```/gi, "").trim();
}

function parseSteps(report: string, fallback: string, labels: { verify: string; noSteps: string; process: string }): ReproductionStep[] {
  const section = extractSection(report);
  if (!section) {
    return [
      {
        number: 1,
        title: labels.verify,
        body: fallback.trim() || labels.noSteps,
      },
    ];
  }

  const markers = [...section.matchAll(/^\s*(?:###\s*)?(?:(?:步骤|Step)\s*)?(\d+)[.、:：)）]\s*(.+)$/gim)];
  if (markers.length === 0) {
    return [{ number: 1, title: labels.process, body: withoutPacket(section) }];
  }

  return markers.map((marker, index) => {
    const start = marker.index ?? 0;
    const end = markers[index + 1]?.index ?? section.length;
    const raw = section.slice(start, end).trim();
    const firstLine = marker[2].trim();
    const rest = raw.slice(marker[0].length).trim();
    return {
      number: Number(marker[1]),
      title: firstLine,
      body: withoutPacket(rest),
    };
  });
}

// Chinese headings come from the Reporter prompt; English ones from output_language=en.
const SECTION_HEADINGS = {
  summary: ["概述", "Overview", "Summary"],
  impact: ["影响与危害", "Impact"],
  affected: ["受影响范围", "Affected"],
  result: ["最终结果", "Final result", "Outcome", "Result"],
  rootCause: ["根因分析", "Root cause"],
  remediation: ["修复建议", "Remediation", "Recommendation", "Fix"],
};
type SectionKey = keyof typeof SECTION_HEADINGS;

function reportSection(report: string, headings: string[]) {
  const headingPattern = headings.join("|");
  // Prefix match accepts English reports (e.g. "## Root cause analysis").
  const match = report.match(new RegExp(`^##\\s+(?:${headingPattern})[^\\n]*$`, "im"));
  if (!match || match.index === undefined) return "";
  const tail = report.slice(match.index + match[0].length);
  const end = tail.search(/^##\s+/m);
  return (end >= 0 ? tail.slice(0, end) : tail).trim();
}

function packetText(detail: FindingTrafficDetail, side: "request" | "response") {
  const head = side === "request" ? detail.binding.snapshot.req_head : detail.binding.snapshot.resp_head;
  const body = detail[side].content;
  return [head, body].filter(Boolean).join("\n\n").trim();
}

function formatCapturedAt(value: number | string | null | undefined, dateTime: (value: Date) => string) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : dateTime(date);
}

function PacketDisclosure({
  findingId,
  bindingId,
  contextTask,
}: {
  findingId: string;
  bindingId?: string;
  contextTask?: string;
}) {
  const format = useLocaleFormatting();
  const ui = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<FindingTrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  const [repeaterBusy, setRepeaterBusy] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (!open || !bindingId || detail) return;
    let active = true;
    setError("");
    api
      .findingTrafficDetail(findingId, bindingId, contextTask)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [bindingId, contextTask, detail, findingId, open]);

  if (!bindingId) {
    return <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{ui("core.reproduction.noTraffic")}</p>;
  }

  async function sendToRepeater() {
    if (!detail) return;
    setRepeaterBusy(true);
    try {
      if (detail.request.binary) toast.info(ui("core.traffic.binaryRequest"));
      else if (detail.request.truncated) toast.info(ui("core.traffic.truncatedRequest"));
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
        { findingId, bindingId: detail.binding.id },
      );
      router.push("/function/repeater");
    } catch (e) {
      toast.error(ui("core.traffic.importFailed", { error: (e as Error).message }));
    } finally {
      setRepeaterBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          {open ? ui("core.reproduction.hidePacket") : ui("core.reproduction.showPacket")}
        </Button>
        {open && detail ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={repeaterBusy}
            onClick={() => void sendToRepeater()}
          >
            {repeaterBusy ? ui("core.reproduction.preparing") : ui("core.traffic.sendRepeater")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
          {error ? <p className="text-destructive text-xs">{ui("core.reproduction.packetError")}{error}</p> : null}
          {!error && bindingId && !detail ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <LoaderCircleIcon className="size-3.5 animate-spin" /> {ui("core.reproduction.loadingTraffic")}</div>
          ) : null}
          {detail ? (
            <div className="space-y-3">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Badge variant="secondary">{detail.binding.snapshot.method}</Badge>
                <Badge variant="outline">{detail.binding.snapshot.status}</Badge>
                <span className="min-w-0 flex-1 break-all text-muted-foreground">{detail.binding.snapshot.url}</span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {formatCapturedAt(detail.binding.snapshot.captured_at, (date) => format.dateTime(date, "timestamp")) || ui("core.traffic.unknownTime")}
                </span>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">{ui("trafficEvidence.viewer.request")}</p>
                <HttpCodeBlock raw={packetText(detail, "request")} />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">{ui("trafficEvidence.viewer.response")}</p>
                <HttpCodeBlock raw={packetText(detail, "response")} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FindingReproductionPanel({ finding, contextTask }: { finding: Finding; contextTask?: string }) {
  const ui = useTranslations();
  const steps = React.useMemo(
    () => parseSteps(finding.report ?? "", finding.evidence || finding.summary, { verify: ui("core.reproduction.verify"), noSteps: ui("core.reproduction.noSteps"), process: ui("core.reproduction.process") }),
    [finding.evidence, finding.report, finding.summary, ui],
  );
  const [traffic, setTraffic] = React.useState<FindingTrafficBinding[] | undefined>(undefined);
  const report = finding.report ?? "";
  const section = (key: SectionKey) => ({ heading: ui(`core.reproduction.${key}`), content: reportSection(report, SECTION_HEADINGS[key]) });
  const overviewSections = (["summary", "impact", "affected"] as const).map(section).filter((item) => item.content);
  const closingSections = (["result", "rootCause", "remediation"] as const).map(section).filter((item) => item.content);

  React.useEffect(() => {
    let active = true;
    api
      .findingTraffic(finding.id, contextTask)
      .then((value) => {
        if (active) setTraffic(value.bindings);
      })
      .catch(() => {
        if (active) setTraffic([]);
      });
    return () => {
      active = false;
    };
  }, [contextTask, finding.id]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{ui("core.reproduction.steps")}</CardTitle>
            <CardDescription>{ui("core.reproduction.stepsHint")}</CardDescription>
          </div>
          <Badge variant={steps.length > 0 ? "secondary" : "outline"}>
            {ui("core.reproduction.counts", { steps: steps.length, packets: traffic?.length ?? finding.traffic_count ?? 0 })}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {overviewSections.map((section) => (
          <div key={section.heading} className="rounded-lg bg-muted/30 px-3 py-2.5 text-sm">
            <Markdown text={`## ${section.heading}\n\n${section.content}`} />
          </div>
        ))}
        {steps.map((step, index) => {
          const binding = traffic?.find((item) => item.position === index) ?? traffic?.[index];
          return (
            <div key={step.number} className="relative rounded-lg border bg-background p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-medium">
                      {ui("core.reproduction.stepBadge", { number: step.number })}
                    </Badge>
                    <h3 className="min-w-0 break-words font-semibold text-sm leading-5">{step.title}</h3>
                  </div>
                </div>
                {step.body ? <Markdown text={step.body} /> : null}
                <PacketDisclosure findingId={finding.id} bindingId={binding?.id} contextTask={contextTask} />
              </div>
            </div>
          );
        })}
        {closingSections.length ? (
          <div className="space-y-3 border-t pt-3">
            {closingSections.map((item) => <Markdown key={item.heading} text={`## ${item.heading}\n\n${item.content}`} />)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
