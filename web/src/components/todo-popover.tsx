"use client";

import * as React from "react";
import { ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// TodoPopover shows the latest TodoWrite state of a session (chat conversation or
// task worker/planner replay). The full todo list isn't in the activity list
// (detail is lazy), so on open it fetches the detail of the most-recent TodoWrite
// call — by seq — and parses its {todos:[…]} JSON. Purely client-side; the caller
// supplies the seq + a detail fetcher (conversation or exploration endpoint).
export function TodoPopover({
  seq,
  fetchDetail,
}: {
  seq: number | null;
  fetchDetail: (seq: number) => Promise<string>;
}) {
  const t = useTranslations("sessionTodo");
  const [open, setOpen] = React.useState(false);
  const [todos, setTodos] = React.useState<{ content: string; status: string }[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const load = React.useEffectEvent(async () => {
    if (seq == null) return;
    setLoading(true);
    setFailed(false);
    try {
      const detail = await fetchDetail(seq);
      const start = detail.indexOf("{"); // detail 可能带 "TodoWrite " 前缀
      const parsed = JSON.parse(start >= 0 ? detail.slice(start) : detail);
      setTodos(Array.isArray(parsed?.todos) ? parsed.todos : []);
    } catch {
      setFailed(true);
      setTodos(null);
    } finally {
      setLoading(false);
    }
  });

  // Refetch on open or sequence changes, using the latest caller-supplied fetcher.
  // A new inline callback from the parent must not reload an open popup.
  React.useEffect(() => {
    if (open) load();
  }, [open, seq]);

  const disabled = seq == null;
  const MARK: Record<string, string> = { pending: "☐", in_progress: "▶", completed: "✔" };
  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? t("unavailable") : t("view")}
          className="text-muted-foreground/70 hover:text-primary flex items-center gap-0.5 text-xs disabled:pointer-events-none disabled:opacity-40"
        >
          <ListTodo className="size-3" />
          {t("trigger")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-80 w-80 overflow-auto p-2">
        <p className="text-muted-foreground px-1 pb-1 text-[11px] font-medium">
          {loading ? t("loading") : t("heading")}
        </p>
        {failed && <p className="text-destructive px-1 text-xs">{t("error")}</p>}
        {todos && todos.length === 0 && !loading && (
          <p className="text-muted-foreground px-1 text-xs">{t("empty")}</p>
        )}
        <ul className="space-y-0.5">
          {(todos ?? []).map((t, i) => (
            <li
              key={`${i}:${t.content}`}
              className={cn("flex gap-1.5 px-1 text-xs", t.status === "completed" && "text-muted-foreground line-through")}
            >
              <span className="shrink-0">{MARK[t.status] ?? "☐"}</span>
              <span className="break-words">{t.content}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
