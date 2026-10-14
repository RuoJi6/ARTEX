"use client";

import * as React from "react";
import { toast } from "sonner";
import { DatabaseIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { KBSource } from "@/lib/types";

// 当前后端仅注册了 "dify" 一个类型。新增后端类型时，在这里加一项并扩展下方的字段表单。
const KB_TYPES = [{ value: "dify", label: "Dify（语义检索）" }];

type KBFormState = {
  name: string;
  type: string;
  base_url: string;
  dataset_id: string;
  api_key: string;
  timeout: string;
  min_score: string;
};

const emptyForm: KBFormState = {
  name: "",
  type: "dify",
  base_url: "",
  dataset_id: "",
  api_key: "",
  timeout: "",
  min_score: "",
};

function sourceToForm(s: KBSource): KBFormState {
  const f = s.fields ?? {};
  return {
    name: s.name,
    type: s.type || "dify",
    base_url: String(f.base_url ?? ""),
    dataset_id: String(f.dataset_id ?? ""),
    api_key: "",
    timeout: String(f.timeout ?? ""),
    min_score: f.min_score != null ? String(f.min_score) : "",
  };
}

export default function RAGPage() {
  const [sources, setSources] = React.useState<KBSource[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KBSource | null>(null); // null = add
  const [form, setForm] = React.useState<KBFormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    api
      .kbSources()
      .then((ss) => setSources(ss))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  function setF(patch: Partial<KBFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(s: KBSource) {
    setEditing(s);
    setForm(sourceToForm(s));
    setOpen(true);
  }

  function buildSource(): KBSource | null {
    const name = form.name.trim();
    if (!name) {
      toast.error("请填写名称");
      return null;
    }
    if (!form.base_url.trim()) {
      toast.error("请填写 base_url");
      return null;
    }
    if (!form.dataset_id.trim()) {
      toast.error("请填写 dataset_id");
      return null;
    }
    const fields: Record<string, unknown> = {
      base_url: form.base_url.trim(),
      dataset_id: form.dataset_id.trim(),
    };
    if (form.timeout.trim()) fields.timeout = form.timeout.trim();
    const score = Number(form.min_score);
    if (form.min_score.trim() && !Number.isNaN(score)) fields.min_score = score;
    return {
      name,
      type: form.type,
      api_key: form.api_key.trim() || undefined,
      fields,
    };
  }

  async function saveForm() {
    const src = buildSource();
    if (!src) return;
    setSaving(true);
    try {
      // 后端 PUT 是整体替换：合并后发送完整列表。
      const next = editing
        ? sources.map((s) => (s.name === editing.name ? src : s))
        : [...sources, src];
      await api.saveKBSources(next);
      toast.success(editing ? "已保存" : "已添加知识源");
      if (!editing) setOpen(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeSource(s: KBSource) {
    try {
      const next = sources.filter((x) => x.name !== s.name);
      await api.saveKBSources(next);
      toast.success(`已删除：${s.name}`);
      setOpen(false);
      load();
    } catch (e) {
      toast.error("删除失败：" + (e as Error).message);
    }
  }

  function renderForm() {
    return (
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>类型</Label>
          <Select value={form.type} onValueChange={(v) => setF({ type: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KB_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kb-name">名称</Label>
          <Input
            id="kb-name"
            placeholder="cve"
            value={form.name}
            onChange={(e) => setF({ name: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kb-base-url">base_url</Label>
          <Input
            id="kb-base-url"
            className="font-mono"
            placeholder="http://dify:8080"
            value={form.base_url}
            onChange={(e) => setF({ base_url: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kb-dataset-id">dataset_id</Label>
          <Input
            id="kb-dataset-id"
            className="font-mono"
            placeholder="数据集的 id"
            value={form.dataset_id}
            onChange={(e) => setF({ dataset_id: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kb-api-key">API Key</Label>
          <Input
            id="kb-api-key"
            type="password"
            autoComplete="new-password"
            placeholder={editing?.api_key_set ? "已设置（留空保持不变）" : "dataset-xxx"}
            value={form.api_key}
            onChange={(e) => setF({ api_key: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="kb-timeout">超时（可选）</Label>
            <Input
              id="kb-timeout"
              className="font-mono"
              placeholder="5s"
              value={form.timeout}
              onChange={(e) => setF({ timeout: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kb-min-score">最低相似度（可选）</Label>
            <Input
              id="kb-min-score"
              type="number"
              min={0}
              max={1}
              step={0.05}
              placeholder="0.65"
              value={form.min_score}
              onChange={(e) => setF({ min_score: e.target.value })}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">知识库</h1>
        <p className="text-muted-foreground text-sm">外部知识源（RAG）· 为 Agent 提供 knowledge_search 语义检索</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={openAdd}
          className="text-foreground/70 border-foreground/70 hover:bg-muted/60 hover:shadow-sm flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition"
        >
          <PlusIcon className="size-6" />
          <span className="text-sm">添加知识源</span>
        </button>

        {sources.map((s) => (
          <Card
            key={s.name}
            onClick={() => openEdit(s)}
            className="hover:border-primary/60 cursor-pointer gap-3 transition hover:shadow-sm"
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <DatabaseIcon className="text-muted-foreground size-4 shrink-0" />
                <CardTitle className="truncate text-base">{s.name}</CardTitle>
                <Badge variant="outline" className="uppercase">
                  {s.type}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSource(s);
                    }}
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="text-muted-foreground truncate text-sm">
                {String(s.fields?.base_url ?? "")}
              </p>
              <p className="text-muted-foreground text-xs">
                {s.api_key_set ? "已配置 API Key" : "未配置 API Key"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loaded && sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">尚未配置知识源。点击「添加知识源」接入 Dify 等外部知识库。</p>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? editing.name : "添加知识源"}</SheetTitle>
            <SheetDescription>外部知识库的语义检索配置，保存后为 Agent 注入 knowledge_search 工具</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
            {renderForm()}
            <div className="pt-2 pb-6">
              <Button onClick={saveForm} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
