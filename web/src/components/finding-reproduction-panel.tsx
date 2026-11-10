"use client";
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
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { Finding, FindingTrafficBinding, FindingTrafficDetail } from "@/lib/types";

type ReproductionStep = {
  number: number;
  title: string;
  body: string;
};

function extractSection(report: string) {
  const match = report.match(/^##\s+(?:复现步骤|测试过程|复现过程)\s*$/im);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const tail = report.slice(start);
  const end = tail.search(/^##\s+/m);
  return (end >= 0 ? tail.slice(0, end) : tail).trim();
}

function withoutPacket(text: string) {
  return text.replace(/```(?:http|bash|shell|sh|json|text)?\s*\n[\s\S]*?```/gi, "").trim();
}

function parseSteps(report: string, fallback: string, ui: UITranslate): ReproductionStep[] {
  const section = extractSection(report);
  if (!section) {
    return [
      {
        number: 1,
        title: ui("screen.e481346b5979a5"),
        body: fallback.trim() || ui("screen.30041138cebbff"),
      },
    ];
  }

  const markers = [...section.matchAll(/^\s*(?:###\s*)?(?:步骤\s*)?(\d+)[.、:：)）]\s*(.+)$/gim)];
  if (markers.length === 0) {
    return [{ number: 1, title: ui("screen.95454d7e6d0dea"), body: withoutPacket(section) }];
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

function reportSection(report: string, headings: string[]) {
  const headingPattern = headings.join("|");
  const match = report.match(new RegExp(`^##\\s+(?:${headingPattern})\\s*$`, "im"));
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

function formatCapturedAt(value: number | string | null | undefined, ui: UITranslate) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(ui("screen.91610255157661"), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
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
  const { ui } = useUITranslation();

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
    return <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{ui("screen.8aa9c9a7dc4c02")}</p>;
  }

  async function sendToRepeater() {
    if (!detail) return;
    setRepeaterBusy(true);
    try {
      if (detail.request.binary) toast.info(ui("screen.eb861990fec8a3"));
      else if (detail.request.truncated) toast.info(ui("screen.428e2bfcf2ec39"));
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
      toast.error(ui("screen.3d521b08d3127e", { v0: (e as Error).message }));
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
          {open ? ui("screen.fe18eeee986d6a") : ui("screen.99a9b4decc0e7c")}
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
            {repeaterBusy ? ui("screen.871be265486972") : ui("screen.f69052b85f5594")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
          {error ? (
            <p className="text-destructive text-xs">
              {ui("screen.c1a4738ffaf24c")}
              {error}
            </p>
          ) : null}
          {!error && bindingId && !detail ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <LoaderCircleIcon className="size-3.5 animate-spin" /> {ui("screen.a993c010d63607")}
            </div>
          ) : null}
          {detail ? (
            <div className="space-y-3">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Badge variant="secondary">{detail.binding.snapshot.method}</Badge>
                <Badge variant="outline">{detail.binding.snapshot.status}</Badge>
                <span className="min-w-0 flex-1 break-all text-muted-foreground">{detail.binding.snapshot.url}</span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {formatCapturedAt(detail.binding.snapshot.captured_at, ui) || ui("screen.664939a1fa2ef7")}
                </span>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">{ui("screen.719dd828ca88c8")}</p>
                <HttpCodeBlock raw={packetText(detail, "request")} />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">{ui("screen.946902266aa212")}</p>
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
  const { ui } = useUITranslation();

  const steps = React.useMemo(
    () => parseSteps(finding.report ?? "", finding.evidence || finding.summary, ui),
    [finding.evidence, finding.report, finding.summary, ui],
  );
  const [traffic, setTraffic] = React.useState<FindingTrafficBinding[] | undefined>(undefined);
  const overviewSections = ["概述", "影响与危害", "受影响范围"]
    .map((heading) => ({ heading, content: reportSection(finding.report ?? "", [heading]) }))
    .filter((item) => item.content);
  const outcome = reportSection(finding.report ?? "", ["最终结果"]);
  const rootCause = reportSection(finding.report ?? "", ["根因分析"]);
  const remediation = reportSection(finding.report ?? "", ["修复建议"]);

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
            <CardTitle>{ui("screen.ce3597f37f1263")}</CardTitle>
            <CardDescription>{ui("screen.cc01d0c4b560bb")}</CardDescription>
          </div>
          <Badge variant={steps.length > 0 ? "secondary" : "outline"}>
            {steps.length} {ui("screen.d446e6c5c34aad")}
            {traffic?.length ?? finding.traffic_count ?? 0} {ui("screen.b1829a69fb6eb7")}
          </Badge>
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
            <div key={`${step.number}-${step.title}`} className="relative rounded-lg border bg-background p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-medium">
                      {ui("screen.4ec7d4554df93e")}
                      {step.number}
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
        {outcome || rootCause || remediation ? (
          <div className="space-y-3 border-t pt-3">
            {outcome ? <Markdown text={`## 最终结果\n\n${outcome}`} /> : null}
            {rootCause ? <Markdown text={`## 根因分析\n\n${rootCause}`} /> : null}
            {remediation ? <Markdown text={`## 修复建议\n\n${remediation}`} /> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
