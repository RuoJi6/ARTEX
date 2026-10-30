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
import { api } from "@/lib/api";
import type { FindingTrafficDetail, TrafficDetail } from "@/lib/types";

function formatCapturedAt(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
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
              <DialogTitle>流量证据 #{bindingId}</DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DialogDescription className="break-all">
                  {detail?.binding.snapshot.url ?? "查看绑定时保存的请求与响应"}
                </DialogDescription>
                {detail ? (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    采集时间：{formatCapturedAt(detail.binding.snapshot.captured_at) || "未知"}
                  </span>
                ) : null}
              </div>
            </div>
            {detail ? (
              <Button variant="outline" size="sm" onClick={openRepeater}>
                送入请求重发
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
                    <p className="text-sm font-medium">{side === "request" ? "请求 Request" : "响应 Response"}</p>
                    <span className="text-muted-foreground text-xs">
                      正文 {detail[side].total.toLocaleString()} 字节{detail[side].truncated ? " · 当前为预览" : ""}
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
                    下载完整正文
                  </Button>
                </div>
                <HttpCodeBlock
                  raw={`${(side === "request" ? detail.binding.snapshot.req_head : detail.binding.snapshot.resp_head)?.trimEnd() ?? ""}\n\n${detail[side].content}`}
                />
                {detail[side].truncated && !detail[side].binary ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void more(side)}>
                    加载更多正文
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
          <DialogTitle>预览流量</DialogTitle>
          <DialogDescription>流量 ID：{id}。绑定时会保存完整正文。</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">请求 Request</p>
              <HttpCodeBlock raw={detail.req} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 px-1 text-sm font-medium">响应 Response</p>
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
