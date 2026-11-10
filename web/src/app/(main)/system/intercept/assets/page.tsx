"use client";
import * as React from "react";

import { BanIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { AssetInterceptKind, AssetInterceptRule } from "@/lib/types";

// ---- kind 元信息 ----

const KIND_OPTIONS = (
  ui: UITranslate,
): { value: AssetInterceptKind; label: string; group: string; placeholder: string }[] => [
  {
    value: "exact_domain",
    label: ui("screen.c7167063636d51"),
    group: ui("screen.c32cb2a23a5830"),
    placeholder: "example.gov.cn",
  },
  {
    value: "exact_ip",
    label: ui("screen.079fbab1d03325"),
    group: ui("screen.c32cb2a23a5830"),
    placeholder: "203.0.113.10",
  },
  {
    value: "exact_url",
    label: ui("screen.53e1fc899521bb"),
    group: ui("screen.c32cb2a23a5830"),
    placeholder: "https://example.gov.cn/login",
  },
  {
    value: "fuzzy_domain",
    label: ui("screen.dac46965db30ec"),
    group: ui("screen.11d3fca99fc591"),
    placeholder: ".gov.cn",
  },
  {
    value: "fuzzy_ip",
    label: ui("screen.0e98d3fa856342"),
    group: ui("screen.11d3fca99fc591"),
    placeholder: "203.0.113.",
  },
  { value: "fuzzy_url", label: ui("screen.f7c324af4a6957"), group: ui("screen.11d3fca99fc591"), placeholder: "/admin" },
  {
    value: "cidr",
    label: ui("screen.cc8f71b98fccc4"),
    group: ui("screen.097e79b99ea5ca"),
    placeholder: "192.168.0.0/16",
  },
];

const KIND_LABEL = (ui: UITranslate): Record<AssetInterceptKind, string> =>
  Object.fromEntries(KIND_OPTIONS(ui).map((o) => [o.value, o.label])) as Record<AssetInterceptKind, string>;

const KIND_GROUPS = (ui: UITranslate) => [
  ui("screen.c32cb2a23a5830"),
  ui("screen.11d3fca99fc591"),
  ui("screen.097e79b99ea5ca"),
];

function KindBadge({ kind }: { kind: AssetInterceptKind }) {
  const { ui } = useUITranslation();
  const fuzzy = kind.startsWith("fuzzy_");
  const cidr = kind === "cidr";
  return (
    <Badge
      variant="outline"
      className={
        cidr
          ? "border-sky-400 text-sky-600"
          : fuzzy
            ? "border-amber-400 text-amber-600"
            : "border-emerald-400 text-emerald-600"
      }
    >
      {KIND_LABEL(ui)[kind]}
    </Badge>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---- form state ----

type RuleForm = {
  enabled: boolean;
  kind: AssetInterceptKind;
  pattern: string;
  note: string;
};

const defaultForm = (): RuleForm => ({ enabled: true, kind: "fuzzy_domain", pattern: "", note: "" });

// 前端轻校验（与后端一致：仅 exact_ip / cidr 做格式校验，其余交后端）。
function frontValidate(form: RuleForm, ui: UITranslate): string | null {
  const p = form.pattern.trim();
  if (!p) return ui("screen.97d507c72efaa8");
  if (form.kind === "cidr" && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(p)) {
    return ui("screen.7a66fbcf6b268d");
  }
  return null;
}

// ---- page ----

export default function AssetInterceptPage() {
  const { ui, liveUI } = useUITranslation();

  const [rules, setRules] = React.useState<AssetInterceptRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssetInterceptRule | null>(null);
  const [form, setForm] = React.useState<RuleForm>(defaultForm());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setRules(await api.assetInterceptRules());
    } catch {
      toast.error(liveUI("screen.6255048bf93d25"));
    } finally {
      setLoading(false);
    }
  }, [liveUI]);

  React.useEffect(() => {
    load();
  }, [load]);

  function set(patch: Partial<RuleForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openNew() {
    setEditing(null);
    setForm(defaultForm());
    setOpen(true);
  }

  function openEdit(rule: AssetInterceptRule) {
    setEditing(rule);
    setForm({ enabled: rule.enabled, kind: rule.kind, pattern: rule.pattern, note: rule.note });
    setOpen(true);
  }

  async function handleSave() {
    const err = frontValidate(form, ui);
    if (err) {
      toast.error(err);
      return;
    }
    const payload = { ...form, pattern: form.pattern.trim() };
    setSaving(true);
    try {
      if (editing) {
        await api.updateAssetInterceptRule(editing.id, payload);
        toast.success(ui("screen.752a9908bb6690"));
      } else {
        await api.createAssetInterceptRule(payload);
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

  async function handleDelete(rule: AssetInterceptRule) {
    if (!window.confirm(ui("screen.f02dc764c52efc", { v0: rule.pattern }))) return;
    try {
      await api.deleteAssetInterceptRule(rule.id);
      toast.success(ui("screen.04e366e339819a"));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleToggle(rule: AssetInterceptRule) {
    try {
      await api.toggleAssetInterceptRule(rule.id, !rule.enabled);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const placeholder = KIND_OPTIONS(ui).find((o) => o.value === form.kind)?.placeholder ?? "";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {/* header */}
      <div className="flex items-center gap-2.5">
        <BanIcon className="h-5 w-5 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">{ui("screen.c2b56e033f20f4")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ui("screen.23ca4648533e60")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{ui("screen.05a1bb05454aa1")}</p>
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
              <BanIcon className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{ui("screen.65123193120739")}</p>
              <Button size="sm" variant="outline" onClick={openNew}>
                <PlusIcon className="h-4 w-4" />
                {ui("screen.319141119ec9d7")}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[130px]">{ui("screen.ba40014ff496f6")}</TableHead>
                  <TableHead>{ui("screen.f56dd05e1d5122")}</TableHead>
                  <TableHead>{ui("screen.daede9881787ab")}</TableHead>
                  <TableHead className="w-[64px] text-center">{ui("screen.f4f0ead1116b5b")}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={!rule.enabled ? "opacity-40" : ""}>
                    <TableCell>
                      <KindBadge kind={rule.kind} />
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <code className="block truncate rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {rule.pattern}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {rule.builtin && (
                          <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px]">
                            {ui("screen.95e35aabd9a9ff")}
                          </Badge>
                        )}
                        <span className="truncate">{rule.note}</span>
                      </div>
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
                          onClick={() => handleDelete(rule)}
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

      {/* editor sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{editing ? ui("screen.ce75f54cee863b") : ui("screen.139d34bc8f7208")}</SheetTitle>
            <SheetDescription className="text-xs">{ui("screen.bf211fb71a706c")}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <Field label={ui("screen.0bfdec37b5e03a")}>
              <Select value={form.kind} onValueChange={(v) => set({ kind: v as AssetInterceptKind })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_GROUPS(ui).map((g) => (
                    <React.Fragment key={g}>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {g}
                      </div>
                      {KIND_OPTIONS(ui)
                        .filter((o) => o.group === g)
                        .map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={ui("screen.f56dd05e1d5122")}
              hint={
                form.kind === "cidr"
                  ? ui("screen.33233b60003dad")
                  : form.kind.startsWith("fuzzy_")
                    ? ui("screen.f915f6658c94cc")
                    : ui("screen.30eb8ea294c94f")
              }
            >
              <Input
                placeholder={placeholder}
                value={form.pattern}
                onChange={(e) => set({ pattern: e.target.value })}
              />
            </Field>

            <Field label={ui("screen.b405227c7e3f93")}>
              <Textarea
                placeholder={ui("screen.3c2b4a3c3fdaf9")}
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                rows={2}
                className="resize-none"
              />
            </Field>

            <Separator />

            <div className="flex items-center gap-3">
              <Switch id="asset-rule-enabled" checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
              <Label htmlFor="asset-rule-enabled" className="cursor-pointer">
                {ui("screen.78df930d18a227")}
              </Label>
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui("screen.2cd0f3be8738a8")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
