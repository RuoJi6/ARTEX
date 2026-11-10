"use client";

import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import type { NotificationFilter } from "@/lib/types";

// asText / inputType 是本文件内的取值辅助（与控件渲染强相关），不放在 channel-fields。
import { type FieldDef, type FieldKind, SEVERITY_OPTIONS } from "./channel-fields";

// asText 把任意配置值渲染成输入框可用的字符串。
// config 来自 JSON，值可能是 string / number / boolean / array / null，
// 这里只关心「能不能塞进文本框」，具体序列化由 buildConfig 负责。
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

// inputType 把字段类型映射到 input 的 type 属性。
function inputType(kind: FieldKind): "text" | "password" | "number" {
  if (kind === "password") return "password";
  if (kind === "number") return "number";
  return "text";
}

// ConfigField 按字段定义渲染对应的控件。
//
// 掩码字段的处理是这里唯一的讲究：输入框**不显示**掩码值本身，只显示一行
// 「已保存」提示。这样界面上就只有一个规则——框里有字就是用户填的，
// 空框就是空值。若把 "__masked__:…abc123" 塞进输入框，用户会以为那是要自己
// 删掉的占位文本，反而更容易误清凭据。
export function ConfigField({
  def,
  value,
  isSecret,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  isSecret: boolean;
  onChange: (v: unknown) => void;
}) {
  const { t: translate } = useLiveTranslation();
  const help = def.help
    ? translate(def.help, {
        variables: "{{.Title}} {{.Batch}} {{.Count}} {{.HomeURL}} {{.SentAt}}",
        fields: ".Name/.VulnClass/.Severity/.Summary/.Assets/.DetailURL/.StatusLabel",
        jsonExample: "{{json .Xxx}}",
        rawExample: "{{.Xxx}}",
      })
    : undefined;
  const id = `n-cfg-${def.key}`;
  const raw = asText(value);
  // 后端回显的掩码值：形如 "__masked__:…abc123"，尾部是原值的可辨识片段。
  const masked = isSecret && raw.startsWith("__masked__");
  const maskedTail = masked ? (raw.split("…")[1] ?? "") : "";

  if (def.kind === "switch") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={onChange} aria-label={translate(def.label)} />
        {translate(def.label)}
        {help && <span className="text-muted-foreground">({help})</span>}
      </div>
    );
  }

  if (def.kind === "select") {
    return (
      <div className="grid gap-2">
        <Label>{translate(def.label)}</Label>
        <Select value={raw || def.options?.[0]?.value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {translate(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // 控件按字段类型分派。用 if 链而不是嵌套三元，是因为这里要区分四种控件，
  // 三层三元读起来已经要停下来数括号了。
  function control() {
    if (def.kind === "textarea" || def.kind === "kv") {
      return (
        <Textarea
          id={id}
          className="font-mono"
          placeholder={def.placeholder}
          value={masked ? "" : raw}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (def.kind === "list") {
      return (
        <Input
          id={id}
          value={Array.isArray(value) ? (value as string[]).join(", ") : raw}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      );
    }
    return (
      <Input
        id={id}
        className={def.kind === "text" ? "font-mono" : ""}
        type={inputType(def.kind)}
        placeholder={def.placeholder}
        value={masked ? "" : raw}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const hint = masked ? (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <CheckIcon className="size-3" />
      {translate("notify.maskedHint", { tail: maskedTail ? translate("notify.maskedTail", { tail: maskedTail }) : "" })}
    </p>
  ) : (
    help && <p className="text-muted-foreground text-xs">{help}</p>
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{translate(def.label)}</Label>
      {control()}
      {hint}
    </div>
  );
}

// FilterSummary 把过滤条件摘要成一行，让卡片不用展开就能看出这个渠道推什么。
export function FilterSummary({ filter }: { filter: NotificationFilter }) {
  const { t: translate } = useLiveTranslation();
  const parts: string[] = [];
  if (filter.min_severity) {
    parts.push(translate(SEVERITY_OPTIONS.find((o) => o.value === filter.min_severity)?.label ?? filter.min_severity));
  }
  if (filter.vulnclass_include?.length)
    parts.push(translate("notify.includeWords", { count: filter.vulnclass_include.length }));
  if (filter.vulnclass_exclude?.length)
    parts.push(translate("notify.excludeWords", { count: filter.vulnclass_exclude.length }));
  if (filter.task_ids?.length) parts.push(translate("notify.tasks", { count: filter.task_ids.length }));
  if (filter.asset_ids?.length) parts.push(translate("notify.assets", { count: filter.asset_ids.length }));
  if (filter.on_status_change) parts.push(translate("notify.withStatusChanges"));
  if (parts.length === 0) {
    return <p className="text-muted-foreground text-sm">{translate("notify.allFindings")}</p>;
  }
  return <p className="text-muted-foreground text-sm">{parts.join(" · ")}</p>;
}
