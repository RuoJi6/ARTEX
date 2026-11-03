"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { LibraryIcon, PlusIcon, SaveIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { AssetInterceptRulesEditor } from "@/components/asset-intercept-rules-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  MAX_TASK_REMARK_RUNES,
  MAX_TASK_WORKER_COUNT,
  parseWorkerCountInput,
  type AssetInterceptRuleInput,
  type TaskCategory,
  type TaskTemplate,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface TemplateDraft {
  name: string;
  description: string;
  goal: string;
  remark: string;
  categoryID: number | null;
  interceptRules: AssetInterceptRuleInput[];
  workerCount: string; // 输入框用字符串;空/0=用全局默认
}

// TemplateSeed 是「另存为模板」时从创建表单带入的初值。
type TemplateSeed = Pick<TemplateDraft, "description" | "goal" | "remark" | "categoryID" | "interceptRules" | "workerCount">;

interface TaskTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TaskTemplate[];
  seed: TemplateSeed | null;
  onCreated: (template: TaskTemplate) => void;
  onUpdated: (template: TaskTemplate) => void;
  onDeleted: (id: number) => void;
}

const emptyDraft = (): TemplateDraft => ({
  name: "",
  description: "",
  goal: "",
  remark: "",
  categoryID: null,
  interceptRules: [],
  workerCount: "",
});

function templateDraft(template: TaskTemplate): TemplateDraft {
  return {
    name: template.name,
    description: template.description,
    goal: template.goal,
    remark: template.remark ?? "",
    categoryID: template.category_id ?? null,
    interceptRules: template.intercept_rules ?? [],
    workerCount: template.worker_count ? String(template.worker_count) : "",
  };
}

function TaskTemplateManager({
  open,
  onOpenChange,
  templates,
  seed,
  onCreated,
  onUpdated,
  onDeleted,
}: TaskTemplateManagerProps) {
  const t = useTranslations("taskTemplates");
  const [selectedID, setSelectedID] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<TemplateDraft>(emptyDraft);
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [categories, setCategories] = React.useState<TaskCategory[]>([]);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    api
      .taskCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open]);

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      if (seed) {
        setSelectedID(null);
        setDraft({
          name: "",
          description: seed.description,
          goal: seed.goal,
          remark: seed.remark,
          categoryID: seed.categoryID,
          interceptRules: seed.interceptRules,
          workerCount: seed.workerCount,
        });
      } else if (templates[0]) {
        setSelectedID(templates[0].id);
        setDraft(templateDraft(templates[0]));
      } else {
        setSelectedID(null);
        setDraft(emptyDraft());
      }
    }
    wasOpen.current = open;
  }, [open, seed, templates]);

  const selectTemplate = (template: TaskTemplate) => {
    setSelectedID(template.id);
    setDraft(templateDraft(template));
  };

  const startNew = () => {
    setSelectedID(null);
    setDraft(emptyDraft());
  };

  const updateDraft = (field: "name" | "description" | "goal" | "remark" | "workerCount", value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const patchDraft = (patch: Partial<TemplateDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  async function save() {
    const workerCount = parseWorkerCountInput(draft.workerCount);
    if (workerCount == null) {
      toast.error(t("invalidWorkerCount", { max: MAX_TASK_WORKER_COUNT }));
      return;
    }
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      goal: draft.goal.trim(),
      remark: draft.remark.trim(),
      category_id: draft.categoryID,
      worker_count: workerCount,
      intercept_rules: draft.interceptRules
        .map((r) => ({ ...r, pattern: r.pattern.trim() }))
        .filter((r) => r.pattern !== ""),
    };
    if (!input.name || !input.description || !input.goal) {
      toast.error(t("required"));
      return;
    }
    setSaving(true);
    try {
      if (selectedID == null) {
        const created = await api.createTaskTemplate(input);
        onCreated(created);
        setSelectedID(created.id);
        setDraft(templateDraft(created));
        toast.success(t("created"));
      } else {
        const updated = await api.updateTaskTemplate(selectedID, input);
        onUpdated(updated);
        setDraft(templateDraft(updated));
        toast.success(t("updated"));
      }
    } catch (error) {
      toast.error(t("saveFailed", { detail: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (selectedID == null) return;
    const deletedID = selectedID;
    setDeleting(true);
    try {
      await api.deleteTaskTemplate(deletedID);
      onDeleted(deletedID);
      const next = templates.find((template) => template.id !== deletedID);
      if (next) {
        setSelectedID(next.id);
        setDraft(templateDraft(next));
      } else {
        startNew();
      }
      setDeleteOpen(false);
      toast.success(t("deleted"));
    } catch (error) {
      toast.error(t("deleteFailed", { detail: (error as Error).message }));
    } finally {
      setDeleting(false);
    }
  }

  let saveLabel = saving ? t("saving") : t("saveChanges");
  if (!saving && selectedID == null) saveLabel = t("create");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="grid h-full w-full! max-w-none! grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[48rem]! sm:max-w-[48rem]!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{t("managerTitle")}</SheetTitle>
            <SheetDescription>{t("managerDescription")}</SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-hidden">
            <div className="flex min-h-0 flex-col border-b p-3 lg:border-r lg:border-b-0">
              <Button type="button" variant="outline" className="w-full" onClick={startNew}>
                <PlusIcon data-icon="inline-start" />
                {t("new")}
              </Button>
              <ScrollArea className="mt-2 max-h-44 lg:max-h-none lg:flex-1">
                <div className="flex flex-col gap-1 pr-2">
                  {templates.length === 0 && (
                    <p className="px-2 py-6 text-center text-muted-foreground text-sm">{t("empty")}</p>
                  )}
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={cn(
                        "min-w-0 rounded-md px-2.5 py-2 text-left transition-colors",
                        selectedID === template.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                      )}
                      onClick={() => selectTemplate(template)}
                    >
                      <span className="block truncate font-medium text-sm">{template.name}</span>
                      <span className="block truncate text-muted-foreground text-xs">{template.description}</span>
                      {template.remark ? (
                        <span className="block truncate text-muted-foreground/80 text-xs">{t("remarkPreview", { remark: template.remark })}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <ScrollArea className="min-h-0">
              <FieldGroup className="p-6">
                <Field>
                  <FieldLabel htmlFor="task-template-name">{t("name")}</FieldLabel>
                  <Input
                    id="task-template-name"
                    value={draft.name}
                    maxLength={120}
                    placeholder={t("namePlaceholder")}
                    onChange={(event) => updateDraft("name", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-template-description">{t("description")}</FieldLabel>
                  <Textarea
                    id="task-template-description"
                    className="min-h-28"
                    value={draft.description}
                    placeholder={t("descriptionPlaceholder")}
                    onChange={(event) => updateDraft("description", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-template-goal">{t("goal")}</FieldLabel>
                  <Textarea
                    id="task-template-goal"
                    className="min-h-28"
                    value={draft.goal}
                    placeholder={t("goalPlaceholder")}
                    onChange={(event) => updateDraft("goal", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-template-remark">{t("remark")}</FieldLabel>
                  <Textarea
                    id="task-template-remark"
                    className="min-h-20"
                    maxLength={MAX_TASK_REMARK_RUNES}
                    value={draft.remark}
                    placeholder={t("remarkPlaceholder")}
                    onChange={(event) => updateDraft("remark", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-template-worker-count">{t("workerCount")}</FieldLabel>
                  <Input
                    id="task-template-worker-count"
                    type="number"
                    min={0}
                    max={MAX_TASK_WORKER_COUNT}
                    className="w-40"
                    placeholder={t("workerPlaceholder")}
                    value={draft.workerCount}
                    onChange={(event) => updateDraft("workerCount", event.target.value)}
                  />
                  <FieldDescription>{t("workerDescription")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-template-category">{t("category")}</FieldLabel>
                  <NativeSelect
                    id="task-template-category"
                    className="w-full"
                    value={draft.categoryID == null ? "" : String(draft.categoryID)}
                    onChange={(event) =>
                      patchDraft({ categoryID: event.target.value === "" ? null : Number(event.target.value) })
                    }
                  >
                    <NativeSelectOption value="">{t("uncategorized")}</NativeSelectOption>
                    {categories.map((c) => (
                      <NativeSelectOption key={c.id} value={String(c.id)}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldDescription>{t("categoryDescription")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t("rules")}</FieldLabel>
                  <AssetInterceptRulesEditor
                    value={draft.interceptRules}
                    onChange={(rules) => patchDraft({ interceptRules: rules })}
                  />
                  <FieldDescription>
                    {t("rulesDescription")}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </ScrollArea>
          </div>
          <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:items-center">
            {selectedID != null && (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon data-icon="inline-start" />
                {t("deleteTemplate")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("close")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              {saveLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: draft.name || t("unnamed") })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deleting && <Spinner data-icon="inline-start" />}
              {deleting ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface TaskTemplateControlsProps {
  description: string;
  goal: string;
  remark?: string;
  categoryID?: number;
  interceptRules?: AssetInterceptRuleInput[];
  workerCount?: string;
  selectedTemplateID: number | null;
  onSelectedTemplateIDChange: (id: number | null) => void;
  onApply: (template: TaskTemplate) => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}

export function TaskTemplateControls({
  description,
  goal,
  remark = "",
  categoryID,
  interceptRules,
  workerCount = "",
  selectedTemplateID,
  onSelectedTemplateIDChange,
  onApply,
  portalContainer,
}: TaskTemplateControlsProps) {
  const t = useTranslations("taskTemplates");
  const [templates, setTemplates] = React.useState<TaskTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [templateInputValue, setTemplateInputValue] = React.useState("");
  const [pendingTemplate, setPendingTemplate] = React.useState<TaskTemplate | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [managerSeed, setManagerSeed] = React.useState<TemplateSeed | null>(null);

  const notifyLoadFailure = React.useEffectEvent((detail: string) => toast.error(t("loadFailed", { detail })));

  const loadTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await api.taskTemplates());
    } catch (error) {
      setTemplates([]);
      notifyLoadFailure((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selectedTemplate = React.useMemo(
    () => templates.find((template) => template.id === selectedTemplateID) ?? null,
    [selectedTemplateID, templates],
  );

  React.useEffect(() => {
    setTemplateInputValue(selectedTemplate?.name ?? "");
  }, [selectedTemplate]);

  const applyTemplate = (template: TaskTemplate) => {
    onApply(template);
    onSelectedTemplateIDChange(template.id);
    setPendingTemplate(null);
  };

  const chooseTemplate = (template: TaskTemplate | null) => {
    if (!template) {
      setTemplateInputValue("");
      onSelectedTemplateIDChange(null);
      return;
    }
    setTemplateInputValue(template.name);
    const currentWorkerCount = parseWorkerCountInput(workerCount);
    const templateWorkerCount = template.worker_count ?? 0;
    const hasContent =
      description.trim() !== "" ||
      goal.trim() !== "" ||
      remark.trim() !== "" ||
      (currentWorkerCount == null ? workerCount.trim() !== "" : currentWorkerCount !== 0);
    const changesContent =
      description !== template.description ||
      goal !== template.goal ||
      remark !== (template.remark ?? "") ||
      (currentWorkerCount == null ? workerCount.trim() !== "" : currentWorkerCount !== templateWorkerCount);
    if (hasContent && changesContent) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template);
  };

  const openManager = (seed: TemplateSeed | null) => {
    setManagerSeed(seed);
    setManagerOpen(true);
  };

  const upsertTemplate = (template: TaskTemplate) => {
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
  };

  const deleteTemplate = (id: number) => {
    setTemplates((current) => current.filter((template) => template.id !== id));
    if (selectedTemplateID === id) onSelectedTemplateIDChange(null);
  };

  let pickerPlaceholder = loading ? t("loading") : t("noTemplates");
  if (!loading && templates.length > 0) pickerPlaceholder = t("pickerPlaceholder");

  return (
    <>
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="task-template-picker">{t("label")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => openManager(null)}>
              <Settings2Icon data-icon="inline-start" />
              {t("manage")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!description.trim() || !goal.trim()}
              onClick={() =>
                openManager({
                  description,
                  goal,
                  remark,
                  categoryID: categoryID ?? null,
                  interceptRules: interceptRules ?? [],
                  workerCount,
                })
              }
            >
              <SaveIcon data-icon="inline-start" />
              {t("saveAs")}
            </Button>
          </div>
        </div>
        <Combobox
          items={templates}
          itemToStringLabel={(template) => template.name}
          itemToStringValue={(template) => String(template.id)}
          inputValue={templateInputValue}
          onInputValueChange={(value) => setTemplateInputValue(value)}
          value={selectedTemplate}
          onValueChange={chooseTemplate}
        >
          <ComboboxInput
            id="task-template-picker"
            className="w-full"
            placeholder={pickerPlaceholder}
            disabled={loading || templates.length === 0}
            showClear
          />
          <ComboboxContent portalContainer={portalContainer}>
            <ComboboxEmpty>{t("noMatches")}</ComboboxEmpty>
            <ComboboxList>
              {(template) => (
                <ComboboxItem key={template.id} value={template}>
                  <LibraryIcon />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{template.name}</p>
                    {template.description && (
                      <p className="truncate text-muted-foreground text-xs">{template.description}</p>
                    )}
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          {t("pickerDescription")}
        </FieldDescription>
      </Field>

      <AlertDialog
        open={pendingTemplate != null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingTemplate(null);
          setTemplateInputValue(selectedTemplate?.name ?? "");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("applyTitle", { name: pendingTemplate?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("overwriteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingTemplate && applyTemplate(pendingTemplate)}>
              {t("overwrite")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskTemplateManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        templates={templates}
        seed={managerSeed}
        onCreated={upsertTemplate}
        onUpdated={upsertTemplate}
        onDeleted={deleteTemplate}
      />
    </>
  );
}
