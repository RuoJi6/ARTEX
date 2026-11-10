export const mentionKinds = [
  { kind: "finding", label: "漏洞", alias: "finding", english: "Finding" },
  { kind: "asset", label: "资产", alias: "asset", english: "Asset" },
  { kind: "company", label: "企业", alias: "company", english: "Company" },
  { kind: "endpoint", label: "接口", alias: "api", english: "Endpoint" },
  { kind: "ip", label: "IP", alias: "ip", english: "IP" },
  { kind: "app", label: "应用", alias: "app", english: "Application" },
  { kind: "root_domain", label: "域名", alias: "domain", english: "Root domain" },
  { kind: "subdomain", label: "子域名", alias: "subdomain", english: "Subdomain" },
  { kind: "service", label: "服务", alias: "service", english: "Service" },
] as const;

export type MentionKind = (typeof mentionKinds)[number]["kind"];
export interface ChatMention {
  kind: MentionKind;
  id: number;
  label: string;
  description: string;
}

export function activeMention(value: string, caret: number) {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0 || (start > 0 && /[\w.+/-]/.test(before[start - 1]))) return null;
  const query = before.slice(start + 1);
  if (/[[\]\r\n@]/.test(query) || query.length > 220) return null;
  return { start, end: caret, query };
}

export function mentionSearch(query: string) {
  const text = query.trimStart().toLowerCase();
  const aliases = mentionKinds
    .flatMap((item) =>
      [...new Set([item.label.toLowerCase(), item.alias, item.kind, item.english.toLowerCase()])].map((alias) => ({
        item,
        alias,
      })),
    )
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { item, alias } of aliases) {
    if (text === alias || text.startsWith(`${alias} `) || (/[^a-z_ ]/.test(alias) && text.startsWith(alias))) {
      return { kind: item.kind, query: query.trimStart().slice(alias.length).trim(), categories: [] };
    }
  }
  const categories = mentionKinds.filter((item) =>
    [item.label.toLowerCase(), item.alias, item.kind, item.english.toLowerCase()].some((alias) =>
      alias.startsWith(text),
    ),
  );
  return { kind: "" as const, query: query.trim(), categories };
}

export function mentionToken(item: ChatMention) {
  const label = item.label
    .replace(/[[\]]/g, (char) => (char === "[" ? "（" : "）"))
    .replace(/\s+/g, " ")
    .slice(0, 100);
  // Stored message syntax is independent of the selected display language.
  return `@[${item.kind}#${item.id} ${label}]`;
}

export function selectedMentions(value: string, translate?: (key: string) => string) {
  // Keep recognizing Chinese tokens in saved drafts and conversation history.
  return [
    ...value.matchAll(
      /@\[(finding|asset|company|endpoint|ip|app|root_domain|subdomain|service|漏洞|资产|企业|接口|IP|应用|域名|子域名|服务)#([0-9]+)(?: ([^\]\r\n]*))?\]/g,
    ),
  ].map((match) => {
    const entry = mentionKinds.find((item) => item.kind === match[1] || item.label === match[1]);
    const label = translate ? translate(`mention.${entry?.kind ?? "asset"}`) : (entry?.label ?? match[1]);
    return {
      token: match[0],
      label: `${label} #${match[2]}${match[3] ? ` · ${match[3]}` : ""}`,
      start: match.index,
    };
  });
}
