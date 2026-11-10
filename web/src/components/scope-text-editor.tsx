"use client";
import { translateFixedUIText } from "@/i18n/fixed-ui-text";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import type { ParsedCompanyScopeText } from "@/lib/company-scope";
import type { CompanyScopeKind } from "@/lib/types";

const SCOPE_KIND_LABELS = (ui: UITranslate): Record<CompanyScopeKind, string> => ({
  domain: ui("screen.222952431147e5"),
  ip: "IP",
  cidr: "CIDR",
  icp: "ICP",
  keyword: ui("screen.1f7f0db90f932d"),
});

export function ScopeTextEditor({
  id,
  value,
  onValueChange,
  parsed,
  label,
  description,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  parsed: ParsedCompanyScopeText;
  label?: string;
  description?: string;
}) {
  const { ui } = useUITranslation();

  description ??= ui("screen.9dcd42554171df");

  label ??= ui("screen.c3f497207f2e9c");

  const counts = React.useMemo(() => {
    const result = new Map<CompanyScopeKind, number>();
    for (const rule of parsed.rules) result.set(rule.kind, (result.get(rule.kind) ?? 0) + 1);
    return result;
  }, [parsed.rules]);

  return (
    <Field data-invalid={parsed.errors.length > 0}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Textarea
        id={id}
        rows={8}
        value={value}
        aria-invalid={parsed.errors.length > 0}
        placeholder={ui("screen.5a89b5eb13c9d6")}
        className="min-h-36 resize-y font-mono text-sm"
        onChange={(event) => onValueChange(event.target.value)}
      />
      {parsed.rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <span>
            {ui("screen.4d26bc13c4df88")}
            {parsed.rules.length} {ui("screen.f004f1d84cf962")}
          </span>
          {Object.entries(SCOPE_KIND_LABELS(ui)).map(([kind, kindLabel]) => {
            const count = counts.get(kind as CompanyScopeKind) ?? 0;
            return count > 0 ? (
              <Badge key={kind} variant="secondary" className="font-mono tabular-nums">
                {kindLabel} {count}
              </Badge>
            ) : null;
          })}
        </div>
      )}
      {parsed.errors.length > 0 && (
        <FieldError>
          {parsed.errors.slice(0, 5).map((item) => (
            <span key={`${item.line}-${item.error}`} className="block">
              {ui("screen.af50a0fe2a50a3")}
              {item.line} {ui("screen.a9e8c256cb932f")}
              {translateFixedUIText(item.error, ui)}
            </span>
          ))}
          {parsed.errors.length > 5 && (
            <span className="block">
              {ui("screen.268ec6902063db")}
              {parsed.errors.length - 5} {ui("screen.05527ba1b6850b")}
            </span>
          )}
        </FieldError>
      )}
    </Field>
  );
}
