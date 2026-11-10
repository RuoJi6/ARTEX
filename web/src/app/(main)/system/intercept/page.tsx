"use client";
import * as React from "react";

import {
  BotIcon,
  ListFilterIcon,
  Loader2Icon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription, FieldGroup, FieldLabel, Field as FormField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type {
  InterceptAction,
  InterceptRule,
  JudgeConfig,
  JudgeDayUsage,
  JudgeUsage,
  LLMProfile,
  Tool,
} from "@/lib/types";

// fmtTokens 把 token 数压成紧凑写法(1.2k / 3.4M),用于审批用量统计。
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// JudgeStat 是一块统计数字(标签 + 数值)。
function JudgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// JudgeSparkbars 用纯 div 画近 N 天每日消耗(输入+输出)的迷你柱图,免图表库依赖。
function JudgeSparkbars({ daily }: { daily: JudgeDayUsage[] }) {
  const { ui } = useUITranslation();

  const max = Math.max(1, ...daily.map((d) => d.input_tokens + d.output_tokens));
  return (
    <div className="flex h-16 items-end gap-0.5">
      {daily.map((d) => {
        const total = d.input_tokens + d.output_tokens;
        const h = Math.max(2, Math.round((total / max) * 100));
        return (
          <div
            key={d.date}
            title={ui("screen.0cca48404769df", { v0: d.date, v1: d.calls, v2: fmtTokens(total) })}
            className="min-w-[2px] flex-1 rounded-sm bg-violet-500/60 hover:bg-violet-500"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

// ---- tool scope ----

// SDK tools are intentionally not seeded into the DB (they apply to every agent
// and have no per-agent binding). We hardcode them here so they still appear in
// the scope dialog.
function sdkTool(key: string, description: string): Tool {
  return { key, system: true, description, schema: {}, agents: [], enabled: true, kind: "builtin" };
}

const SDK_EXEC = (ui: UITranslate): Tool[] => [
  sdkTool("Bash", ui("screen.e27c1b381f9070")),
  sdkTool("WebFetch", ui("screen.106288373133a1")),
  sdkTool("web_search", ui("screen.298c8a1f26a600")),
  sdkTool("shell_open", ui("screen.ea62016e8fa9a9")),
  sdkTool("shell_send", ui("screen.a64950ab10a212")),
  sdkTool("shell_read", ui("screen.843fdf4747ee59")),
  sdkTool("shell_close", ui("screen.794f97024f0ac5")),
  sdkTool("shell_list", ui("screen.1a4d66f6a7c6b8")),
];

const SDK_WRITE = (ui: UITranslate): Tool[] => [
  sdkTool("Write", ui("screen.7ed80e44eaf9c5")),
  sdkTool("Edit", ui("screen.c697b5d7d4c00d")),
  sdkTool("MultiEdit", ui("screen.10212c4792cb7f")),
];

const SDK_KEYS = new Set([
  "Bash",
  "WebFetch",
  "web_search",
  "shell_open",
  "shell_send",
  "shell_read",
  "shell_close",
  "shell_list",
  "Write",
  "Edit",
  "MultiEdit",
]);

function groupTools(dbTools: Tool[], ui: UITranslate) {
  const sys: Tool[] = [],
    custom: Tool[] = [];
  for (const t of dbTools) {
    if (SDK_KEYS.has(t.key)) continue; // already covered by hardcoded groups
    if (t.system) sys.push(t);
    else custom.push(t);
  }
  return [
    { label: ui("screen.c667b3003f6281"), tools: SDK_EXEC(ui) },
    { label: ui("screen.1fa38c61d3eb5c"), tools: SDK_WRITE(ui) },
    { label: ui("screen.6ea702ad9c2b49"), tools: sys },
    { label: ui("screen.1e976a626f6f83"), tools: custom },
  ].filter((g) => g.tools.length > 0);
}

// ---- form state ----

type RuleForm = {
  name: string;
  enabled: boolean;
  priority: number;
  match_target: "tool_name" | "tool_input";
  match_type: "string" | "regex";
  pattern: string;
  action: InterceptAction;
  message: string;
  timeout_enabled: boolean;
  timeout_seconds: number;
  timeout_action: "deny" | "allow";
};

const defaultForm = (): RuleForm => ({
  name: "",
  enabled: true,
  priority: 0,
  match_target: "tool_name",
  match_type: "string",
  pattern: "",
  action: "deny",
  message: "",
  timeout_enabled: true,
  timeout_seconds: 60,
  timeout_action: "deny",
});

// ---- small components ----

function ActionBadge({ action }: { action: InterceptAction }) {
  const { ui } = useUITranslation();

  if (action === "allow") return <Badge variant="secondary">{ui("screen.ce7ef28b670ade")}</Badge>;
  if (action === "deny") return <Badge variant="destructive">{ui("screen.b645c326ce3ecb")}</Badge>;
  return (
    <Badge variant="outline" className="border-amber-400 text-amber-600">
      {ui("screen.436a02934223ec")}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

// ---- LLM fallback judge card ----

const FOLLOW_ACTIVE = "0"; // profile_id 0 = 跟随激活/默认配置

const defaultJudge = (): JudgeConfig => ({
  enabled: false,
  profile_id: 0,
  prompt: "",
  timeout_seconds: 15,
  retry_count: 3,
  retry_interval_ms: 1000,
  fail_action: "ask",
  ask_timeout_seconds: 300,
  ask_timeout_action: "deny",
  incomplete_script_action: "model",
  confidence_threshold: 0.55,
});

function JudgeCard() {
  const { ui, liveUI } = useUITranslation();

  const [cfg, setCfg] = React.useState<JudgeConfig>(defaultJudge);
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [usage, setUsage] = React.useState<JudgeUsage | null>(null);
  const [testing, setTesting] = React.useState(false);

  // 审批用量统计:失败不打断配置页,仅在开启时拉取。
  const loadUsage = React.useCallback(async () => {
    try {
      setUsage(await api.interceptJudgeUsage(30));
    } catch {
      // 忽略:统计不可用不应影响配置编辑
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [j, ps] = await Promise.all([api.interceptGetJudgeConfig(), api.llmProfiles()]);
      setCfg(j);
      setProfiles(ps);
    } catch (e) {
      toast.error(liveUI("screen.acfc5914f114b4") + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [liveUI]);

  React.useEffect(() => {
    load();
  }, [load]);

  // 开启后(含初次加载把开关读为 true 时)拉取审批用量统计。
  React.useEffect(() => {
    if (cfg.enabled) loadUsage();
  }, [cfg.enabled, loadUsage]);

  function patch(p: Partial<JudgeConfig>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  const selectedProfile = cfg.profile_id
    ? profiles.find((p) => Number(p.id) === cfg.profile_id)
    : profiles.find((p) => p.is_default);
  const selectedIsJev = selectedProfile?.format === "jev";

  async function testSelectedJev() {
    if (!selectedProfile || !selectedIsJev || testing) return;
    setTesting(true);
    try {
      const r = await api.testLLM(
        "jev",
        selectedProfile.model || "jev-latest",
        selectedProfile.base_url ?? "",
        "",
        selectedProfile.proxy ?? "",
        "",
        "",
        Number(selectedProfile.id),
      );
      if (r.ok) {
        toast.success(ui("screen.d0a2666484b322", { v0: r.latency_ms ?? "?" }), {
          description: r.reply ? ui("screen.8a567a25295e39", { v0: r.reply }) : undefined,
        });
      } else {
        toast.error(ui("screen.b8699370de7935", { v0: r.error ?? ui("screen.4d8c1c5b428307") }));
      }
    } catch (e) {
      toast.error(ui("screen.71fa1c4129b524", { v0: (e as Error).message }));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.interceptSetJudgeConfig(cfg);
      toast.success(ui("screen.ddd87e53a9bf1f"));
      await load(); // 回读:提示词若清空则回填内置模板
    } catch (e) {
      toast.error(ui("screen.84bd3b614686b6") + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function restorePrompt() {
    // 清空提示词并保存 → 服务端下次返回内置模板全文,回填到输入框。
    setSaving(true);
    try {
      await api.interceptSetJudgeConfig({ ...cfg, prompt: "" });
      const j = await api.interceptGetJudgeConfig();
      setCfg(j);
      toast.success(ui("screen.a1c669f5f7e66d"));
    } catch (e) {
      toast.error(ui("screen.02c27c783d91f7") + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 启用开关 —— 独立高亮条 */}
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          cfg.enabled ? "border-violet-400/50 bg-violet-50/40 dark:bg-violet-950/20" : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <BotIcon className={`h-5 w-5 shrink-0 ${cfg.enabled ? "text-violet-600" : "text-muted-foreground"}`} />
          <div>
            <p className="text-sm font-semibold leading-tight">{ui("screen.ef0da315b02684")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ui("screen.12404a0b638172")}
              <span className="font-medium text-foreground">{ui("screen.7c341811f166c3")}</span>
              {ui("screen.27b8599481622a")}
              <span className="font-medium text-foreground">{ui("screen.d2427473665fe1")}</span>
              {ui("screen.91a78cb2980d40")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {cfg.enabled ? ui("screen.dfb802238b38fb") : ui("screen.f95ea7f4c063ee")}
          </span>
          <Switch checked={cfg.enabled} disabled={loading} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>
      </div>

      {/* 审批 Token 用量统计(全局累计,独立于各模型配置) */}
      {cfg.enabled && usage && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{ui("screen.4e8a8b4940ab7a")}</p>
                <p className="text-xs text-muted-foreground">{ui("screen.3572800eb69868")}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadUsage}>
                {ui("screen.aee88743413144")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <JudgeStat label={ui("screen.48aa7d58616aeb")} value={usage.calls.toLocaleString()} />
              <JudgeStat label={ui("screen.3c94b4c75940c1")} value={fmtTokens(usage.input_tokens)} />
              <JudgeStat label={ui("screen.a026f37e613cf4")} value={fmtTokens(usage.output_tokens)} />
              <JudgeStat label={ui("screen.ae5090199fb03c")} value={fmtTokens(usage.cache_read_tokens)} />
              <JudgeStat label={ui("screen.0488d8fddd952d")} value={fmtTokens(usage.cache_write_tokens)} />
            </div>
            {usage.daily.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {ui("screen.358cc368f65b34")}
                </p>
                <JudgeSparkbars daily={usage.daily} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {cfg.enabled && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* 左:提示词编辑器(直接展开,主区域) */}
          <Card className="lg:col-span-3">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{ui("screen.15e768f3288deb")}</p>
                  <p className="text-xs text-muted-foreground">{ui("screen.375db5e7cb4e28")}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={restorePrompt} disabled={saving}>
                  {ui("screen.b19acac770d485")}
                </Button>
              </div>
              <Textarea
                className="field-sizing-fixed min-h-[22rem] max-h-[none] flex-1 resize-none font-mono text-xs leading-relaxed"
                value={cfg.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder={ui("screen.cfc48b38eb1117")}
                spellCheck={false}
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {cfg.prompt.length} {ui("screen.c55038b272b109")}
              </p>
            </CardContent>
          </Card>

          {/* 右:判定参数(设置栏) */}
          <Card className="lg:col-span-2">
            <CardContent className="space-y-5 p-4">
              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {ui("screen.4d16c070ebe97f")}
                </p>
                <Field label={ui("screen.1e720248e51907")}>
                  <Select value={String(cfg.profile_id || 0)} onValueChange={(v) => patch({ profile_id: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FOLLOW_ACTIVE}>{ui("screen.844efa880d07cc")}</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {ui("punctuation.da047c04c9")}
                          {p.model}
                          {ui("punctuation.f2e44c6c95")}
                          {p.format === "jev" ? " · Jev / System One" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedIsJev && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void testSelectedJev()}
                      disabled={testing}
                    >
                      {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
                      {testing ? ui("screen.105a9082c346f9") : ui("screen.757d683a3deded")}
                    </Button>
                  )}
                </Field>
                {selectedIsJev && (
                  <Field label={ui("screen.b899124bfe6ae7")}>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={cfg.confidence_threshold ?? 0.55}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 0 && n <= 1) patch({ confidence_threshold: n });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{ui("screen.300b166155d83d")}</p>
                  </Field>
                )}
                <Field label={ui("screen.d2969d0f68a624")}>
                  <Input
                    type="number"
                    min={1}
                    value={cfg.timeout_seconds}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (n > 0) patch({ timeout_seconds: n });
                    }}
                  />
                </Field>
                <FieldGroup>
                  <FormField>
                    <FieldLabel htmlFor="judge-retry-count">{ui("screen.696303d9c413fc")}</FieldLabel>
                    <Input
                      id="judge-retry-count"
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={cfg.retry_count}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 0 && n <= 20) patch({ retry_count: n });
                      }}
                      aria-describedby="judge-retry-count-hint"
                    />
                    <FieldDescription id="judge-retry-count-hint">{ui("screen.2a7b5ee0af08be")}</FieldDescription>
                  </FormField>
                  <FormField data-disabled={cfg.retry_count === 0}>
                    <FieldLabel htmlFor="judge-retry-interval">{ui("screen.ac3214fc0cfe7d")}</FieldLabel>
                    <Input
                      id="judge-retry-interval"
                      type="number"
                      min={0}
                      max={3600000}
                      step={1}
                      value={cfg.retry_interval_ms}
                      disabled={cfg.retry_count === 0}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 0 && n <= 3600000) patch({ retry_interval_ms: n });
                      }}
                      aria-describedby="judge-retry-interval-hint"
                    />
                    <FieldDescription id="judge-retry-interval-hint">{ui("screen.da794e45a7eb4b")}</FieldDescription>
                  </FormField>
                </FieldGroup>
                <Field label={ui("screen.a16891a688563e")}>
                  <Select
                    value={cfg.fail_action}
                    onValueChange={(v) => patch({ fail_action: v as JudgeConfig["fail_action"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">{ui("screen.561817f0252936")}</SelectItem>
                      <SelectItem value="ask">{ui("screen.1b1bd81c56e340")}</SelectItem>
                      <SelectItem value="deny">{ui("screen.bf33347e3c8572")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={ui("screen.6a2e493b857f70")}>
                  <Select
                    value={cfg.incomplete_script_action}
                    onValueChange={(v) =>
                      patch({ incomplete_script_action: v as JudgeConfig["incomplete_script_action"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ask">{ui("screen.1b34ab7b0658ac")}</SelectItem>
                      <SelectItem value="model">{ui("screen.8a49379d4520c8")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />

              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {ui("screen.09d364807be2e3")}
                </p>
                <Field label={ui("screen.804ee34cc055fa")}>
                  <Input
                    type="number"
                    min={5}
                    value={cfg.ask_timeout_seconds}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (n > 0) patch({ ask_timeout_seconds: n });
                    }}
                  />
                </Field>
                <Field label={ui("screen.87c1acaedebabf")}>
                  <Select
                    value={cfg.ask_timeout_action}
                    onValueChange={(v) => patch({ ask_timeout_action: v as JudgeConfig["ask_timeout_action"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deny">{ui("screen.bf33347e3c8572")}</SelectItem>
                      <SelectItem value="allow">{ui("screen.561817f0252936")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || loading}>
          {saving ? ui("screen.ff509c9ba052a2") : ui("screen.6e584e3d5ce64a")}
        </Button>
      </div>
    </div>
  );
}

// ---- page ----

export default function InterceptPage() {
  const { ui, liveUI } = useUITranslation();

  const [rules, setRules] = React.useState<InterceptRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InterceptRule | null>(null);
  const [form, setForm] = React.useState<RuleForm>(defaultForm());
  const [saving, setSaving] = React.useState(false);
  const [regexErr, setRegexErr] = React.useState("");
  const [regexWarn, setRegexWarn] = React.useState(false); // true = JS 无法解析但可能是合法 Go 语法

  // ---- tool scope dialog ----
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [allTools, setAllTools] = React.useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = React.useState<Set<string>>(new Set());
  const [scopeLoading, setScopeLoading] = React.useState(false);
  const [scopeSaving, setScopeSaving] = React.useState(false);
  const [scopeTools, setScopeTools] = React.useState<string[]>([]); // 页头信息条:当前进入拦截的工具

  // ---- data ----

  const loadScope = React.useCallback(async () => {
    try {
      const cfg = await api.interceptGetToolConfig();
      setScopeTools(cfg.enabled_tools);
    } catch {
      // 信息条非关键,失败静默
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await api.interceptRules();
      setRules(r);
    } catch {
      toast.error(liveUI("screen.0b36944836c197"));
    } finally {
      setLoading(false);
    }
  }, [liveUI]);

  React.useEffect(() => {
    load();
    loadScope();
  }, [load, loadScope]);

  React.useEffect(() => {
    if (form.match_type !== "regex" || !form.pattern) {
      setRegexErr("");
      setRegexWarn(false);
      return;
    }
    try {
      new RegExp(form.pattern);
      setRegexErr("");
      setRegexWarn(false);
    } catch {
      // JS RegExp 不支持 Go RE2 扩展语法（如 (?i) 内联 flag）。
      // 这里只是预览校验失败，不代表 Go 端无效；交给服务端最终验证。
      setRegexErr("");
      setRegexWarn(true);
    }
  }, [form.pattern, form.match_type]);

  // ---- rule handlers ----

  function set(patch: Partial<RuleForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openNew() {
    setEditing(null);
    setForm(defaultForm());
    setRegexErr("");
    setOpen(true);
  }

  function openEdit(rule: InterceptRule) {
    setEditing(rule);
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      match_target: rule.match_target,
      match_type: rule.match_type,
      pattern: rule.pattern,
      action: rule.action,
      message: rule.message,
      timeout_enabled: rule.timeout_enabled,
      timeout_seconds: rule.timeout_seconds,
      timeout_action: rule.timeout_action,
    });
    setRegexErr("");
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error(ui("screen.e83654164a44f7"));
      return;
    }
    if (!form.pattern.trim()) {
      toast.error(ui("screen.bb7ad7fcc3d0a6"));
      return;
    }
    if (regexErr) {
      toast.error(ui("screen.2e4e9e4fef8f52"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateInterceptRule(editing.id, form);
        toast.success(ui("screen.752a9908bb6690"));
      } else {
        await api.createInterceptRule(form);
        toast.success(ui("screen.f89afbf2a0241b"));
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteInterceptRule(id);
      toast.success(ui("screen.04e366e339819a"));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleToggle(rule: InterceptRule) {
    try {
      await api.toggleInterceptRule(rule.id, !rule.enabled);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ---- scope handlers ----

  async function openScope() {
    setScopeOpen(true);
    setScopeLoading(true);
    try {
      const [tools, cfg] = await Promise.all([api.tools(), api.interceptGetToolConfig()]);
      setAllTools(tools);
      setEnabledTools(new Set(cfg.enabled_tools));
    } catch (e) {
      toast.error(ui("screen.08417baa06d4b3") + (e as Error).message);
    } finally {
      setScopeLoading(false);
    }
  }

  function toggleTool(key: string, val: boolean) {
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (val) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function saveScope() {
    setScopeSaving(true);
    try {
      await api.interceptSetToolConfig([...enabledTools]);
      toast.success(ui("screen.3eac2c08f7f2f5"));
      setScopeTools([...enabledTools]);
      setScopeOpen(false);
    } catch (e) {
      toast.error(ui("screen.84bd3b614686b6") + (e as Error).message);
    } finally {
      setScopeSaving(false);
    }
  }

  const toolGroups = React.useMemo(() => groupTools(allTools, ui), [allTools, ui]);

  // ---- render ----

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {/* ---- header ---- */}
      <div className="flex items-center gap-2.5">
        <ShieldAlertIcon className="h-5 w-5 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">{ui("screen.52619a5f4ae8ed")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ui("screen.d9bb36ccdd362b")}</p>
        </div>
      </div>

      {/* ---- 拦截范围信息条（规则匹配与模型兜底共用：不在范围内的工具两者都不介入）---- */}
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${
          scopeTools.length === 0 ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20" : "bg-muted/40"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <ListFilterIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium">{ui("screen.7c341811f166c3")}</span>
          {scopeTools.length === 0 ? (
            <span className="text-amber-700 dark:text-amber-500">{ui("screen.d9d67723d20d7b")}</span>
          ) : (
            <>
              <Badge variant="secondary" className="shrink-0">
                {scopeTools.length} {ui("screen.e43b2a10830f3e")}
              </Badge>
              <span className="truncate text-muted-foreground" title={scopeTools.join("、")}>
                {scopeTools.join("、")}
              </span>
            </>
          )}
        </div>
        <Button
          variant={scopeTools.length === 0 ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={openScope}
        >
          <ListFilterIcon className="h-4 w-4" />
          {ui("screen.f70f700e628d90")}
        </Button>
      </div>

      <Tabs defaultValue="rules" className="flex-1">
        <TabsList>
          <TabsTrigger value="rules">{ui("screen.a1817178b44e04")}</TabsTrigger>
          <TabsTrigger value="judge">{ui("screen.8cbcf741e727db")}</TabsTrigger>
        </TabsList>

        {/* ---- tab: 拦截规则 ---- */}
        <TabsContent value="rules" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{ui("screen.5a8998803f2d97")}</p>
            <Button onClick={openNew} size="sm" className="shrink-0">
              <PlusIcon className="h-4 w-4" />
              {ui("screen.af89131d305647")}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-6 text-sm text-muted-foreground">{ui("screen.4927a53bcc886a")}</p>
              ) : rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <ShieldAlertIcon className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{ui("screen.ee2d5612330ee7")}</p>
                  <Button size="sm" variant="outline" onClick={openNew}>
                    <PlusIcon className="h-4 w-4" />
                    {ui("screen.319141119ec9d7")}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[72px]">{ui("screen.565d64601d4d17")}</TableHead>
                      <TableHead>{ui("screen.d44e9b3d3b31d3")}</TableHead>
                      <TableHead className="w-[90px]">{ui("screen.57060c88a36bf3")}</TableHead>
                      <TableHead className="w-[80px]">{ui("screen.ba40014ff496f6")}</TableHead>
                      <TableHead>{ui("screen.47a270081ab289")}</TableHead>
                      <TableHead className="w-[72px]">{ui("screen.9c8eb75c7e58b4")}</TableHead>
                      <TableHead className="w-[64px] text-center">{ui("screen.f4f0ead1116b5b")}</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id} className={!rule.enabled ? "opacity-40" : ""}>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums">{rule.priority}</span>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {rule.match_target === "tool_name"
                              ? ui("screen.71e75afde6e4cb")
                              : ui("screen.6495aeb002d4bd")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {rule.match_type === "regex" ? ui("screen.75b304aa942099") : ui("screen.6aaf0b1804f99c")}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <code className="block truncate rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                            {rule.pattern}
                          </code>
                        </TableCell>
                        <TableCell>
                          <ActionBadge action={rule.action} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rule)}>
                              <PencilIcon className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(rule.id)}
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- tab: 模型配置 ---- */}
        <TabsContent value="judge" className="mt-4">
          <JudgeCard />
        </TabsContent>
      </Tabs>

      {/* ---- editor sheet ---- */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{editing ? ui("screen.efe0feab9fd4d0") : ui("screen.af89131d305647")}</SheetTitle>
            <SheetDescription className="text-xs">{ui("screen.3c5b876f37c630")}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <Field label={ui("screen.d44e9b3d3b31d3")}>
              <Input
                placeholder={ui("screen.ae0315ada4c845")}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>

            <Field label={ui("screen.b867ac214df2b8")}>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => set({ priority: parseInt(e.target.value) || 0 })}
              />
            </Field>

            <Separator />

            <Field label={ui("screen.1f76a5d1c1956b")}>
              <Select
                value={form.match_target}
                onValueChange={(v) => set({ match_target: v as RuleForm["match_target"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tool_name">{ui("screen.eead3fdb5ef996")}</SelectItem>
                  <SelectItem value="tool_input">{ui("screen.895fbd9df295e6")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={ui("screen.0bfdec37b5e03a")}>
              <Select value={form.match_type} onValueChange={(v) => set({ match_type: v as RuleForm["match_type"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">{ui("screen.1575e22a17f3e8")}</SelectItem>
                  <SelectItem value="regex">{ui("screen.af33e62808ca68")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={ui("screen.47a270081ab289")}>
              <Input
                placeholder={form.match_type === "regex" ? "^Bash$" : "rm -rf"}
                value={form.pattern}
                onChange={(e) => set({ pattern: e.target.value })}
                className={regexErr ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {regexErr && <p className="text-xs text-destructive mt-1">{regexErr}</p>}
              {regexWarn && (
                <p className="text-xs text-amber-600 mt-1">
                  {ui("screen.bdfa7b61b1425f")}
                  <code className="font-mono">(?i)</code>
                  {ui("screen.bd4ddb32f32d36")}
                </p>
              )}
            </Field>

            <Separator />

            <Field label={ui("screen.95d1a8cbe1f03e")}>
              <Select value={form.action} onValueChange={(v) => set({ action: v as InterceptAction })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">{ui("screen.c9563cd9e68be1")}</SelectItem>
                  <SelectItem value="deny">{ui("screen.e8bf8c52d76bb2")}</SelectItem>
                  <SelectItem value="ask">{ui("screen.9b19df849e3820")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.action !== "allow" && (
              <Field label={form.action === "deny" ? ui("screen.88193186c599c2") : ui("screen.bcbc584d0ac2b1")}>
                <Textarea
                  placeholder={form.action === "deny" ? "操作被安全策略阻止" : ""}
                  value={form.message}
                  onChange={(e) => set({ message: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </Field>
            )}

            {form.action === "ask" && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{ui("screen.51c5fa934d7c71")}</p>
                    <p className="text-xs text-muted-foreground">{ui("screen.c9082cff7e1acc")}</p>
                  </div>
                  <Switch checked={form.timeout_enabled} onCheckedChange={(v) => set({ timeout_enabled: v })} />
                </div>
                {form.timeout_enabled && (
                  <div className="flex items-end gap-3">
                    <Field label={ui("screen.3899218664bb77")}>
                      <Input
                        type="number"
                        min={5}
                        className="w-28"
                        value={form.timeout_seconds}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n > 0) set({ timeout_seconds: n });
                        }}
                      />
                    </Field>
                    <Field label={ui("screen.8c217cad124aab")}>
                      <Select
                        value={form.timeout_action}
                        onValueChange={(v) => set({ timeout_action: v as "deny" | "allow" })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deny">{ui("screen.d3dea79ccccfb5")}</SelectItem>
                          <SelectItem value="allow">{ui("screen.06adbde6b3cfd6")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}

            <Separator />

            <div className="flex items-center gap-3">
              <Switch id="rule-enabled" checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
              <Label htmlFor="rule-enabled" className="cursor-pointer">
                {ui("screen.78df930d18a227")}
              </Label>
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui("screen.2cd0f3be8738a8")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !!regexErr}>
              {saving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ---- scope dialog ---- */}
      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent
          className="sm:max-w-lg flex flex-col overflow-hidden p-0 gap-0"
          style={{ maxHeight: "min(80vh, 560px)" }}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <ListFilterIcon className="h-4 w-4" />
              {ui("screen.7c341811f166c3")}
            </DialogTitle>
            <DialogDescription className="text-xs">{ui("screen.1f08f0b7e619a9")}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
            {scopeLoading ? (
              <p className="text-sm text-muted-foreground py-4">{ui("screen.4927a53bcc886a")}</p>
            ) : (
              toolGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <Separator className="mb-5" />}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.tools.map((t) => (
                      <div key={t.key} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                        <Switch
                          id={`scope-${t.key}`}
                          checked={enabledTools.has(t.key)}
                          onCheckedChange={(v) => toggleTool(t.key, v)}
                        />
                        <label htmlFor={`scope-${t.key}`} className="flex-1 min-w-0 cursor-pointer">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm">{t.key}</span>
                            {t.kind && t.kind !== "builtin" && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                {t.kind}
                              </Badge>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{t.description}</p>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setScopeOpen(false)}>
              {ui("screen.2cd0f3be8738a8")}
            </Button>
            <Button size="sm" onClick={saveScope} disabled={scopeSaving || scopeLoading}>
              {scopeSaving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
