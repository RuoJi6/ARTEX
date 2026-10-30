"use client";

import * as React from "react";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defaultHighlightStyle, HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const packetHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#d95656", fontWeight: "700" },
  { tag: tags.string, color: "#0284c7" },
  { tag: tags.variableName, color: "#286dcc", fontWeight: "650" },
  { tag: tags.typeName, color: "#6b7280" },
  { tag: tags.number, color: "#c026d3" },
  { tag: tags.bool, color: "#e11d48" },
]);

const httpLanguage = StreamLanguage.define({
  startState: () => ({ line: 0 }),
  token(stream, state) {
    if (stream.sol()) state.line += 1;
    if (stream.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\b/)) return "keyword";
    if (stream.match(/^HTTP\/\d(?:\.\d)?\b/)) return "typeName";
    if (stream.match(/^[A-Za-z][A-Za-z0-9-]*(?=:)/)) return "variableName";
    if (stream.match(/^https?:\/\/\S+/)) return "string";
    if (stream.match(/^(?:\d{3})(?:\s+[^\n]*)?/)) return "number";
    if (stream.match(/^\b(?:true|false|null)\b/)) return "bool";
    stream.next();
    return null;
  },
});

const packetTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent", color: "var(--foreground)" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: "0.75rem",
      fontWeight: "500",
      lineHeight: "1.65rem",
    },
    ".cm-content": { minHeight: "100%", padding: "0.5rem 0.5rem" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted-foreground)",
      border: "0",
      borderRight: "1px solid var(--border)",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "2rem", padding: "0 0.5rem" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#c9d2e3" },
    ".cm-cursor": { borderLeftColor: "#222" },
  },
  { dark: false },
);

export function PacketCodeEditor({
  value,
  onChange,
  readOnly = false,
  wrapLines = true,
  ariaLabel = "HTTP 报文代码",
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  wrapLines?: boolean;
  ariaLabel?: string;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        httpLanguage,
        syntaxHighlighting(defaultHighlightStyle),
        syntaxHighlighting(packetHighlight),
        packetTheme,
        ...(wrapLines ? [EditorView.lineWrapping] : []),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ role: "textbox", "aria-label": ariaLabel, "aria-multiline": "true" }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          valueRef.current = next;
          onChangeRef.current?.(next);
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, readOnly, wrapLines]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || valueRef.current === value) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    valueRef.current = value;
  }, [value]);

  return <div ref={host} className="h-full min-h-0 w-full" />;
}
