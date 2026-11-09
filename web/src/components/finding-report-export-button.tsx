"use client";

import * as React from "react";

import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buildFindingReportMarkdown, collectFindingReport, findingReportFilename } from "@/lib/finding-report-export";

export function FindingReportExportButton({ findingId, contextTask }: { findingId: string; contextTask?: string }) {
  const [exporting, setExporting] = React.useState(false);
  const busy = React.useRef(false);

  async function exportReport() {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    // Capture the exact URL (including inherited task context) before awaiting.
    const pageUrl = window.location.href;
    try {
      const data = await collectFindingReport(api, findingId, contextTask);
      const markdown = buildFindingReportMarkdown(data, pageUrl);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = findingReportFilename(data.finding);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const omitted = data.packets.some((packet) =>
        [packet.request, packet.response].some((body) => body.binary || body.truncated),
      );
      if (omitted) {
        toast.warning("报告已导出；二进制或超大正文的省略情况已在文件中注明");
      } else {
        toast.success("Markdown 报告已导出");
      }
    } catch (error) {
      toast.error(`导出报告失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void exportReport()}
      disabled={exporting}
      aria-busy={exporting}
      title="导出链路图（Mermaid）、概览及详细报告为 Markdown"
    >
      {exporting ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      {exporting ? "导出中…" : "导出报告"}
    </Button>
  );
}
