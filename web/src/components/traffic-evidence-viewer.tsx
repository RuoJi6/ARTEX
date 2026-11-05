"use client";
import { useLocaleFormatting } from "@/i18n/formatting";

import { useTranslations } from "next-intl";

import * as React from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { headersFromReqHead, requestFromEvidence } from "@/components/repeater/repeater-http";
import { seedFromEvidence } from "@/components/repeater/repeater-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { FindingTrafficDetail, TrafficDetail } from "@/lib/types";

function formatCapturedAt(value: number | string | null | undefined, dateTime: (value: Date) => string) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return dateTime(date);
}

export function TrafficEvidenceViewer({
  findingId,
  bindingId,
  contextTask,
  onClose,
}: {
  findingId: string;
  bindingId: string | null;
  contextTask?: string;
  onClose: () => void;
}) {
  const format = useLocaleFormatting();
  const ui = useTranslations();
  const t = useTranslations("trafficEvidence");
  const [detail, setDetail] = React.useState<FindingTrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => {
    if (!bindingId) return;
    let active = true;
    setDetail(null);
    setError("");
    api
      .findingTrafficDetail(findingId, bindingId, contextTask)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [findingId, bindingId, contextTask]);

  async function more(side: "request" | "response") {
    if (!detail || !bindingId) return;
    setBusy(true);
    try {
      const next = await api.findingTrafficBody(findingId, bindingId, side, detail[side].next_offset, contextTask);
      setDetail((current) =>
        current?.binding.id === bindingId
          ? { ...current, [side]: { ...next, content: current[side].content + next.content } }
          : current,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openRepeater() {
    if (!detail) return;
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
  }

  return (
    <Dialog
      open={bindingId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2 pe-8">
            <div>
              <DialogTitle>{ui("core.traffic.evidenceTitle")}{bindingId}</DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DialogDescription className="break-all">
                  {detail?.binding.snapshot.url ?? ui("trafficEvidence.viewer.fallbackDesc")}
                </DialogDescription>
                {detail ? (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {ui("core.traffic.capturedAt")}{formatCapturedAt(detail.binding.snapshot.captured_at, (date) => format.dateTime(date, "timestamp")) || ui("llmPage.profile.toast.unknown")}
                  </span>
                ) : null}
              </div>
            </div>
            {detail ? (
              <Button variant="outline" size="sm" onClick={openRepeater}>
                {ui("core.traffic.sendRepeater")}</Button>
            ) : null}
          </div>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {(["request", "response"] as const).map((side) => (
              <div key={side} className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{side === "request" ? ui("trafficEvidence.viewer.request") : ui("trafficEvidence.viewer.response")}</p>
                    <span className="text-muted-foreground text-xs">
                      {ui("trafficEvidence.viewer.bodySize", { size: format.number(detail[side].total, "count") })}{detail[side].truncated ? ui("trafficEvidence.viewer.previewSuffix") : ""}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void api
                        .downloadFindingTrafficBody(findingId, detail.binding.id, side, contextTask)
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    {ui("core.traffic.downloadBody")}</Button>
                </div>
                <HttpCodeBlock
                  raw={`${(side === "request" ? detail.binding.snapshot.req_head : detail.binding.snapshot.resp_head)?.trimEnd() ?? ""}\n\n${detail[side].content}`}
                />
                {detail[side].truncated && !detail[side].binary ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void more(side)}>
                    {t("viewer.loadMore")}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CapturedTrafficViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const format = useLocaleFormatting();
  const ui = useTranslations();
  const t = useTranslations("trafficEvidence");
  const [detail, setDetail] = React.useState<TrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!id) return;
    let active = true;
    setDetail(null);
    setError("");
    api
      .trafficExchange(id)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("captured.title")}</DialogTitle>
          <DialogDescription>{t("captured.description", {id: id ?? "" })}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">{ui("trafficEvidence.viewer.request")}</p>
              <HttpCodeBlock raw={detail.req} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">{ui("trafficEvidence.viewer.response")}</p>
              <HttpCodeBlock raw={detail.resp} />
            </div>
          </div>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
