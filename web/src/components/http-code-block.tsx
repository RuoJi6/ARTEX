"use client";
import * as React from "react";

import { CheckIcon, CopyIcon, SearchIcon, WrapTextIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, copyText } from "@/lib/utils";
import { PacketCodeEditor } from "@/components/packet-code-editor";

function statusTone(status: number) {
  if (status >= 500) return "text-red-500";
  if (status >= 400) return "text-amber-500";
  if (status >= 300) return "text-blue-500";
  if (status >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

const PACKET_COLORS = {
  method: "font-semibold text-violet-600 dark:text-violet-400",
  url: "text-sky-600 dark:text-sky-400",
  dim: "text-muted-foreground",
  headerName: "text-sky-700 dark:text-sky-300",
  headerValue: "text-emerald-600 dark:text-emerald-400",
  jsonKey: "text-sky-700 dark:text-sky-300",
  jsonString: "text-amber-600 dark:text-amber-400",
  jsonNumber: "text-fuchsia-600 dark:text-fuchsia-400",
  jsonBoolean: "text-rose-600 dark:text-rose-400",
  tag: "text-sky-600 dark:text-sky-400",
};

const PacketHighlightContext = React.createContext("");

function HighlightedText({ text, className }: { text: string; className?: string }) {
  const query = React.useContext(PacketHighlightContext).trim();
  if (!query || !text) return <span className={className}>{text}</span>;
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (;;) {
    const match = haystack.indexOf(needle, cursor);
    if (match < 0) {
      parts.push(text.slice(cursor));
      break;
    }
    if (match > cursor) parts.push(text.slice(cursor, match));
    parts.push(
      <mark key={key++} className="rounded-[2px] bg-yellow-300 text-black">
        {text.slice(match, match + needle.length)}
      </mark>,
    );
    cursor = match + needle.length;
  }
  return <span className={className}>{parts}</span>;
}

function StartLine({ line }: { line: string }) {
  const response = /^(HTTP\/\S+)(\s+)(\d{3})(.*)$/.exec(line);
  if (response) {
    return (
      <>
        <HighlightedText text={response[1]} className={PACKET_COLORS.dim} />
        {response[2]}
        <HighlightedText text={response[3]} className={statusTone(Number(response[3]))} />
        <HighlightedText text={response[4]} />
      </>
    );
  }

  const request = /^([A-Z]+)(\s+)(\S+)(\s+)(HTTP\/\S+)$/.exec(line);
  if (request) {
    return (
      <>
        <HighlightedText text={request[1]} className={PACKET_COLORS.method} />
        {request[2]}
        <HighlightedText text={request[3]} className={PACKET_COLORS.url} />
        {request[4]}
        <HighlightedText text={request[5]} className={PACKET_COLORS.dim} />
      </>
    );
  }

  return <HighlightedText text={line} />;
}

function HeaderLine({ line }: { line: string }) {
  const separator = line.indexOf(":");
  if (separator <= 0) return <HighlightedText text={line} />;
  return (
    <>
      <HighlightedText text={line.slice(0, separator)} className={PACKET_COLORS.headerName} />
      <span className={PACKET_COLORS.dim}>:</span>
      <HighlightedText text={line.slice(separator + 1)} className={PACKET_COLORS.headerValue} />
    </>
  );
}

function JsonBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  const tokens = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let cursor = 0;
  for (const match of body.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(<HighlightedText key={`plain-${cursor}`} text={body.slice(cursor, index)} />);
    let className = PACKET_COLORS.jsonNumber;
    if (match[1]) className = match[2] ? PACKET_COLORS.jsonKey : PACKET_COLORS.jsonString;
    else if (match[3]) className = PACKET_COLORS.jsonBoolean;
    parts.push(<HighlightedText key={`${index}-${match[0].length}`} text={match[0]} className={className} />);
    cursor = index + match[0].length;
  }
  if (cursor < body.length) parts.push(<HighlightedText key={`plain-${cursor}`} text={body.slice(cursor)} />);
  return parts;
}

function MarkupBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  const tags = /<\/?[A-Za-z][^>]*>|<!--[\s\S]*?-->/g;
  let cursor = 0;
  for (const match of body.matchAll(tags)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(<HighlightedText key={`plain-${cursor}`} text={body.slice(cursor, index)} />);
    parts.push(<HighlightedText key={`${index}-${match[0].length}`} text={match[0]} className={PACKET_COLORS.tag} />);
    cursor = index + match[0].length;
  }
  if (cursor < body.length) parts.push(<HighlightedText key={`plain-${cursor}`} text={body.slice(cursor)} />);
  return parts;
}

type BodyFormat = "json" | "markup" | "plain";

function detectBodyFormat(body: string): BodyFormat {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "markup";
  return "plain";
}

function HighlightedBody({ body, format }: { body: string; format: BodyFormat }) {
  if (format === "json") return <JsonBody body={body} />;
  if (format === "markup") return <MarkupBody body={body} />;
  return <HighlightedText text={body} />;
}

export function HttpPacketSyntax({
  raw,
  wrapLines = true,
  lineNumbers = true,
  emptyFallback = "（空）",
  lineClassName = "leading-relaxed",
}: {
  raw: string;
  wrapLines?: boolean;
  lineNumbers?: boolean;
  emptyFallback?: string;
  lineClassName?: string;
}) {
  const value = raw || emptyFallback;
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const lineItems = React.useMemo(() => {
    const occurrences = new Map<string, number>();
    return lines.map((line) => {
      const occurrence = occurrences.get(line) ?? 0;
      occurrences.set(line, occurrence + 1);
      return { key: `${line}\u0000${occurrence}`, line };
    });
  }, [value]);
  const separator = lines.indexOf("");
  const body = separator >= 0 ? lines.slice(separator + 1).join("\n") : value;
  const bodyFormat = detectBodyFormat(body);
  const renderLine = (line: string, index: number) => {
    if (separator < 0 && bodyFormat !== "plain") return <HighlightedBody body={line} format={bodyFormat} />;
    if (index === 0) return <StartLine line={line} />;
    if (separator < 0 || index < separator) return <HeaderLine line={line} />;
    if (index === separator) return null;
    return <HighlightedBody body={line} format={bodyFormat} />;
  };
  return (
    <>
      {lineItems.map((item, index) => (
        <div
          key={item.key}
          data-line={index + 1}
          className={cn("grid min-w-0", lineClassName, lineNumbers && "grid-cols-[2.25rem_minmax(0,1fr)]")}
        >
          {lineNumbers ? (
            <span className="sticky left-0 self-stretch select-none border-r bg-muted/20 px-1 text-right text-[11px] text-muted-foreground/50">
              {index + 1}
            </span>
          ) : null}
          <code
            className={cn(
              "min-h-[1lh] min-w-0 [tab-size:4]",
              lineNumbers ? "pr-14 pl-2" : "",
              wrapLines ? "break-words whitespace-pre-wrap" : "whitespace-pre",
            )}
          >
            {renderLine(item.line, index)}
          </code>
        </div>
      ))}
    </>
  );
}

function countMatches(value: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const haystack = value.toLowerCase();
  let count = 0;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

// Empty grid rows have no text, so native selection copying drops their newlines.
// Map the selected DOM boundaries back to the raw packet instead.
function selectedPacketText(container: HTMLElement, value: string, lines: string[]): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;

  let start: number | null = null;
  let end: number | null = null;
  let offset = 0;
  container.querySelectorAll("[data-line] code").forEach((code, index) => {
    if (range.intersectsNode(code)) {
      const selected = document.createRange();
      selected.selectNodeContents(code);
      if (range.compareBoundaryPoints(Range.START_TO_START, selected) > 0) {
        selected.setStart(range.startContainer, range.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, selected) < 0) {
        selected.setEnd(range.endContainer, range.endOffset);
      }
      const prefix = document.createRange();
      prefix.selectNodeContents(code);
      prefix.setEnd(selected.startContainer, selected.startOffset);
      start ??= offset + prefix.toString().length;
      prefix.setEnd(selected.endContainer, selected.endOffset);
      end = offset + prefix.toString().length;
    }
    const lineEnd = offset + lines[index].length;
    offset = lineEnd + (value[lineEnd] === "\r" ? 2 : 1);
  });
  return start !== null && end !== null ? value.slice(start, end) : null;
}

export function HttpCodeBlock({ raw }: { raw: string }) {
  const [wrapLines, setWrapLines] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const value = raw || "（空）";
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const matches = React.useMemo(() => countMatches(value, query), [value, query]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyPacket = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      return;
    }
    toast.error("复制失败，请使用 Ctrl/Cmd+A 后复制");
  };

  return (
    <div className="relative mx-3 my-4 flex min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-xs">
      <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={wrapLines ? "关闭自动换行" : "开启自动换行"}
              aria-pressed={wrapLines}
              onClick={() => setWrapLines((current) => !current)}
            >
              <WrapTextIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{wrapLines ? "关闭自动换行" : "开启自动换行"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={copied ? "已复制报文" : "复制报文"}
              onClick={() => void copyPacket()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copied ? "已复制" : "复制报文"}</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 max-h-[calc(100vh-15rem)] flex-1 min-w-0 overflow-hidden bg-background">
        <PacketCodeEditor value={value} readOnly wrapLines={wrapLines} />
      </div>
      <div className="flex items-center gap-2 border-t bg-muted/20 px-2 py-1">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索报文内容"
          aria-label="搜索报文内容"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/60"
        />
        {query.trim() ? (
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              matches ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {matches} 处命中
          </span>
        ) : null}
      </div>
    </div>
  );
}
