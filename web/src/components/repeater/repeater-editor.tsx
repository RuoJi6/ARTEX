"use client";

import * as React from "react";

import { SendIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

import {
  buildRawRequest,
  buildRawResponse,
  connectionOrigin,
  parseHeadersText,
  parseRawRequest,
} from "./repeater-http";
import { newId, type RepeaterTab } from "./repeater-state";
import { useRepeaterStore } from "./repeater-store";
import { RepeaterTextPane } from "./repeater-text-pane";

function prettyResponse(response: NonNullable<RepeaterTab["response"]>) {
  const raw = buildRawResponse(response);
  const separator = raw.indexOf("\n\n");
  if (separator < 0) return raw;
  const body = raw.slice(separator + 2);
  try {
    return `${raw.slice(0, separator)}\n\n${JSON.stringify(JSON.parse(body), null, 2)}`;
  } catch {
    return raw;
  }
}

function responseStatusClass(status: number) {
  if (status >= 500) return "border-rose-300 text-rose-600";
  if (status >= 400) return "border-amber-300 text-amber-600";
  if (status >= 300) return "border-sky-300 text-sky-600";
  return "border-emerald-300 text-emerald-600";
}

function responseTextFor(response: RepeaterTab["response"], mode: "raw" | "pretty") {
  if (!response) return "";
  return mode === "pretty" ? prettyResponse(response) : buildRawResponse(response);
}

export function RepeaterEditor({ tab }: { tab: RepeaterTab }) {
  const { useProxy, insecure, response } = tab;
  const updateTab = useRepeaterStore((state) => state.updateTab);
  const busy = useRepeaterStore((state) => state.inflight[tab.id] !== undefined);
  const [targetOpen, setTargetOpen] = React.useState(false);
  const [targetDraft, setTargetDraft] = React.useState("");
  const [responseMode, setResponseMode] = React.useState<"raw" | "pretty">("pretty");
  const targetOrigin = tab.targetOrigin ?? (tab.rawRequest === undefined ? connectionOrigin(tab.url) : "");
  const requestText = buildRawRequest(tab);
  const responseText = responseTextFor(response, responseMode);
  function changeRequest(rawRequest: string) {
    try {
      const { httpVersion: _version, ...parts } = parseRawRequest(rawRequest, targetOrigin);
      updateTab(tab.id, { ...parts, rawRequest, targetOrigin });
    } catch {
      // Preserve incomplete first lines and headers as drafts without rewriting
      // the text or moving the caret. Validate only when the user sends.
      updateTab(tab.id, { rawRequest, targetOrigin });
    }
  }
  const setUseProxy = (useProxy: boolean) => updateTab(tab.id, { useProxy });
  const setInsecure = (insecure: boolean) => updateTab(tab.id, { insecure });
  async function send() {
    const store = useRepeaterStore.getState();
    if (store.inflight[tab.id] !== undefined) return;
    let parsed: ReturnType<typeof parseRawRequest>;
    try {
      parsed = parseRawRequest(requestText, targetOrigin);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    const { method, url: target, headersText, body, httpVersion } = parsed;
    const requestGeneration = store.beginSend(tab.id);
    if (requestGeneration === undefined) return;
    try {
      const result = await api.repeaterSend({
        method,
        http_version: httpVersion,
        url: target,
        headers: parseHeadersText(headersText),
        body,
        use_recording_proxy: useProxy,
        insecure_skip_verify: insecure,
      });
      store.completeSend(tab.id, requestGeneration, {
        id: newId(),
        method,
        url: target,
        headersText,
        body,
        rawRequest: requestText,
        targetOrigin,
        useProxy,
        insecure,
        response: result,
        at: new Date().toISOString(),
      });
    } catch (error) {
      if (store.isCurrentSend(tab.id, requestGeneration)) toast.error((error as Error).message);
    } finally {
      store.clearInflight(tab.id, requestGeneration);
    }
  }

  return (
    <section aria-label="请求编辑器" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 border-b px-1 pb-2">
        <span className="text-muted-foreground text-xs">目标</span>
        <code
          className="min-w-0 max-w-[min(60vw,44rem)] truncate rounded bg-muted px-2 py-1 font-mono text-xs"
          title={targetOrigin || tab.url}
        >
          {targetOrigin || connectionOrigin(tab.url) || "按 Host 请求头（默认 HTTPS）"}
        </code>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setTargetDraft(targetOrigin || connectionOrigin(tab.url));
            setTargetOpen(true);
          }}
        >
          <Settings2 data-icon="inline-start" />
          目标设置
        </Button>
        <Button className="ml-auto" disabled={busy} onClick={() => void send()}>
          <SendIcon data-icon="inline-start" />
          {busy ? "发送中…" : "发送"}
        </Button>
      </div>
      <FieldSet className="flex-row flex-wrap items-center gap-3 border-b px-1 pb-2 text-xs">
        <FieldLegend className="sr-only">发送选项</FieldLegend>
        <FieldLabel className="flex items-center gap-2" htmlFor="repeater-use-proxy">
          <Checkbox
            id="repeater-use-proxy"
            disabled={busy}
            checked={useProxy}
            onCheckedChange={(value) => setUseProxy(value === true)}
          />
          经流量代理
        </FieldLabel>
        <FieldLabel className="flex items-center gap-2" htmlFor="repeater-insecure">
          <Checkbox
            id="repeater-insecure"
            disabled={busy}
            checked={insecure}
            onCheckedChange={(value) => setInsecure(value === true)}
          />
          跳过 TLS 校验
        </FieldLabel>
        {response ? (
          <div className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
            {response.status ? (
              <Badge variant="outline" className={responseStatusClass(response.status)}>
                {response.status} {response.status_text}
              </Badge>
            ) : null}
            <span>{response.elapsed_ms} ms</span>
            <span>{response.body_bytes.toLocaleString()} 字节</span>
            {response.body_truncated ? <Badge variant="outline">正文已截断</Badge> : null}
          </div>
        ) : null}
      </FieldSet>
      <div className="grid min-h-0 flex-1 auto-rows-[minmax(300px,1fr)] gap-2 overflow-hidden lg:auto-rows-auto lg:grid-cols-2">
        <RepeaterTextPane
          id="repeater-request"
          label="请求"
          value={requestText}
          onChange={changeRequest}
          disabled={busy}
          placeholder="POST /path HTTP/1.1"
          syntaxHighlight
          panelClassName="bg-background"
          showClock
          toolbar={
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Raw</span>
          }
        />
        <div className="flex min-h-[300px] min-w-0 flex-col gap-2 xl:min-h-0">
          {response?.error ? (
            <Alert variant={response.status ? "default" : "destructive"}>
              <AlertDescription className="break-all font-mono text-xs">{response.error}</AlertDescription>
            </Alert>
          ) : null}
          <RepeaterTextPane
            id="repeater-response"
            label="响应"
            value={responseText}
            placeholder="发送后显示原始响应"
            syntaxHighlight
            panelClassName="bg-background"
            toolbar={
              <div className="ml-auto flex items-center gap-0.5 rounded border bg-muted/50 p-0.5">
                <Button
                  type="button"
                  variant={responseMode === "raw" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setResponseMode("raw")}
                >
                  Raw
                </Button>
                <Button
                  type="button"
                  variant={responseMode === "pretty" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setResponseMode("pretty")}
                >
                  Pretty
                </Button>
              </div>
            }
          />
        </div>
      </div>
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改发送目标</DialogTitle>
            <DialogDescription>
              设置连接地址和 HTTP/HTTPS。方法、路径和 Host 均在左侧报文中编辑；Host 可以与连接目标不同。
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const origin = targetDraft.trim() ? connectionOrigin(targetDraft.trim()) : "";
              if (targetDraft.trim() && !origin) {
                toast.error("请填写 http:// 或 https:// 开头的地址");
                return;
              }
              try {
                const { httpVersion: _version, ...parts } = parseRawRequest(requestText, origin);
                updateTab(tab.id, { ...parts, rawRequest: requestText, targetOrigin: origin });
              } catch {
                updateTab(tab.id, { rawRequest: requestText, targetOrigin: origin });
              }
              setTargetOpen(false);
            }}
          >
            <Field>
              <FieldLabel htmlFor="repeater-target">发送目标</FieldLabel>
              <Input
                id="repeater-target"
                placeholder="https://example.com:443，留空按 Host 连接"
                value={targetDraft}
                onChange={(event) => setTargetDraft(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTargetOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存目标</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
