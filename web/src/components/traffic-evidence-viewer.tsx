"use client";
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
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { FindingTrafficDetail, TrafficDetail } from "@/lib/types";

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
  })
    .format(date)
    .replace(/\//g, "-");
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
  const { ui } = useUITranslation();

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
              <DialogTitle>
                {ui("screen.1f64cdb0be8305")}
                {bindingId}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DialogDescription className="break-all">
                  {detail?.binding.snapshot.url ?? ui("screen.aee255c0914816")}
                </DialogDescription>
                {detail ? (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {ui("screen.2be561047867b2")}
                    {formatCapturedAt(detail.binding.snapshot.captured_at, ui) || ui("screen.4d8c1c5b428307")}
                  </span>
                ) : null}
              </div>
            </div>
            {detail ? (
              <Button variant="outline" size="sm" onClick={openRepeater}>
                {ui("screen.f69052b85f5594")}
              </Button>
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
                    <p className="text-sm font-medium">
                      {side === "request" ? ui("screen.719dd828ca88c8") : ui("screen.946902266aa212")}
                    </p>
                    <span className="text-muted-foreground text-xs">
                      {ui("screen.d661c3d96d53eb")}
                      {detail[side].total.toLocaleString()} {ui("screen.b1c5e73e1471e8")}
                      {detail[side].truncated ? ui("screen.941cfd217649c4") : ""}
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
                    {ui("screen.f03376804e8d8a")}
                  </Button>
                </div>
                <HttpCodeBlock
                  raw={`${(side === "request" ? detail.binding.snapshot.req_head : detail.binding.snapshot.resp_head)?.trimEnd() ?? ""}\n\n${detail[side].content}`}
                />
                {detail[side].truncated && !detail[side].binary ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void more(side)}>
                    {ui("screen.0cf86a8078ea27")}
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
  const { ui } = useUITranslation();

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
          <DialogTitle>{ui("screen.00fea9c9747400")}</DialogTitle>
          <DialogDescription>
            {ui("screen.426b811ca45fb8")}
            {id}
            {ui("screen.2209e21c69e7f8")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">{ui("screen.719dd828ca88c8")}</p>
              <HttpCodeBlock raw={detail.req} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">{ui("screen.946902266aa212")}</p>
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
