import type { RepeaterSendResponse } from "@/lib/types";

export type RepeaterErrorCode = "incompleteTraffic" | "truncatedBody" | "requestLine" | "path" | "host" | "fragment";

export class RepeaterParseError extends Error {
  readonly code: RepeaterErrorCode;

  constructor(code: RepeaterErrorCode) {
    super(
      {
        incompleteTraffic: "请求报文不完整，无法送入请求重发",
        truncatedBody: "请求正文为截断预览，请下载完整正文后再导入",
        requestLine: "请求首行应为：POST /path HTTP/1.1",
        path: "请求路径必须以 / 开头，或填写完整 http/https URL",
        host: "请填写 Host 请求头或设置发送目标",
        fragment: "请求路径不能包含 URL 片段，请使用 %23 表示 #",
      }[code],
    );
    this.name = "RepeaterParseError";
    this.code = code;
  }
}

export type RepeaterInitial = {
  method?: string;
  url?: string;
  headersText?: string;
  body?: string;
  rawRequest?: string;
  targetOrigin?: string;
};

export function parseHeadersText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!name) continue;
    // The API accepts one value per name. Cookies use semicolon separators;
    // other duplicate headers preserve the common comma-separated semantics.
    const existingName = Object.keys(result).find((item) => item.toLowerCase() === name.toLowerCase());
    if (!existingName) {
      result[name] = value;
    } else {
      const separator = existingName.toLowerCase() === "cookie" ? "; " : ", ";
      result[existingName] = `${result[existingName]}${separator}${value}`;
    }
  }
  return result;
}

export function formatHeaders(headers: Record<string, string[]> | Record<string, string>): string {
  return Object.entries(headers)
    .flatMap(([name, value]) =>
      Array.isArray(value) ? value.map((item) => `${name}: ${item}`) : [`${name}: ${value}`],
    )
    .join("\n");
}

export function buildRawResponse(response: RepeaterSendResponse): string {
  if (!response.status) return "";
  const statusLine = `${response.proto || "HTTP/1.1"} ${response.status_text || response.status}`.trim();
  const headers = formatHeaders(response.headers);
  return `${statusLine}\n${headers}\n\n${response.body}`;
}

export function headersFromReqHead(reqHead?: string): string {
  if (!reqHead) return "";
  const lines = reqHead.replace(/\r\n?/g, "\n").split("\n");
  // Evidence heads normally start with `METHOD path HTTP/x.y`, but tolerate
  // leading blank lines and CR-only captures from older traffic records.
  let requestLine = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index].trim();
    if (!candidate) continue;
    if (/^(?:[A-Z]+)\s+\S+\s+HTTP\/\d(?:\.\d)?$/i.test(candidate)) requestLine = index;
    break;
  }
  const start = requestLine >= 0 ? requestLine + 1 : 0;
  return lines.slice(start).join("\n").replace(/\n+$/, "");
}

export function getHostHeader(headersText: string): string {
  const headers = parseHeadersText(headersText);
  const name = Object.keys(headers).find((key) => key.toLowerCase() === "host");
  return name ? headers[name] : "";
}

export function setHostHeader(headersText: string, host: string): string {
  const lines = headersText.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => /^\s*host\s*:/i.test(line));
  const value = host.replace(/[\r\n]/g, "").trim();
  const result = lines.flatMap((line, index) => {
    if (!/^\s*host\s*:/i.test(line)) return [line];
    return index === first && value ? [`Host: ${value}`] : [];
  });
  if (first < 0 && value) result.unshift(`Host: ${value}`);
  return result.join("\n");
}

// Split only the HTTP separator; preserve all body bytes represented by the text.
export function splitRequestText(text: string): { headersText: string; body: string } {
  const separator = /\r?\n\r?\n/.exec(text);
  if (!separator) return { headersText: text, body: "" };
  return { headersText: text.slice(0, separator.index), body: text.slice(separator.index + separator[0].length) };
}

export function joinRequestText(headersText: string, body: string): string {
  if (!headersText && !body) return "";
  return `${headersText.replace(/(?:\r?\n)+$/, "")}\n\n${body}`;
}

export function requestFromTraffic(
  raw: string,
  exchange: { method: string; url: string; host: string },
): RepeaterInitial {
  const firstLine = /^[^\r\n]+(?:\r?\n|$)/.exec(raw);
  if (!firstLine || !/^[A-Z]+\s+\S+\s+HTTP\/\d(?:\.\d)?\r?\n?$/i.test(firstLine[0])) {
    throw new RepeaterParseError("incompleteTraffic");
  }
  const request = splitRequestText(raw.slice(firstLine[0].length));
  if (/…\[truncated\] @blob sha256:[a-f0-9]{64}/.test(request.body)) {
    throw new RepeaterParseError("truncatedBody");
  }
  let host = exchange.host;
  try {
    host = new URL(exchange.url).host || host;
  } catch {
    /* Legacy URL uses the indexed host. */
  }
  const headersText = getHostHeader(request.headersText)
    ? request.headersText
    : setHostHeader(request.headersText, host);
  const rawRequest = `${firstLine[0].trimEnd()}\n${joinRequestText(headersText, request.body)}`;
  const parsed = parseRawRequest(rawRequest, connectionOrigin(exchange.url));
  return {
    method: parsed.method,
    url: parsed.url,
    headersText: parsed.headersText,
    body: parsed.body,
    rawRequest,
    targetOrigin: connectionOrigin(exchange.url),
  };
}

export function connectionOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "";
  } catch {
    return "";
  }
}

export function buildRawRequest(request: RepeaterInitial): string {
  if (request.rawRequest !== undefined) return request.rawRequest;
  let target = "/";
  let host = "";
  try {
    const url = new URL(request.url ?? "");
    target = url.pathname + url.search;
    host = url.host;
  } catch {
    /* New empty draft. */
  }
  const headersText = request.headersText?.trim() ? request.headersText : `Host: ${host}`;
  return `${request.method ?? "GET"} ${target} HTTP/1.1\n${joinRequestText(headersText, request.body ?? "")}`;
}

export function parseRawRequest(
  text: string,
  targetOrigin = "",
): { method: string; url: string; headersText: string; body: string; httpVersion: string } {
  const newline = text.indexOf("\n");
  const line = (newline < 0 ? text : text.slice(0, newline)).trim();
  const match = /^([A-Za-z]+)\s+(\S+)\s+(HTTP\/(?:1\.[01]|2(?:\.0)?))$/.exec(line);
  if (!match) throw new RepeaterParseError("requestLine");
  const parts = splitRequestText(newline < 0 ? "" : text.slice(newline + 1));
  let url: URL;
  if (/^https?:\/\//i.test(match[2])) url = new URL(match[2]);
  else {
    if (!match[2].startsWith("/")) throw new RepeaterParseError("path");
    const origin = connectionOrigin(targetOrigin) || connectionOrigin(`https://${getHostHeader(parts.headersText)}`);
    if (!origin) throw new RepeaterParseError("host");
    url = new URL(origin + match[2]);
  }
  if (url.hash) throw new RepeaterParseError("fragment");
  return {
    ...parts,
    method: match[1].toUpperCase(),
    url: url.href,
    httpVersion: match[3] === "HTTP/2" ? "HTTP/2.0" : match[3],
  };
}

export function requestFromEvidence(initial: RepeaterInitial, requestHead?: string): RepeaterInitial {
  const firstLine = requestHead?.trimStart().split(/\r?\n/, 1)[0] || "";
  if (!/^[A-Za-z]+\s+\S+\s+HTTP\/\d(?:\.\d)?$/.test(firstLine)) return initial;
  const rawRequest = `${firstLine}\n${joinRequestText(initial.headersText ?? "", initial.body ?? "")}`;
  return { ...initial, rawRequest, targetOrigin: connectionOrigin(initial.url ?? "") };
}
