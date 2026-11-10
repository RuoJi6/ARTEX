import type { NotificationChannel, NotificationKind, NotificationMeta, Settings } from "../types";

// Match notify/*.go metadata. Demo requests never contact notification providers.
const kinds: NotificationKind[] = [
  { kind: "dingtalk", default_rate_per_min: 20, secret_keys: ["webhook", "secret"] },
  { kind: "email", default_rate_per_min: 60, secret_keys: ["password"] },
  { kind: "feishu", default_rate_per_min: 100, secret_keys: ["webhook", "secret"] },
  { kind: "telegram", default_rate_per_min: 20, secret_keys: ["bot_token"] },
  { kind: "webhook", default_rate_per_min: 0, secret_keys: ["url", "headers"] },
  { kind: "wecom", default_rate_per_min: 20, secret_keys: ["webhook"] },
];

export function createMockNotifications() {
  let nextID = 1;
  const channels: NotificationChannel[] = [];

  return (method: string, path: string, query: URLSearchParams, body: Record<string, unknown>, settings: Settings) => {
    if (path === "/notify/meta" && method === "GET") {
      const meta: NotificationMeta = {
        kinds,
        enabled: settings.notify_enabled ?? true,
        public_base_url: settings.notify_public_base_url ?? "",
        digest_interval_min: String(settings.notify_digest_interval_min ?? 30),
        defaults: { digest_interval_min: 30 },
        stats: {
          channels: channels.length,
          channels_on: channels.filter((channel) => channel.enabled).length,
          pending: 0,
          failed: 0,
          sent_today: 0,
          backlog_age_ms: 0,
        },
      };
      return structuredClone(meta);
    }
    if (path === "/notify/channels" && method === "GET") return { channels: structuredClone(channels) };
    if (path === "/notify/deliveries" && method === "GET") {
      return {
        deliveries: [],
        total: 0,
        page: Math.max(1, Number(query.get("page")) || 1),
        page_size: Math.min(100, Math.max(1, Number(query.get("page_size")) || 50)),
      };
    }
    if (path === "/notify/channels" && method === "POST") {
      const kind = kinds.find((entry) => entry.kind === body.kind);
      if (!kind) throw new Error("渠道类型无效");
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("缺少渠道名称");
      const now = new Date().toISOString();
      const channel: NotificationChannel = {
        id: nextID++,
        name,
        kind: kind.kind,
        enabled: body.enabled !== false,
        mode: body.mode === "digest" ? "digest" : "realtime",
        config: {},
        filter: {},
        rate_per_min: kind.default_rate_per_min,
        created_at: now,
        updated_at: now,
        secret_keys: [...kind.secret_keys],
      };
      updateChannel(channel, body);
      channels.push(channel);
      return { id: channel.id };
    }
    const match = /^\/notify\/channels\/(\d+)(\/test)?$/.exec(path);
    if (match) {
      const index = channels.findIndex((channel) => channel.id === Number(match[1]));
      if (index < 0) throw new Error("通知渠道不存在");
      if (match[2] && method === "POST") {
        throw new Error("演示模式不会发送真实通知，请在实际部署中测试");
      }
      if (!match[2] && method === "PATCH") {
        updateChannel(channels[index], body);
        return { id: channels[index].id };
      }
      if (!match[2] && method === "DELETE") {
        channels.splice(index, 1);
        return { ok: true };
      }
    }
    // No generic success fallback: a nonexistent delivery cannot be retried.
    throw new Error("演示模式中没有对应的通知记录");
  };
}

function updateChannel(channel: NotificationChannel, body: Record<string, unknown>) {
  if (typeof body.name === "string") channel.name = body.name.trim();
  if (typeof body.enabled === "boolean") channel.enabled = body.enabled;
  if (body.mode === "realtime" || body.mode === "digest") channel.mode = body.mode;
  if (typeof body.rate_per_min === "number") channel.rate_per_min = body.rate_per_min;
  if (body.filter && typeof body.filter === "object") channel.filter = structuredClone(body.filter);
  if (body.config && typeof body.config === "object") {
    const config = structuredClone(body.config) as Record<string, unknown>;
    // Keep the same masked-value convention as the real API. Nothing is sent.
    for (const key of channel.secret_keys) {
      const value = config[key];
      if (value && (typeof value !== "string" || !value.startsWith("__masked__"))) config[key] = "__masked__demo";
    }
    channel.config = config;
  }
  channel.updated_at = new Date().toISOString();
}
