"use client";

import * as React from "react";

import { SendIcon } from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { RepeaterSendResponse } from "@/lib/types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type RepeaterInitial = {
  method?: string;
  url?: string;
  headersText?: string;
  body?: string;
};

type HistoryEntry = {
  id: number;
  at: number;
  method: string;
  url: string;
  headersText: string;
  body: string;
  response: RepeaterSendResponse;
};

export function parseHeadersText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function formatHeaders(h: Record<string, string[]> | Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(h)) {
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${key}: ${item}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

export function buildRawResponse(r: RepeaterSendResponse): string {
  if (r.error && !r.status) {
    return `错误: ${r.error}`;
  }
  const start = r.status_text?.trim()
    ? `${r.proto || "HTTP/1.1"} ${r.status_text}`
    : `${r.proto || "HTTP/1.1"} ${r.status}`;
  const headers = formatHeaders(r.headers ?? {});
  return `${start}\n${headers}${headers ? "\n" : ""}\n${r.body ?? ""}`;
}

/** Strip the request line from a captured req_head, keeping header lines. */
export function headersFromReqHead(reqHead?: string): string {
  if (!reqHead) return "";
  const lines = reqHead.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return "";
  const first = lines[0] ?? "";
  const rest = /^[A-Z]+\s+\S+\s+HTTP\//i.test(first) ? lines.slice(1) : lines;
  return rest.join("\n").replace(/\n+$/, "");
}

export function FindingRepeaterDialog({
  open,
  onOpenChange,
  initial,
  findingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: RepeaterInitial;
  findingLabel?: string;
}) {
  const [method, setMethod] = React.useState("GET");
  const [url, setUrl] = React.useState("");
  const [headersText, setHeadersText] = React.useState("");
  const [body, setBody] = React.useState("");
  const [useProxy, setUseProxy] = React.useState(true);
  const [insecure, setInsecure] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [response, setResponse] = React.useState<RepeaterSendResponse | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const histSeq = React.useRef(0);
  const seedKey = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    seedKey.current += 1;
    setMethod((initial?.method || "GET").toUpperCase());
    setUrl(initial?.url ?? "");
    setHeadersText(initial?.headersText ?? "");
    setBody(initial?.body ?? "");
    setResponse(null);
  }, [open, initial]);

  async function send() {
    const trimmedURL = url.trim();
    if (!trimmedURL) {
      toast.error("请填写 URL");
      return;
    }
    setBusy(true);
    try {
      const result = await api.repeaterSend({
        method,
        url: trimmedURL,
        headers: parseHeadersText(headersText),
        body,
        use_recording_proxy: useProxy,
        insecure_skip_verify: insecure,
      });
      setResponse(result);
      histSeq.current += 1;
      setHistory((prev) =>
        [
          {
            id: histSeq.current,
            at: Date.now(),
            method,
            url: trimmedURL,
            headersText,
            body,
            response: result,
          },
          ...prev,
        ].slice(0, 20),
      );
      if (result.error && !result.status) {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function loadHistory(entry: HistoryEntry) {
    setMethod(entry.method);
    setUrl(entry.url);
    setHeadersText(entry.headersText);
    setBody(entry.body);
    setResponse(entry.response);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Repeater · 请求重放</DialogTitle>
          <DialogDescription>
            手工编辑并发送 HTTP 请求，便于验证漏洞与撰写报告
            {findingLabel ? ` · ${findingLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <Label className="mb-1 block text-xs text-muted-foreground">方法</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[240px] flex-1">
            <Label className="mb-1 block text-xs text-muted-foreground">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://target.example/path"
              spellCheck={false}
            />
          </div>
          <Button disabled={busy} onClick={() => void send()}>
            <SendIcon data-icon="inline-start" />
            发送
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={useProxy} onCheckedChange={(v) => setUseProxy(v === true)} />
            经流量代理
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={insecure} onCheckedChange={(v) => setInsecure(v === true)} />
            跳过 TLS 校验
          </label>
          {response ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {response.status ? <Badge variant="secondary">{response.status_text || response.status}</Badge> : null}
              <span>{response.elapsed_ms} ms</span>
              <span>{response.body_bytes.toLocaleString()} 字节</span>
              {response.body_truncated ? <Badge variant="outline">正文已截断</Badge> : null}
            </div>
          ) : null}
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[180px_1fr_1fr]">
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-md border p-2">
            <div className="text-xs font-medium text-muted-foreground">本次会话历史</div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">发送后会出现在这里</p>
              ) : (
                history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => loadHistory(h)}
                  >
                    <div className="truncate font-mono text-xs">
                      {h.method} {h.response.status || "ERR"}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{h.url}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="text-xs font-medium">请求</div>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">请求头</Label>
                <Textarea
                  className="min-h-[120px] flex-1 font-mono text-xs"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  placeholder={"Host: target.example\nContent-Type: application/json"}
                  spellCheck={false}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">请求体</Label>
                <Textarea
                  className="min-h-[120px] flex-1 font-mono text-xs"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="请求正文（可选）"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="text-xs font-medium">响应</div>
            {response?.error ? (
              <Alert variant={response.status ? "default" : "destructive"}>
                <AlertDescription className="break-all font-mono text-xs">{response.error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              {response ? (
                <HttpCodeBlock raw={buildRawResponse(response)} />
              ) : (
                <p className="p-3 text-xs text-muted-foreground">发送后显示原始响应</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
