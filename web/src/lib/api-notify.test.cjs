const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

require("ts-node").register({
  skipProject: true,
  transpileOnly: true,
  compilerOptions: { target: "ES2022", module: "CommonJS", moduleResolution: "Node" },
});
const { mockHandle } = require("./mock/handler.ts");
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function client(mock, payload) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    process: { env: {} },
    URLSearchParams,
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: mock };
      if (id === "@/lib/mock/handler") return { mockHandle };
      throw new Error(`Unexpected runtime import: ${id}`);
    },
    fetch: async () => {
      assert.equal(mock, false, "Demo notifications must never make a network request");
      return { ok: true, status: 200, json: async () => payload };
    },
  });
  return exports.api;
}

test("notification metadata rejects incomplete responses before they can crash NotifyPage", async () => {
  for (const payload of [null, {}, [], { kinds: null }, { kinds: [], stats: {} }, { kinds: [], defaults: {} }]) {
    await assert.rejects(client(false, payload).notifyMeta(), /通知配置响应不完整/);
  }
});

test("the real demo transport supports notification page loading, editing and delivery history", async () => {
  const api = client(true);
  const initial = await api.notifyMeta();
  assert.deepEqual(initial.kinds.map((kind) => kind.kind).sort(), [
    "dingtalk",
    "email",
    "feishu",
    "telegram",
    "webhook",
    "wecom",
  ]);
  // These are the reads that crashed the page after /notify/meta returned {}.
  assert.deepEqual(initial.kinds.find((kind) => kind.kind === "dingtalk").secret_keys, ["webhook", "secret"]);
  assert.equal(initial.kinds.find((kind) => kind.kind === "feishu").default_rate_per_min, 100);
  assert.equal(initial.stats.channels, 0);
  assert.equal(initial.stats.pending, 0);
  assert.equal(initial.defaults.digest_interval_min, 30);
  assert.deepEqual(Array.from(await api.notifyChannels()), []);
  const deliveries = await api.notifyDeliveries({ page: 2, pageSize: 10 });
  assert.deepEqual(Array.from(deliveries.deliveries), []);
  assert.equal(deliveries.total, 0);
  assert.equal(deliveries.page, 2);
  assert.equal(deliveries.page_size, 10);

  const { id } = await api.notifyCreateChannel({
    name: "Preview channel",
    kind: "dingtalk",
    enabled: true,
    mode: "digest",
    rate_per_min: 0,
    config: { webhook: "https://example.invalid/demo-token", secret: "demo-secret" },
    filter: { min_severity: "high" },
  });
  const channel = (await api.notifyChannels()).find((row) => row.id === id);
  assert.ok(channel);
  assert.equal(channel.mode, "digest");
  assert.equal(channel.rate_per_min, 0);
  assert.equal(channel.filter.min_severity, "high");
  assert.match(channel.config.webhook, /^__masked__/);
  assert.match(channel.config.secret, /^__masked__/);
  channel.name = "Client copy";
  assert.equal((await api.notifyChannels())[0].name, "Preview channel");
  assert.equal((await api.notifyMeta()).stats.channels_on, 1);

  await api.notifyUpdateChannel(id, { enabled: false, name: "Edited channel", config: channel.config });
  const edited = (await api.notifyChannels())[0];
  assert.equal(edited.name, "Edited channel");
  assert.equal(edited.enabled, false);
  assert.equal((await api.notifyMeta()).stats.channels_on, 0);
  await assert.rejects(api.notifyTestChannel(id), /演示模式不会发送真实通知/);
  await assert.rejects(api.notifyRetryDelivery(999), /没有对应的通知记录/);
  assert.equal((await api.notifyMeta()).stats.sent_today, 0);

  await api.setSettings({
    notify_enabled: false,
    notify_public_base_url: "https://example.invalid",
    notify_digest_interval_min: 15,
  });
  const saved = await api.notifyMeta();
  assert.equal(saved.enabled, false);
  assert.equal(saved.public_base_url, "https://example.invalid");
  assert.equal(saved.digest_interval_min, "15");
  await api.notifyDeleteChannel(id);
  assert.equal((await api.notifyMeta()).stats.channels, 0);
  assert.deepEqual(Array.from(await api.notifyChannels()), []);
  await assert.rejects(api.notifyUpdateChannel(id, { enabled: true }), /通知渠道不存在/);
});
