"use client";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";

// LLM 重试配置的共用件：五层重试各自的「次数 + 间隔」。
//
// 五层从内到外：建连(SDK) → 空响应(SDK) → 同 provider 安全窗口 → 轮询熔断 → 意图重跑。
// 前三层跟着端点走，所以每个模型配置都能覆盖全局默认；后两层是进程级的，只有全局一份。
//
// 所有输入都遵循同一套「留空 = 不配置」语义，与后端 db.RetryRule 一致：
//   次数   空/0 = 用内置默认 | -1 = 关闭这层重试 | >0 = 用这个次数
//   间隔   空/0 = 用这层原本的指数退避 | >0 = 改用这个固定毫秒间隔

import * as React from "react";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { LLMRetryOverride, LLMRetryPolicy, LLMRetryRule } from "@/lib/types";

export const ZERO_RULE: LLMRetryRule = { attempts: 0, interval_ms: 0 };
export const ZERO_OVERRIDE: LLMRetryOverride = {
  connect: ZERO_RULE,
  empty: ZERO_RULE,
  stream: ZERO_RULE,
};
const ZERO_POLICY: LLMRetryPolicy = {
  ...ZERO_OVERRIDE,
  breaker: ZERO_RULE,
  intent: ZERO_RULE,
};

type LayerMeta = {
  title: string;
  /** 这层重试发生在哪、由谁执行 */
  where: string;
  /** 什么样的错误会走到这层——具体到状态码，别让人猜 */
  trigger: string;
  /** 长得像但【不】走这层的错误，省得填了没反应还以为是 bug */
  skips?: string;
  desc: string;
  attemptsLabel: string;
  /** 次数留空时的默认值，用于占位符 */
  defAttempts: number;
  /** 间隔留空时的默认策略，用于占位符 */
  defInterval: string;
  /** 次数填 -1 的含义 */
  offHint: string;
};

export const RETRY_LAYERS = (ui: UITranslate) =>
  ({
    connect: {
      title: ui("screen.f10e6e26e3b4db"),
      where: ui("screen.96f41f47244804"),
      trigger: ui("screen.34bcbeff509b9d"),
      skips: ui("screen.b156e722d3f90b"),
      desc: ui("screen.5ff0611e6216e8"),
      attemptsLabel: ui("screen.9f28a8874c7855"),
      defAttempts: 3,
      defInterval: ui("screen.17b54d221fb211"),
      offHint: ui("screen.3bffc3cc4bb7ad"),
    },
    empty: {
      title: ui("screen.b9b3e2527d706b"),
      where: ui("screen.698031464bb2de"),
      trigger: ui("screen.98af99aa70bbb3"),
      skips: ui("screen.b775a3506d00e0"),
      desc: ui("screen.5c4e394f1b3286"),
      attemptsLabel: ui("screen.9f28a8874c7855"),
      defAttempts: 2,
      defInterval: ui("screen.17b54d221fb211"),
      offHint: ui("screen.940ad28cee9933"),
    },
    stream: {
      title: ui("screen.c45140d655f136"),
      where: ui("screen.8a2198ed8f7327"),
      trigger: ui("screen.71f6a47c0d23d3"),
      skips: ui("screen.4744b18e90048d"),
      desc: ui("screen.2006e8af042274"),
      attemptsLabel: ui("screen.9f28a8874c7855"),
      defAttempts: 2,
      defInterval: ui("screen.fd7a86f5e612aa"),
      offHint: ui("screen.8dab06c9fd6148"),
    },
    breaker: {
      title: ui("screen.f5dd5e99ea6525"),
      where: ui("screen.28c87fa227102e"),
      trigger: ui("screen.cf6f67d2e78e44"),
      skips: ui("screen.c87a57293a93da"),
      desc: ui("screen.9a02de63a3f797"),
      attemptsLabel: ui("screen.7b44ab286a1f2b"),
      defAttempts: 3,
      defInterval: ui("screen.804fbeef471c8a"),
      offHint: ui("screen.d9f1563e424da7"),
    },
    intent: {
      title: ui("screen.8b2e74ec654500"),
      where: ui("screen.28c87fa227102e"),
      trigger: ui("screen.949e15cbc8e7df"),
      skips: ui("screen.c414a339416e82"),
      desc: ui("screen.8d36bac3ae4454"),
      attemptsLabel: ui("screen.ae029c6105f38e"),
      defAttempts: 2,
      defInterval: ui("screen.028dd484bd73c5"),
      offHint: ui("screen.3b04f47779cc8c"),
    },
  }) satisfies Record<string, LayerMeta>;

type LayerKey = keyof ReturnType<typeof RETRY_LAYERS>;

/** 毫秒的人话，只用于在输入框旁边回显，免得数零。 */
function humanMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${Number((ms / 60_000).toFixed(2))}min`;
}

/** 受控数字输入：空串 ↔ 0，中间态（"-"、"1e"）原样留在本地，不打扰父级。 */
function NumField({
  id,
  value,
  onChange,
  placeholder,
  min,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
  min: number;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  // 父级换了一整套值（读取到策略、切换配置）时跟上；自己敲字时不会走到这里，
  // 因为那时 value 已经等于本地文本 parse 后的结果。
  React.useEffect(() => {
    const incoming = value === 0 ? "" : String(value);
    setText((cur) => (Number(cur || 0) === value ? cur : incoming));
  }, [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      className="w-28 shrink-0"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? 0 : Math.trunc(n));
      }}
    />
  );
}

/** 一层重试的两个旋钮。idPrefix 用来在同一页出现多次时保住 label 的 htmlFor。 */
export function RetryRuleFields({
  layer,
  idPrefix,
  value,
  onChange,
  compact,
}: {
  layer: LayerKey;
  idPrefix: string;
  value: LLMRetryRule;
  onChange: (r: LLMRetryRule) => void;
  /** true = 配置抽屉里的紧凑版：省掉展开说明，只留「什么错误会走到这层」这一句 */
  compact?: boolean;
}) {
  const { ui } = useUITranslation();

  const meta = RETRY_LAYERS(ui)[layer];
  const human = humanMs(value.interval_ms);
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 rounded-lg border p-3"}>
      <div className="grid gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Label className="text-sm">{meta.title}</Label>
          <span className="text-muted-foreground text-xs">{meta.where}</span>
        </div>
        {/* 哪些错误会走到这层，具体到状态码——填了旋钮却看不到效果，多半是错误压根不落在这层。 */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">{ui("screen.250bf9d56316ae")}</span>
          {ui("punctuation.f114611cd6")}
          {meta.trigger}
        </p>
        {!compact && meta.skips && (
          <p className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">{ui("screen.424093defe547b")}</span>
            {ui("punctuation.f114611cd6")}
            {meta.skips}
          </p>
        )}
        {!compact && <p className="text-muted-foreground text-xs">{meta.desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-n`} className="text-muted-foreground text-xs">
            {meta.attemptsLabel}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-n`}
            min={-1}
            value={value.attempts}
            placeholder={ui("screen.e9ba66dfa284be", { v0: meta.defAttempts })}
            onChange={(n) => onChange({ ...value, attempts: n })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-ms`} className="text-muted-foreground text-xs">
            {ui("screen.d09afdca01c185")}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-ms`}
            min={0}
            value={value.interval_ms}
            placeholder={ui("screen.868e4eaa774794")}
            onChange={(n) => onChange({ ...value, interval_ms: n })}
          />
          <span className="text-muted-foreground text-xs">
            {human ? ui("screen.fd847c3eb0f351", { v0: human }) : meta.defInterval}
          </span>
        </div>
      </div>
      {!compact && (
        <p className="text-muted-foreground text-xs">
          {ui("screen.9a44a0eae5441a")}
          {meta.offHint}。
        </p>
      )}
    </div>
  );
}

/** 模型配置抽屉里的三层覆盖（跟着端点走的那三层）。 */
export function ProfileRetryFields({
  value,
  onChange,
}: {
  value: LLMRetryOverride;
  onChange: (o: LLMRetryOverride) => void;
}) {
  const { ui } = useUITranslation();

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label className="text-sm">{ui("screen.d21ea16ca37479")}</Label>
        <p className="text-muted-foreground text-xs">{ui("screen.57747cb1872bcc")}</p>
      </div>
      {(["connect", "empty", "stream"] as const).map((k) => (
        <div key={k} className="border-t pt-3 first:border-t-0 first:pt-0">
          <RetryRuleFields
            compact
            layer={k}
            idPrefix="pf"
            value={value[k]}
            onChange={(r) => onChange({ ...value, [k]: r })}
          />
        </div>
      ))}
    </div>
  );
}

/** 「重试与退避」tab：五层的全局默认值。 */
export function RetryPolicyPanel() {
  const { ui, liveUI } = useUITranslation();

  const [policy, setPolicy] = React.useState<LLMRetryPolicy>(ZERO_POLICY);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.llmRetryPolicy();
      setPolicy({ ...ZERO_POLICY, ...p });
    } catch (e) {
      toast.error(liveUI("screen.da1cf835d4509f", { v0: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [liveUI]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // 后端会把越界值夹回区间并回传，直接用回传值刷新，所见即所存。
      const saved = await api.saveLLMRetryPolicy(policy);
      setPolicy({ ...ZERO_POLICY, ...saved });
      toast.success(ui("screen.2911d45d27017a"));
    } catch (e) {
      toast.error(ui("screen.20e1b0f2590bc7", { v0: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: LayerKey) => (r: LLMRetryRule) => setPolicy((p) => ({ ...p, [k]: r }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-10 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> {ui("screen.1571880c887d86")}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-xs leading-relaxed">
        {ui("screen.c76253318904fb")}
        <span className="text-foreground"> {ui("screen.bb077bd715b98d")}</span>
        {ui("screen.ca351d8692c5f1")}
        <span className="text-foreground">{ui("screen.4d6e8527d60665")}</span>
        {ui("screen.15d1a795428466")}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(RETRY_LAYERS(ui)) as LayerKey[]).map((k) => (
          <RetryRuleFields key={k} layer={k} idPrefix="gl" value={policy[k]} onChange={set(k)} />
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {ui("screen.a3030bf8f16dc6")}
        </Button>
        <Button variant="outline" onClick={() => setPolicy(ZERO_POLICY)} disabled={saving}>
          {ui("screen.3b6c48ce496bdf")}
        </Button>
      </div>
    </div>
  );
}
