"use client";

import * as React from "react";

import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { taskError } from "@/i18n/task-runtime";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { MAX_TASK_REMARK_RUNES } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditorProps = {
  value?: string;
  label: string;
  onSave: (value: string) => Promise<void>;
};

export function RemarkEditor(props: EditorProps) {
  return <InlineTextEditor {...props} multiline field="remark" maxCharacters={MAX_TASK_REMARK_RUNES} />;
}

export function ScheduleNameEditor(props: EditorProps) {
  return <InlineTextEditor {...props} multiline={false} field="name" maxCharacters={200} />;
}

function InlineTextEditor({
  value = "",
  label,
  onSave,
  multiline,
  field,
  maxCharacters,
}: EditorProps & { multiline: boolean; field: "remark" | "name"; maxCharacters: number }) {
  const { t: translate, liveT } = useLiveTranslation();
  const fieldName = translate(`inlineEditor.${field}`);
  const emptyLabel = translate(field === "remark" ? "inlineEditor.addRemark" : "inlineEditor.unnamed");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ kind: "required" | "length" | "save"; cause?: unknown } | null>(null);
  const errorText = !error
    ? ""
    : error.kind === "required"
      ? translate("inlineEditor.nameRequired")
      : error.kind === "length"
        ? translate("inlineEditor.tooLong", { field: fieldName, max: maxCharacters })
        : translate("inlineEditor.saveFailed", { field: fieldName, message: taskError(error.cause, translate) });
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
      setError(null);
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    if (!multiline && next.length === 0) {
      setError({ kind: "required" });
      refocus();
      return;
    }
    if (Array.from(next).length > maxCharacters) {
      setError({ kind: "length" });
      refocus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(next);
      toast.success(liveT("inlineEditor.saved", { field: liveT(`inlineEditor.${field}`) }));
      setEditing(false);
    } catch (cause) {
      setError({ kind: "save", cause });
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
      "aria-label": translate("inlineEditor.fieldLabel", { label, field: fieldName }),
      "aria-invalid": Boolean(error),
      "aria-describedby": error ? errorID : undefined,
      title: translate(multiline ? "inlineEditor.multilineHelp" : "inlineEditor.singleHelp"),
      onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.select(),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDraft(event.target.value);
        setError(null);
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
            {errorText}
          </p>
        ) : null}
      </div>
    );
  }

  const startEditing = () => {
    setDraft(value);
    setError(null);
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
        aria-label={translate("inlineEditor.clickLabel", { label, field: fieldName })}
        title={value.length > 0 ? value : translate("inlineEditor.clickEdit", { field: fieldName })}
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
            aria-label={translate("inlineEditor.editLabel", { label, field: fieldName })}
            onClick={startEditing}
          >
            <PencilIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {translate("inlineEditor.editHelp", { field: fieldName })}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
