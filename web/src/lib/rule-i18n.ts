"use client";

import { useTranslations } from "next-intl";

import chinese from "../../messages/zh-CN.json";
import type { AssetInterceptRule } from "@/lib/types";

const nameKeys = new Map(Object.entries(chinese.builtinRules.names).map(([key, value]) => [value, key]));
const noteKeys = new Map(Object.entries(chinese.builtinRules.assetNotes).map(([key, value]) => [value, key]));

export function useBuiltinRuleLabels() {
  const t = useTranslations("builtinRules");
  // Translate unchanged bundled labels only; editors and rule payloads keep the stored values.
  const name = (value: string) => {
    const key = nameKeys.get(value);
    return key ? t(`names.${key}`) : value;
  };
  const assetNote = (rule: AssetInterceptRule) => {
    const key = rule.builtin ? noteKeys.get(rule.note) : undefined;
    return key ? t(`assetNotes.${key}`) : rule.note;
  };
  return { name, assetNote };
}
