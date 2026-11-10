// 渠道字段表与配置值的解析工具。
//
// 与页面拆开是因为这一份是**数据**而不是视图：它描述每种渠道有哪些字段、
// 各自该用什么控件，以及表单文本到配置值（JSON）的双向转换。
// 单独放一个文件后，新增渠道只需要动这里，页面本身不必改。
// 渠道类型的展示名与简介。放在前端是因为它只影响文案，后端不需要知道。
export const KIND_LABEL: Record<string, string> = {
  dingtalk: "notify.kinds.dingtalk",
  feishu: "notify.kinds.feishu",
  wecom: "notify.kinds.wecom",
  webhook: "notify.kinds.webhook",
  telegram: "Telegram",
  email: "notify.kinds.email",
};

// 各渠道的配置字段定义。
//
// 这里刻意保留一份前端字段表，而不是让后端下发 schema：后端只负责
// Validate（必填/格式），UI 需要的是布局与控件类型，两者关注的不是同一件事。
// 唯一的耦合点是 secret_keys —— 哪些字段该渲染成密码框由后端给出，
// 因为只有渠道实现自己清楚哪些值算凭据（企业微信的整个 Webhook 就是凭据，
// 而钉钉的只是其中一个 secret）。新增渠道时这里少一个条目只会让表单变空白，
// 不会静默出错（下面的 hasFields 会提示）。
export type FieldKind = "text" | "password" | "number" | "select" | "textarea" | "switch" | "kv" | "list";
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}
export const CHANNEL_FIELDS: Record<string, FieldDef[]> = {
  dingtalk: [
    {
      key: "webhook",
      label: "notify.fields.webhook",
      kind: "text",
      placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
    },
    {
      key: "secret",
      label: "notify.fields.signingSecret",
      kind: "password",
      help: "notify.fields.dingtalkSecretHelp",
    },
  ],
  feishu: [
    {
      key: "webhook",
      label: "notify.fields.webhook",
      kind: "text",
      placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
    },
    {
      key: "secret",
      label: "notify.fields.verificationSecret",
      kind: "password",
      help: "notify.fields.feishuSecretHelp",
    },
  ],
  wecom: [
    {
      key: "webhook",
      label: "notify.fields.webhook",
      kind: "text",
      placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
    },
  ],
  webhook: [
    {
      key: "url",
      label: "notify.fields.targetUrl",
      kind: "text",
      placeholder: "https://your-endpoint.example.com/hook",
    },
    {
      key: "method",
      label: "notify.fields.method",
      kind: "select",
      options: [
        { value: "POST", label: "notify.fields.post" },
        { value: "PUT", label: "notify.fields.put" },
        { value: "PATCH", label: "notify.fields.patch" },
        { value: "GET", label: "notify.fields.get" },
      ],
    },
    { key: "headers", label: "notify.fields.headers", kind: "kv", help: "notify.fields.headersHelp" },
    {
      key: "body_template",
      label: "notify.fields.bodyTemplate",
      kind: "textarea",
      help: "notify.fields.bodyTemplateHelp",
    },
  ],
  telegram: [
    { key: "bot_token", label: "Bot Token", kind: "password", placeholder: "123456:ABC-DEF..." },
    { key: "chat_id", label: "Chat ID", kind: "text", placeholder: "-1001234567890" },
    {
      key: "base_url",
      label: "notify.fields.apiUrl",
      kind: "text",
      placeholder: "https://api.telegram.org",
      help: "notify.fields.apiUrlHelp",
    },
  ],
  email: [
    { key: "host", label: "notify.fields.smtpHost", kind: "text", placeholder: "smtp.example.com" },
    {
      key: "port",
      label: "notify.fields.port",
      kind: "number",
      placeholder: "587",
      help: "notify.fields.portHelp",
    },
    { key: "username", label: "notify.fields.username", kind: "text" },
    { key: "password", label: "notify.fields.password", kind: "password" },
    { key: "from", label: "notify.fields.from", kind: "text", placeholder: "artex@example.com" },
    { key: "to", label: "notify.fields.to", kind: "list", help: "notify.fields.toHelp" },
    { key: "tls", label: "notify.fields.tls", kind: "switch", help: "notify.fields.tlsHelp" },
  ],
};

export const SEVERITY_OPTIONS = [
  { value: "", label: "notify.severity.any" },
  { value: "low", label: "notify.severity.low" },
  { value: "medium", label: "notify.severity.medium" },
  { value: "high", label: "notify.severity.high" },
  { value: "critical", label: "notify.severity.critical" },
];

export type ChannelForm = {
  name: string;
  kind: string;
  mode: "realtime" | "digest";
  enabled: boolean;
  ratePerMin: string;
  config: Record<string, unknown>;
  minSeverity: string;
  includeText: string;
  excludeText: string;
  taskIDsText: string;
  assetIDsText: string;
  onStatusChange: boolean;
};

export const emptyForm = (kind: string): ChannelForm => ({
  name: "",
  kind,
  mode: "realtime",
  enabled: true,
  ratePerMin: "",
  config: {},
  minSeverity: "",
  includeText: "",
  excludeText: "",
  taskIDsText: "",
  assetIDsText: "",
  onStatusChange: false,
});

// parseKV 解析「每行 KEY=VALUE」的文本域。
export function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
// parseIDs 解析逗号/空白分隔的 id 列表。
export function parseIDs(text: string): number[] {
  return text
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}
// parseKeywords 解析行/逗号分隔的关键词列表（漏洞类型名可能含空格，所以按行或逗号切）。
export function parseKeywords(text: string): string[] {
  return text
    .split(/[\n,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
