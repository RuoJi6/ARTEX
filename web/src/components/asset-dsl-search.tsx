"use client";
import * as React from "react";

import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { cn } from "@/lib/utils";

// ── DSL autocomplete ──────────────────────────────────────────────────────────
// Shared by the global asset view (/function/assets) and the per-task 测试资产
// search, so both search boxes behave and look identical.

const DSL_FIELDS = (ui: UITranslate): { name: string; desc: string; ops: { op: string; desc: string }[] }[] => [
  {
    name: "domain",
    desc: ui("screen.57099007fa308d"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "ip",
    desc: ui("screen.d6bccb5525b543"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "url",
    desc: ui("screen.3e78ecd2c1c29e"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "root_domain",
    desc: ui("screen.bc208f697acff9"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "page_title",
    desc: ui("screen.69e532a0a63349"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "icp",
    desc: ui("screen.94a539470270db"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "service_name",
    desc: ui("screen.c481d537b52090"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "app_name",
    desc: ui("screen.e4569e38b854a1"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "bundle_id",
    desc: ui("screen.40a99c183eef6d"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "category",
    desc: ui("screen.5315ee8353ac3f"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "app_icp",
    desc: ui("screen.1482fa61ead67e"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "method",
    desc: ui("screen.6b3e518f24ef15"),
    ops: [
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "service_type",
    desc: ui("screen.6fa8aac3e7f6dc"),
    ops: [
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "record_type",
    desc: ui("screen.98614bf0dfd16e"),
    ops: [
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "technology",
    desc: ui("screen.cf68ad2b6bffb4"),
    ops: [
      { op: "=", desc: ui("screen.11d3fca99fc591") },
      { op: "==", desc: ui("screen.391fe725d014c9") },
      { op: "!=", desc: ui("screen.ac83d3972fe9fd") },
    ],
  },
  {
    name: "port",
    desc: ui("screen.b54804697609f5"),
    ops: [
      { op: "==", desc: ui("screen.4bc69a0562ff8e") },
      { op: "!=", desc: ui("screen.9678e3a7cb3c9c") },
      { op: ">", desc: ui("screen.b4614ab230a531") },
      { op: ">=", desc: ui("screen.e1feef07d1b87b") },
      { op: "<", desc: ui("screen.a39accd3595fa6") },
      { op: "<=", desc: ui("screen.035d78382d6fae") },
    ],
  },
  {
    name: "status_code",
    desc: ui("screen.b4d43dea84773f"),
    ops: [
      { op: "==", desc: ui("screen.4bc69a0562ff8e") },
      { op: "!=", desc: ui("screen.9678e3a7cb3c9c") },
      { op: ">", desc: ui("screen.b4614ab230a531") },
      { op: ">=", desc: ui("screen.e1feef07d1b87b") },
      { op: "<", desc: ui("screen.a39accd3595fa6") },
      { op: "<=", desc: ui("screen.035d78382d6fae") },
    ],
  },
  { name: "company_id", desc: ui("screen.ddf430978fe51e"), ops: [{ op: "==", desc: ui("screen.4bc69a0562ff8e") }] },
  { name: "task_id", desc: ui("screen.e64f0ccf4690d2"), ops: [{ op: "==", desc: ui("screen.4bc69a0562ff8e") }] },
];

const LOGIC_OPS = (ui: UITranslate) => [
  { label: "AND", desc: ui("screen.c68c81f1b693b1") },
  { label: "OR", desc: ui("screen.6a5ea76d398f8b") },
];

interface DslSuggestion {
  kind: "field" | "operator" | "logic";
  label: string;
  desc: string;
  replaceStart: number;
  replaceEnd: number;
  insertText: string;
}

function getDslSuggestions(text: string, cursor: number, ui: UITranslate): DslSuggestion[] {
  const before = text.slice(0, cursor);
  // Current token: non-whitespace, non-paren run ending at cursor
  const tokenMatch = before.match(/([^\s()]*$)/);
  const currentToken = tokenMatch?.[1] ?? "";
  const tokenStart = cursor - currentToken.length;

  // Token already contains field+operator → typing a value, no suggestions
  if (/^[a-z_]+(==|!=|>=|<=|=|>|<)/.test(currentToken)) return [];

  // Complete known field name → suggest operators for that field
  const exactField = DSL_FIELDS(ui).find((f) => f.name === currentToken.toLowerCase());
  if (exactField) {
    return exactField.ops.map(({ op, desc }) => ({
      kind: "operator",
      label: `${exactField.name}${op}`,
      desc,
      replaceStart: tokenStart,
      replaceEnd: cursor,
      insertText: `${exactField.name}${op}`,
    }));
  }

  // Everything before the current token (trimmed)
  const beforeToken = before.slice(0, tokenStart).trimEnd();
  const afterExpression = beforeToken.length > 0 && !/\b(AND|OR)\s*$/i.test(beforeToken) && !beforeToken.endsWith("(");

  // Current token is a prefix of AND/OR and follows a complete expression
  if (/^(a|an|and|o|or)$/i.test(currentToken) && afterExpression) {
    return LOGIC_OPS(ui)
      .filter((l) => l.label.startsWith(currentToken.toUpperCase()))
      .map(({ label, desc }) => ({
        kind: "logic",
        label,
        desc,
        replaceStart: tokenStart,
        replaceEnd: cursor,
        insertText: `${label} `,
      }));
  }

  // No current token, after a complete expression → suggest AND/OR
  if (!currentToken && afterExpression) {
    return LOGIC_OPS(ui).map(({ label, desc }) => ({
      kind: "logic",
      label,
      desc,
      replaceStart: cursor,
      replaceEnd: cursor,
      insertText: `${label} `,
    }));
  }

  // Default: suggest fields filtered by prefix
  const prefix = currentToken.toLowerCase();
  return DSL_FIELDS(ui)
    .filter((f) => f.name.startsWith(prefix))
    .map((f) => ({
      kind: "field",
      label: f.name,
      desc: f.desc,
      replaceStart: tokenStart,
      replaceEnd: cursor,
      insertText: f.name,
    }));
}

function applyDslSuggestion(text: string, s: DslSuggestion): { text: string; cursor: number } {
  const newText = text.slice(0, s.replaceStart) + s.insertText + text.slice(s.replaceEnd);
  return { text: newText, cursor: s.replaceStart + s.insertText.length };
}

const KIND_STYLE: Record<string, string> = {
  field: "text-blue-500 dark:text-blue-400",
  operator: "text-amber-500 dark:text-amber-400",
  logic: "text-emerald-500 dark:text-emerald-400",
};

// AssetDslSearch is the shared DSL search box: a monospace input with a
// field/operator/logic autocomplete popover and a status line ("找到 N 条" /
// error / loading). Used by both the global asset view and the per-task view.
export function AssetDslSearch({
  query,
  onChange,
  loading,
  error,
  count,
}: {
  query: string;
  onChange: (v: string) => void;
  loading: boolean;
  error: string;
  count?: number;
}) {
  const { ui, liveUI } = useUITranslation();

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = React.useState<DslSuggestion[]>([]);
  const [selIdx, setSelIdx] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const refresh = React.useCallback(
    (val: string, pos: number) => {
      const suggs = getDslSuggestions(val, pos, liveUI);
      setSuggestions(suggs);
      setSelIdx(0);
      setOpen(suggs.length > 0);
    },
    [liveUI],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    refresh(val, e.target.selectionStart ?? val.length);
  };

  const apply = React.useCallback(
    (s: DslSuggestion) => {
      const cursor = inputRef.current?.selectionStart ?? query.length;
      // use cursor for logic-kind (insert at cursor), replaceStart/End for others
      const adjusted: DslSuggestion =
        s.kind === "logic" && !query.slice(s.replaceStart, s.replaceEnd)
          ? { ...s, replaceStart: cursor, replaceEnd: cursor }
          : s;
      const { text: newText, cursor: newCursor } = applyDslSuggestion(query, adjusted);
      onChange(newText);
      requestAnimationFrame(() => {
        if (!inputRef.current) return;
        inputRef.current.setSelectionRange(newCursor, newCursor);
        inputRef.current.focus();
        refresh(newText, newCursor);
      });
    },
    [query, onChange, refresh],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      const s = suggestions[selIdx];
      if (s) {
        e.preventDefault();
        apply(s);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const cursorPos = () => inputRef.current?.selectionStart ?? query.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative max-w-lg">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={ui("screen.987bc11337be5a")}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => refresh(query, cursorPos())}
          onClick={() => refresh(query, cursorPos())}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="h-8 pl-8 font-mono text-xs"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute top-full left-0 z-50 mt-1 w-max min-w-full max-w-sm rounded-md border bg-popover py-1 shadow-md">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={i}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left",
                  i === selIdx ? "bg-accent" : "hover:bg-accent/50",
                )}
                onMouseEnter={() => setSelIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(s);
                }}
              >
                <span className={cn("shrink-0 font-mono text-xs font-semibold", KIND_STYLE[s.kind])}>{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {query.trim() && !open && (
        <p className="pl-1 text-[11px] text-muted-foreground">
          {loading ? (
            ui("screen.cc50237edca27e")
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            ui("screen.1c84e7ce3e9eb5", { v0: count ?? 0 })
          )}
        </p>
      )}
    </div>
  );
}
