"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_TASK_REMARK_RUNES } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditorProps = {
  value?: string;
  label: string;
  onSave: (value: string) => Promise<void>;
};

export function RemarkEditor(props: EditorProps) {
  const t = useTranslations("inlineEditor");
  return <InlineTextEditor {...props} multiline fieldName={t("remark")} maxCharacters={MAX_TASK_REMARK_RUNES} emptyLabel={t("addRemark")} />;
}

export function ScheduleNameEditor(props: EditorProps) {
  const t = useTranslations("inlineEditor");
  return <InlineTextEditor {...props} multiline={false} fieldName={t("name")} maxCharacters={200} emptyLabel={t("unnamed")} />;
}

function InlineTextEditor({
  value = "",
  label,
  onSave,
  multiline,
  fieldName,
  maxCharacters,
  emptyLabel,
}: EditorProps & { multiline: boolean; fieldName: string; maxCharacters: number; emptyLabel: string }) {
  const t = useTranslations("inlineEditor");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<"" | "required" | "tooLong" | "saveFailed">("");
  const [errorDetail, setErrorDetail] = React.useState("");
  const errorMessage = error ? t(error, { field: fieldName, max: maxCharacters, detail: errorDetail }) : "";
  const inputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const cancelOnBlurRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const errorID = React.useId();

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  function refocus() {
    requestAnimationFrame(() => (multiline ? textareaRef.current : inputRef.current)?.focus());
  }

  async function finishEditing() {
    if (savingRef.current) return;
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      setDraft(value);
      setError("");
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    if (!multiline && next.length === 0) {
      setError("required");
      refocus();
      return;
    }
    if (Array.from(next).length > maxCharacters) {
      setError("tooLong");
      refocus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(next);
      toast.success(t("saved", { field: fieldName }));
      setEditing(false);
    } catch (cause) {
      setError("saveFailed");
      setErrorDetail((cause as Error).message);
      refocus();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (editing) {
    const inputProps = {
      value: draft,
      autoFocus: true,
      disabled: saving,
      "aria-busy": saving,
      "aria-label": t("inputLabel", { label, field: fieldName }),
      "aria-invalid": error.length > 0,
      "aria-describedby": error ? errorID : undefined,
      title: multiline ? t("remarkHint") : t("nameHint"),
      onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.select(),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDraft(event.target.value);
        setError("");
      },
      onBlur: () => void finishEditing(),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelOnBlurRef.current = true;
          event.currentTarget.blur();
        }
      },
    };
    return (
      <div className={cn("flex min-w-0 flex-col gap-1 font-medium", multiline && "w-32 min-w-28 sm:w-48")}>
        {multiline ? (
          <Textarea
            {...inputProps}
            ref={textareaRef}
            rows={1}
            className="max-h-40 min-h-7 resize-none px-2 py-1 [overflow-wrap:anywhere]"
          />
        ) : (
          <Input {...inputProps} ref={inputRef} className="h-7 min-w-28 max-w-48 px-2 font-medium" />
        )}
        {error ? (
          <p id={errorID} role="alert" className="whitespace-normal text-destructive text-xs">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  const startEditing = () => {
    setDraft(value);
    setError("");
    setEditing(true);
  };
  return (
    <div
      className={cn(
        "group/inline-editor flex min-w-0 items-center gap-1 font-medium",
        multiline ? "w-fit max-w-32 sm:max-w-48" : "max-w-xs",
      )}
    >
      <button
        type="button"
        className="min-w-0 truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("clickToEdit", { label, field: fieldName })}
        title={value.length > 0 ? value : t("editHint", { field: fieldName })}
        onClick={startEditing}
      >
        {value.length > 0 ? (
          <span className="block truncate">{value}</span>
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )}
      </button>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within/inline-editor:opacity-100 [@media(hover:hover)]:group-hover/inline-editor:opacity-100"
            aria-label={t("editLabel", { label, field: fieldName })}
            onClick={startEditing}
          >
            <PencilIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {t("editTooltip", { field: fieldName })}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
