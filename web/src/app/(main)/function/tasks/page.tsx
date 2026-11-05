"use client";

import * as React from "react";

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  EyeIcon,
  FolderInputIcon,
  GlobeIcon,
  GlobeOffIcon,
  GripVerticalIcon,
  Loader2Icon,
  PaperclipIcon,
  PauseIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TablePropertiesIcon,
  StarIcon,
  TagsIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AssetInterceptRulesEditor } from "@/components/asset-intercept-rules-editor";
import { DateSelect } from "@/components/date-select";
import { RemarkEditor } from "@/components/remark-editor";
import { StatusBadge } from "@/components/status-badge";
import { TablePagination } from "@/components/table-pagination";
import { TaskLLMProfileChain } from "@/components/task-llm-profile-chain";
import { TaskTemplateControls } from "@/components/task-template-controls";
import { TimeSelect } from "@/components/time-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, ApiError, type ScheduleInput } from "@/lib/api";
import {
  getLocalStorageValue,
  setLocalStorageValue,
} from "@/lib/local-storage.client";
import {
  type SortDirection,
  useStoredSortPreference,
} from "@/lib/sort-preference";
import type {
  AssetInterceptRuleInput,
  ChatAttachment,
  Company,
  DeleteTaskOptions,
  DeleteTaskResult,
  LLMProfile,
  Task,
  TaskArchive,
  TaskArchiveState,
  TaskCategory,
  TaskStatus,
} from "@/lib/types";
import { MAX_TASK_REMARK_RUNES, MAX_TASK_WORKER_COUNT, parseWorkerCountInput } from "@/lib/types";
import { useLocaleFormatting } from "@/i18n/formatting";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

// fmtBytes renders a human file size for the upload manifest.
function fmtBytes(n: number): string {
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`;
  return `${n} B`;
}

// UPLOAD_MARKER labels the auto-appended block of uploaded-file paths inside the task
// description, so re-uploads append under the same block instead of adding a new header.
const UPLOAD_MARKER = "【上传文件（绝对路径）】";

// appendUploads folds newly-uploaded files' ABSOLUTE paths into the description as a
// Read/Bash-friendly manifest — the worker opens them by path. Keeps one marked block:
// first upload adds the header, later uploads append bullets under it.
function appendUploads(desc: string, atts: ChatAttachment[]): string {
  const bullets = atts
    .map((a) => `- ${a.abs ?? a.path}（${fmtBytes(a.size)}）`)
    .join("\n");
  if (desc.includes(UPLOAD_MARKER)) {
    return `${desc.replace(/\s*$/, "")}\n${bullets}\n`;
  }
  const head = desc.trim() ? `${desc.replace(/\s*$/, "")}\n\n` : "";
  return `${head}${UPLOAD_MARKER} worker 可用 Read/Bash 按路径打开：\n${bullets}\n`;
}

// POLL_MS is the task-list refresh interval. Task state moves on the server (planner /
// worker), so the list has to be pulled; 10s is plenty for status / 进度 / token 变化.
const POLL_MS = 10_000;
const MAX_SOURCE_TASKS = 8;

// fmtTokens renders a compact token count in the current UI locale.
function fmtTokens(n: number, format: ReturnType<typeof useLocaleFormatting>): string {
  return format.number(n, "compact");
}

// fmtDuration renders a run duration in seconds as a compact human string.
function fmtDuration(sec: number, format: ReturnType<typeof useLocaleFormatting>): string {
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${format.number(d, "count")}d ${format.number(h, "count")}h`;
  if (h > 0) return `${format.number(h, "count")}h ${format.number(m, "count")}m`;
  if (m > 0) return `${format.number(m, "count")}m ${format.number(s, "count")}s`;
  return `${format.number(s, "count")}s`;
}

// taskDuration counts only active execution segments. A live segment ticks locally;
// paused, queued, and terminal tasks stay fixed at their persisted active total.
function taskDuration(task: Task, nowSec: number): number {
  const active = Math.max(0, Math.floor(task.active_run_seconds ?? 0));
  const segmentStart = task.run_segment_started_unix ?? 0;
  if (
    task.status === "running" &&
    !task.paused &&
    !task.queued &&
    segmentStart > 0
  ) {
    return active + Math.max(0, Math.floor(nowSec - segmentStart));
  }
  return active;
}

// deleteDetails takes only the countable part of the result so callers can pass an
// aggregate accumulated over a bulk delete.
type DeleteCounts = Omit<DeleteTaskResult, "deleted" | "cleanup_warning">;

type TaskListTranslator = ReturnType<typeof useTranslations<"tasksList">>;

function deleteDetails(result: DeleteCounts, t: TaskListTranslator): string[] {
  const details: string[] = [];
  if (result.assets_deleted > 0) details.push(t("assetsDeleted", { count: result.assets_deleted }));
  if (result.assets_detached > 0) details.push(t("assetsDetached", { count: result.assets_detached }));
  if (result.traffic_deleted > 0) details.push(t("trafficDeleted", { count: result.traffic_deleted }));
  if (result.files_deleted) details.push(t("filesDeleted"));
  if (result.findings_deleted > 0) details.push(t("findingsDeleted", { count: result.findings_deleted }));
  if (result.llm_records_deleted > 0) details.push(t("llmRecordsDeleted", { count: result.llm_records_deleted }));
  return details;
}

function deleteSummary(result: DeleteTaskResult, t: TaskListTranslator): string {
  const details = deleteDetails(result, t);
  return details.length > 0 ? t("deletedWithDetails", { details: details.join(t("listSeparator")) }) : t("deleted");
}

// fmtDateTime renders a compact date-time in the provider's locale/timezone.
function fmtDateTime(unix: number | undefined, format: ReturnType<typeof useLocaleFormatting>): string {
  if (!unix || unix <= 0) return "—";
  return format.dateTime(new Date(unix * 1000), {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "created", label: "已创建" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "运行中" },
  { value: "paused", label: "已暂停" },
  { value: "done", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "timeout", label: "已超时" },
];

// Select 不接受空字符串 value,所以「无分类」在筛选器、新建表单和批量移动里
// 统一用这个哨兵值,提交时再翻译成后端的 null。
const UNCATEGORIZED_VALUE = "uncategorized";

// 可暂停 = 非终态且未暂停,与后端 applyTaskControlWithCause 的门控一致
// (done/failed/timeout 为终态);paused 才可继续。行内按钮与批量控制共用此判断,
// 两边不会出现一个可点、另一个不可点的分歧。
const PAUSABLE_STATUSES = new Set<TaskStatus>(["created", "queued", "running"]);
const ARCHIVABLE_STATUSES = new Set<TaskStatus>([
  "paused",
  "done",
  "failed",
  "timeout",
]);

function taskControlAction(status: TaskStatus): "pause" | "resume" | null {
  if (status === "paused") return "resume";
  if (PAUSABLE_STATUSES.has(status)) return "pause";
  return null;
}

type TaskSortField = "id" | "created" | "duration" | "status";

const TASK_SORT_FIELDS: readonly TaskSortField[] = [
  "id",
  "created",
  "duration",
  "status",
];
const TASK_SORT_PREFERENCE_KEY = "artex_task_list_sort";
const TASK_FILTER_PREFERENCE_KEY = "artex_task_list_filters";
const TASK_COLUMNS_PREFERENCE_KEY = "artex_task_list_columns";
type TaskColumnKey =
  | "id"
  | "name"
  | "remark"
  | "description"
  | "goal"
  | "status"
  | "progress"
  | "findings"
  | "inFlight"
  | "created"
  | "duration"
  | "tokens";
const TASK_COLUMNS: readonly { key: TaskColumnKey; label: string }[] = [
  ["id", "ID"],
  ["name", "name"],
  ["remark", "remark"],
  ["description", "description"],
  ["goal", "goal"],
  ["status", "status"],
  ["progress", "goalProgress"],
  ["findings", "findings"],
  ["inFlight", "workers"],
  ["created", "created"],
  ["duration", "duration"],
  ["tokens", "tokens"],
].map(([key, label]) => ({ key: key as TaskColumnKey, label }));
const DEFAULT_TASK_COLUMNS = Object.fromEntries(
  TASK_COLUMNS.map(({ key }) => [key, true]),
) as Record<TaskColumnKey, boolean>;

const TASK_STATUS_RANK = new Map(
  STATUS_OPTIONS.map((option, index) => [option.value, index]),
);

function taskIsPinned(task: Task): boolean {
  return task.pinned ?? Boolean(task.pinned_at);
}

function compareTaskIDs(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function taskCreatedUnix(task: Task): number {
  if (task.created_unix) return task.created_unix;
  const parsed = Date.parse(task.created_at);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function compareTasks(
  left: Task,
  right: Task,
  field: TaskSortField,
  direction: SortDirection,
  nowSec: number,
): number {
  const leftPinned = taskIsPinned(left);
  const rightPinned = taskIsPinned(right);
  if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
  if (leftPinned && left.pinned_at !== right.pinned_at) {
    return (right.pinned_at ?? "").localeCompare(left.pinned_at ?? "");
  }

  let compared = 0;
  switch (field) {
    case "created":
      compared = taskCreatedUnix(left) - taskCreatedUnix(right);
      break;
    case "duration":
      compared = taskDuration(left, nowSec) - taskDuration(right, nowSec);
      break;
    case "status":
      compared =
        (TASK_STATUS_RANK.get(left.status) ?? 0) -
        (TASK_STATUS_RANK.get(right.status) ?? 0);
      break;
    default:
      compared = compareTaskIDs(left.id, right.id);
  }
  if (compared !== 0) return direction === "asc" ? compared : -compared;
  return -compareTaskIDs(left.id, right.id);
}

export default function TasksPage() {
  const t = useTranslations("tasksList");
  const ts = useTranslations("status");
  const [activeTab, setActiveTab] = React.useState("current");
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [categories, setCategories] = React.useState<TaskCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<TaskStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [filtersHydrated, setFiltersHydrated] = React.useState(false);
  const [sortPreference, setSortPreference] = useStoredSortPreference(
    TASK_SORT_PREFERENCE_KEY,
    TASK_SORT_FIELDS,
    "id",
    "desc",
  );
  const { field: sortField, direction: sortDirection } = sortPreference;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [nowSec, setNowSec] = React.useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const [batchControlling, setBatchControlling] = React.useState<
    "pause" | "resume" | null
  >(null);
  const [movingCategory, setMovingCategory] = React.useState(false);
  const [visibleColumns, setVisibleColumns] =
    React.useState<Record<TaskColumnKey, boolean>>(DEFAULT_TASK_COLUMNS);
  React.useEffect(() => {
    const raw = getLocalStorageValue(TASK_COLUMNS_PREFERENCE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setVisibleColumns(
        (current) =>
          Object.fromEntries(
            TASK_COLUMNS.map(({ key }) => [
              key,
              typeof parsed[key] === "boolean" ? parsed[key] : current[key],
            ]),
          ) as Record<TaskColumnKey, boolean>,
      );
    } catch {
      // Ignore malformed saved preferences.
    }
  }, []);
  React.useEffect(() => {
    setLocalStorageValue(
      TASK_COLUMNS_PREFERENCE_KEY,
      JSON.stringify(visibleColumns),
    );
  }, [visibleColumns]);

  React.useEffect(() => {
    const raw = getLocalStorageValue(TASK_FILTER_PREFERENCE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          status?: unknown;
          category?: unknown;
        };
        if (
          parsed.status === "all" ||
          STATUS_OPTIONS.some((option) => option.value === parsed.status)
        ) {
          setStatusFilter(parsed.status as TaskStatus | "all");
        }
        if (
          typeof parsed.category === "string" &&
          (parsed.category === "all" ||
            parsed.category === UNCATEGORIZED_VALUE ||
            /^\d+$/.test(parsed.category))
        ) {
          setCategoryFilter(parsed.category);
        }
      } catch {
        // Ignore malformed or legacy preferences and retain the defaults.
      }
    }
    setFiltersHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!filtersHydrated) return;
    setLocalStorageValue(
      TASK_FILTER_PREFERENCE_KEY,
      JSON.stringify({ status: statusFilter, category: categoryFilter }),
    );
  }, [categoryFilter, filtersHydrated, statusFilter]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter === UNCATEGORIZED_VALUE && t.category_id != null)
        return false;
      if (
        categoryFilter !== "all" &&
        categoryFilter !== UNCATEGORIZED_VALUE &&
        String(t.category_id) !== categoryFilter
      )
        return false;
      if (!q) return true;
      return (
        (t.name ?? "").toLowerCase().includes(q) ||
        (t.category_name ?? "").toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.goal.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [tasks, query, statusFilter, categoryFilter]);

  const sortNowSec = sortField === "duration" ? nowSec : 0;
  const ordered = React.useMemo(() => {
    return [...filtered].sort((left, right) =>
      compareTasks(left, right, sortField, sortDirection, sortNowSec),
    );
  }, [filtered, sortDirection, sortField, sortNowSec]);

  const sortTasksBy = React.useCallback(
    (field: TaskSortField) => {
      setSortPreference((current) => {
        if (current.field !== field) return { field, direction: "desc" };
        return {
          field,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      });
    },
    [setSortPreference],
  );

  // reset to page 1 whenever filters or ordering change
  // biome-ignore lint/correctness/useExhaustiveDependencies: both filters intentionally reset pagination.
  React.useEffect(() => {
    setPage(1);
  }, [query, statusFilter, categoryFilter, sortField, sortDirection]);

  const paginated = React.useMemo(
    () => ordered.slice((page - 1) * pageSize, page * pageSize),
    [ordered, page, pageSize],
  );

  // 多选删除:选择跨翻页/筛选保留,只在任务真的消失(被删或后端不再返回)时收敛。
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(tasks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const toggleSelected = React.useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const pageIds = React.useMemo(() => paginated.map((t) => t.id), [paginated]);
  const pageSelectedCount = React.useMemo(
    () => pageIds.filter((id) => selectedIds.has(id)).length,
    [pageIds, selectedIds],
  );
  let headerChecked: boolean | "indeterminate" = false;
  if (pageIds.length > 0 && pageSelectedCount === pageIds.length) {
    headerChecked = true;
  } else if (pageSelectedCount > 0) {
    headerChecked = "indeterminate";
  }

  const toggleSelectedPage = React.useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [pageIds],
  );

  // lastRef holds the previous poll's serialized payload: the list is re-fetched every
  // POLL_MS but usually comes back unchanged, and setTasks on an identical payload would
  // re-render the whole page for nothing. Bail out when it matches.
  const lastRef = React.useRef<string>("");

  const load = React.useCallback(() => {
    api
      .tasks()
      .then((r) => {
        const next = r.tasks.map((t) =>
          t.id === r.active ? { ...t, active: true } : t,
        );
        const sig = JSON.stringify(next);
        if (sig === lastRef.current) return;
        lastRef.current = sig;
        setTasks(next);
      })
      .catch(() => {
        // Polling is best-effort; the next interval retries automatically.
      });
  }, []);

  const loadCategories = React.useCallback(() => {
    api
      .taskCategories()
      .then((next) => {
        setCategories(next);
        setCategoriesLoaded(true);
      })
      .catch(() => {
        // Category management remains retryable without blocking the task list.
      });
  }, []);

  React.useEffect(() => {
    load();
    loadCategories();
    const i = setInterval(load, POLL_MS);
    return () => clearInterval(i);
  }, [load, loadCategories]);

  const refreshCategoriesAndTasks = React.useCallback(() => {
    lastRef.current = "";
    loadCategories();
    load();
  }, [load, loadCategories]);

  const applyTaskCategoryMove = React.useCallback(
    (taskID: string, category: TaskCategory | null) => {
      setTasks((current) => {
        const next = current.map((task) =>
          task.id === taskID
            ? {
                ...task,
                category_id: category?.id,
                category_name: category?.name,
              }
            : task,
        );
        lastRef.current = JSON.stringify(next);
        return next;
      });
      loadCategories();
    },
    [loadCategories],
  );

  React.useEffect(() => {
    if (!categoriesLoaded) return;
    if (categoryFilter === "all" || categoryFilter === UNCATEGORIZED_VALUE)
      return;
    if (!categories.some((category) => String(category.id) === categoryFilter))
      setCategoryFilter("all");
  }, [categories, categoriesLoaded, categoryFilter]);

  // 只在确有 running 任务时才每秒 tick——其余情况「运行时长」是静态值,空转的 tick 会白白
  // 重渲染整张表。
  const hasRunning = React.useMemo(
    () => tasks.some((t) => t.status === "running"),
    [tasks],
  );

  // tick every second so running tasks' 运行时长 counts up live.
  React.useEffect(() => {
    if (!hasRunning) return;
    setNowSec(Math.floor(Date.now() / 1000));
    const i = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, [hasRunning]);

  const deleteTask = React.useCallback(
    async (id: string, options: DeleteTaskOptions) => {
      try {
        const result = await api.deleteTask(id, options);
        if (result.cleanup_warning) {
          toast.warning(t("cleanupWarning", { summary: deleteSummary(result, t), detail: result.cleanup_warning }));
        } else {
          toast.success(deleteSummary(result, t));
        }
        load();
      } catch (e) {
        toast.error(t("deleteFailed", { detail: (e as Error).message }));
        throw e;
      }
    },
    [load, t],
  );

  // controlTask 是行内暂停/继续:批量走 controlTasksBatch,单行走单任务接口,省去
  // 「先勾选再点批量」。清空 lastRef 让下一次轮询即使负载相同也照单接收,否则状态
  // 回写会被去重挡掉、按钮看起来没反应。
  const controlTask = React.useCallback(
    async (id: string, action: "pause" | "resume") => {
      try {
        const result = await api.controlTask(id, action);
        toast.success(
          action === "pause"
            ? t("paused", { id })
            : t(result.queued ? "resumedQueued" : "resumed", { id }),
        );
      } catch (e) {
        toast.error(t(action === "pause" ? "pauseFailed" : "resumeFailed", { detail: (e as Error).message }));
      } finally {
        // 无论成败都刷新:失败多半是状态已变化,重新拉取才能让按钮回到正确形态。
        lastRef.current = "";
        load();
      }
    },
    [load, t],
  );

  const updateTaskRemark = React.useCallback(
    async (task: Task, remark: string) => {
      const updated = await api.updateTask(task.id, { remark });
      setTasks((current) =>
        current.map((entry) =>
          entry.id === task.id ? { ...entry, remark: updated.remark } : entry,
        ),
      );
      lastRef.current = "";
      load();
    },
    [load],
  );

  const renameTask = React.useCallback(
    async (task: Task, name: string) => {
      try {
        await api.renameTask(task.id, name);
        toast.success(t("renamed", { id: task.id }));
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(t("renameFailed", { detail: (error as Error).message }));
        throw error;
      }
    },
    [load, t],
  );

  const toggleTaskPinned = React.useCallback(
    async (task: Task) => {
      const pinned = taskIsPinned(task);
      try {
        await api.pinTask(task.id, !pinned);
        toast.success(t(pinned ? "unpinned" : "pinned", { id: task.id }));
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(t(pinned ? "unpinFailed" : "pinFailed", { detail: (error as Error).message }));
        throw error;
      }
    },
    [load, t],
  );

  const toggleTaskGlobalAssets = React.useCallback(
    async (task: Task) => {
      const enabled = task.share_global_assets === true;
      try {
        const updated = await api.updateTask(task.id, {
          share_global_assets: !enabled,
        });
        setTasks((current) =>
          current.map((entry) =>
            entry.id === task.id
              ? { ...entry, share_global_assets: updated.share_global_assets }
              : entry,
          ),
        );
        toast.success(t("globalAssetsToggled", { id: task.id, enabled: enabled ? "no" : "yes" }));
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(t("globalAssetsFailed", { detail: (error as Error).message }));
      }
    },
    [load, t],
  );

  const queueTaskArchive = React.useCallback(
    async (task: Task) => {
      try {
        await api.archiveTask(task.id);
        toast.success(t("archiveQueued", { id: task.id }));
        setActiveTab("archived");
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(t("archiveFailed", { detail: (error as Error).message }));
        throw error;
      }
    },
    [load, t],
  );

  // deleteTasks 逐个删除所选任务:后端没有批量接口,且单次删除会连带清理资产/流量/文件,
  // 串行执行以免一次性打爆后端;成功的从选中集移除,失败的保留以便重试。
  const deleteTasks = React.useCallback(
    async (
      ids: string[],
      options: DeleteTaskOptions,
      onProgress: (done: number) => void,
    ) => {
      const total: DeleteCounts = {
        assets_deleted: 0,
        assets_detached: 0,
        traffic_deleted: 0,
        files_deleted: false,
        findings_deleted: 0,
        llm_records_deleted: 0,
      };
      const deleted: string[] = [];
      const failed: { id: string; message: string }[] = [];
      const warnings: string[] = [];

      for (const id of ids) {
        try {
          const r = await api.deleteTask(id, options);
          total.assets_deleted += r.assets_deleted;
          total.assets_detached += r.assets_detached;
          total.traffic_deleted += r.traffic_deleted;
          total.files_deleted = total.files_deleted || r.files_deleted;
          total.findings_deleted += r.findings_deleted;
          total.llm_records_deleted += r.llm_records_deleted;
          if (r.cleanup_warning) warnings.push(t("warningDetail", { id, detail: r.cleanup_warning }));
          deleted.push(id);
        } catch (e) {
          failed.push({ id, message: (e as Error).message });
        }
        onProgress(deleted.length + failed.length);
      }

      if (deleted.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
        const details = deleteDetails(total, t);
        const summary = details.length > 0
          ? t("bulkDeletedWithDetails", { count: deleted.length, details: details.join(t("listSeparator")) })
          : t("bulkDeleted", { count: deleted.length });
        if (warnings.length > 0) {
          toast.warning(t("cleanupWarning", { summary, detail: warnings.join(t("detailSeparator")) }));
        } else {
          toast.success(summary);
        }
      }
      if (failed.length > 0) {
        const head = failed
          .slice(0, 3)
          .map((f) => t("taskErrorDetail", { id: f.id, detail: f.message }))
          .join(t("detailSeparator"));
        toast.error(t("bulkDeleteFailed", { count: failed.length, details: head, more: failed.length > 3 ? "yes" : "no" }));
      }
      load();
    },
    [load, t],
  );

  const selectedTasks = React.useMemo(
    () => tasks.filter((task) => selectedIds.has(task.id)),
    [tasks, selectedIds],
  );
  const pausableTaskIDs = React.useMemo(
    () =>
      selectedTasks
        .filter((task) => taskControlAction(task.status) === "pause")
        .map((task) => task.id),
    [selectedTasks],
  );
  const resumableTaskIDs = React.useMemo(
    () =>
      selectedTasks
        .filter((task) => taskControlAction(task.status) === "resume")
        .map((task) => task.id),
    [selectedTasks],
  );
  const archivableTaskIDs = React.useMemo(
    () =>
      selectedTasks
        .filter((task) => ARCHIVABLE_STATUSES.has(task.status) && !task.queued)
        .map((task) => task.id),
    [selectedTasks],
  );

  const archiveSelectedTasks = React.useCallback(async () => {
    if (archivableTaskIDs.length === 0) return;
    const result = await api.archiveTasks(archivableTaskIDs);
    const succeeded = result.items.filter((item) => item.ok);
    const failed = result.items.filter((item) => !item.ok);
    if (succeeded.length > 0) toast.success(t("bulkArchiveQueued", { count: succeeded.length }));
    if (failed.length > 0) {
      toast.error(
        t("bulkArchiveFailed", {
          count: failed.length,
          details: failed.slice(0, 3)
            .map((item) => t("taskErrorDetail", { id: item.id, detail: item.error || t("stateChanged") }))
            .join(t("detailSeparator")),
        }),
      );
    }
    setSelectedIds(new Set());
    setActiveTab("archived");
    lastRef.current = "";
    load();
  }, [archivableTaskIDs, load, t]);

  const controlSelectedTasks = React.useCallback(
    async (action: "pause" | "resume", ids: string[]) => {
      if (ids.length === 0 || batchControlling) return;
      if (ids.length > 100) {
        toast.error(t("controlLimit"));
        return;
      }
      setBatchControlling(action);
      try {
        const result = await api.controlTasksBatch(ids, action);
        const succeeded = result.items.filter((item) => item.ok);
        const failed = result.items.filter((item) => !item.ok);
        if (succeeded.length > 0) {
          toast.success(
            action === "pause"
              ? t("bulkPaused", { count: succeeded.length })
              : t("bulkResumed", { count: succeeded.length, queued: succeeded.some((item) => item.queued) ? "yes" : "no" }),
          );
        }
        if (failed.length > 0) {
          const details = failed
            .slice(0, 3)
            .map((item) => t("taskErrorDetail", { id: item.id, detail: item.error || t("stateChanged") }))
            .join(t("detailSeparator"));
          toast.error(t("bulkControlFailed", { count: failed.length, details, more: failed.length > 3 ? "yes" : "no" }));
        }
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(t(action === "pause" ? "bulkPauseFailed" : "bulkResumeFailed", { detail: (error as Error).message }));
      } finally {
        setBatchControlling(null);
      }
    },
    [batchControlling, load, t],
  );

  // 后端把整批分类写入放在一个事务里，所以失败项只可能是勾选后又被删掉的任务。
  const moveSelectedTasksCategory = React.useCallback(
    async (categoryID?: number) => {
      const ids = [...selectedIds];
      if (ids.length === 0 || movingCategory) return;
      if (ids.length > 100) {
        toast.error(t("categoryMoveLimit"));
        return;
      }
      setMovingCategory(true);
      try {
        const result = await api.updateTasksCategory(ids, categoryID);
        const succeeded = result.items.filter((item) => item.ok);
        const failed = result.items.filter((item) => !item.ok);
        const target = result.category?.name ?? t("uncategorized");
        if (succeeded.length > 0) {
          toast.success(t("bulkMoved", { count: succeeded.length, name: target }));
          setSelectedIds(new Set());
        }
        if (failed.length > 0) {
          const details = failed
            .slice(0, 3)
            .map((item) => t("taskErrorDetail", { id: item.id, detail: item.error || t("taskMissing") }))
            .join(t("detailSeparator"));
          toast.error(t("bulkMoveFailed", { count: failed.length, details, more: failed.length > 3 ? "yes" : "no" }));
        }
        refreshCategoriesAndTasks();
      } catch (error) {
        toast.error(t("categoryMoveFailed", { detail: (error as Error).message }));
      } finally {
        setMovingCategory(false);
      }
    },
    [movingCategory, refreshCategoriesAndTasks, selectedIds, t],
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
      <TabsList className="mx-4 lg:mx-6">
        <TabsTrigger value="current">{t("current")}</TabsTrigger>
        <TabsTrigger value="archived">{t("archived")}</TabsTrigger>
      </TabsList>
      <TabsContent value="current">
        <Card>
          <CardContent className="flex flex-col gap-4 px-0 pt-6">
            <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
              <div className="relative w-full sm:max-w-xs">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder={t("search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("clearSearch")}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as TaskStatus | "all")}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={t("status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t("allStatuses")}</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {statusMeta("task", s.value, (key) => ts.has(key) ? ts(key) : undefined).label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t("allCategories")}</SelectItem>
                    <SelectItem value={UNCATEGORIZED_VALUE}>{t("uncategorized")}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs tabular-nums">
                {t("filteredCount", { count: filtered.length, total: tasks.length })}
              </span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs tabular-nums">{t("selectedCount", { count: selectedIds.size })}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    {t("clearSelection")}
                  </Button>
                  {pausableTaskIDs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={batchControlling !== null}
                      onClick={() =>
                        void controlSelectedTasks("pause", pausableTaskIDs)
                      }
                    >
                      {batchControlling === "pause" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <PauseIcon data-icon="inline-start" />
                      )}
                      {t("pauseCount", { count: pausableTaskIDs.length })}
                    </Button>
                  )}
                  {resumableTaskIDs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={batchControlling !== null}
                      onClick={() =>
                        void controlSelectedTasks("resume", resumableTaskIDs)
                      }
                    >
                      {batchControlling === "resume" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <PlayIcon data-icon="inline-start" />
                      )}
                      {t("resumeCount", { count: resumableTaskIDs.length })}
                    </Button>
                  )}
                  {archivableTaskIDs.length > 0 && (
                    <ArchiveConfirmDialog
                      count={archivableTaskIDs.length}
                      onConfirm={archiveSelectedTasks}
                      trigger={
                        <Button size="sm" variant="outline">
                          <ArchiveIcon data-icon="inline-start" />
                          {t("archiveCount", { count: archivableTaskIDs.length })}
                        </Button>
                      }
                    />
                  )}
                  <MoveTasksCategoryDialog
                    categories={categories}
                    count={selectedIds.size}
                    moving={movingCategory}
                    onMove={moveSelectedTasksCategory}
                  />
                  <BulkDeleteTasksDialog
                    ids={[...selectedIds]}
                    onDelete={deleteTasks}
                  />
                </>
              )}
              <TaskColumnsSettingsDialog
                visibleColumns={visibleColumns}
                onChange={setVisibleColumns}
              />
              <ConcurrencySettingsDialog />
              <CategoryManagementSheet
                categories={categories}
                tasks={tasks}
                onChanged={refreshCategoriesAndTasks}
                onTaskMoved={applyTaskCategoryMove}
              />
              <CreateTaskSheet
                tasks={tasks}
                categories={categories}
                onCreated={refreshCategoriesAndTasks}
                onCategoriesChanged={refreshCategoriesAndTasks}
              />
            </div>

            {tasks.length === 0 ? (
              <div className="text-muted-foreground mx-4 flex items-center justify-center rounded-lg border border-dashed py-20 text-sm lg:mx-6">
                {t("empty")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-muted-foreground mx-4 flex items-center justify-center rounded-lg border border-dashed py-20 text-sm lg:mx-6">
                {t("noMatch")}
              </div>
            ) : (
              <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                <TableHeader className="[&_tr]:border-t">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={headerChecked}
                        onCheckedChange={(checked) => toggleSelectedPage(checked === true)}
                        aria-label={t("selectPage")}
                      />
                    </TableHead>
                    <SortableTaskHead
                      field="id"
                      label="ID"
                      activeField={sortField}
                      direction={sortDirection}
                      className="font-mono"
                      hidden={!visibleColumns.id}
                      onSort={sortTasksBy}
                    />
                    <TableHead className={cn(!visibleColumns.name && "hidden")}>{t("name")}</TableHead>
                    <TableHead className={cn("w-px", !visibleColumns.remark && "hidden")}>{t("remark")}</TableHead>
                    <TableHead className={cn(!visibleColumns.description && "hidden")}>{t("description")}</TableHead>
                    <TableHead className={cn(!visibleColumns.goal && "hidden")}>{t("goal")}</TableHead>
                    <SortableTaskHead
                      field="status"
                      label={t("status")}
                      hidden={!visibleColumns.status}
                      activeField={sortField}
                      direction={sortDirection}
                      onSort={sortTasksBy}
                    />
                    <TableHead className={cn("text-center", !visibleColumns.progress && "hidden")}>{t("goalProgress")}</TableHead>
                    <TableHead className="text-center" title={t("severityTitle")}>
                      {t("findings")} <span className="text-muted-foreground font-normal">{t("severityShort")}</span>
                    </TableHead>
                    <TableHead className={cn("text-center", !visibleColumns.inFlight && "hidden")}>{t("workers")}</TableHead>
                    <SortableTaskHead
                      field="created"
                      label={t("created")}
                      hidden={!visibleColumns.created}
                      activeField={sortField}
                      direction={sortDirection}
                      align="right"
                      onSort={sortTasksBy}
                    />
                    <SortableTaskHead
                      field="duration"
                      label={t("duration")}
                      hidden={!visibleColumns.duration}
                      activeField={sortField}
                      direction={sortDirection}
                      align="right"
                      onSort={sortTasksBy}
                    />
                    <TableHead className={cn("text-right", !visibleColumns.tokens && "hidden")}>{t("tokens")}</TableHead>
                    <TableHead className="sticky right-0 z-10 bg-card text-right shadow-[-1px_0_0_0_hsl(var(--border))]">
                      {t("actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      // running 任务才吃 nowSec;其余行传 0 —— props 不变,memo 就能拦下每秒 tick
                      // 带来的整表重渲染,只让在跑的那几行走时长。
                      nowSec={task.status === "running" ? nowSec : 0}
                      onDelete={deleteTask}
                      onControl={controlTask}
                      onRename={renameTask}
                      onRemark={updateTaskRemark}
                      onTogglePinned={toggleTaskPinned}
                      onToggleGlobalAssets={toggleTaskGlobalAssets}
                      onArchive={queueTaskArchive}
                      selected={selectedIds.has(task.id)}
                      onSelectedChange={toggleSelected}
                      visibleColumns={visibleColumns}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="archived">
        <TaskArchivesPanel onChanged={load} />
      </TabsContent>
    </Tabs>
  );
}

function taskSortIcon(active: boolean, direction: SortDirection) {
  if (!active) {
    return (
      <ArrowUpDownIcon className="size-3.5 opacity-40 transition-opacity group-hover/sort:opacity-100" />
    );
  }
  if (direction === "asc") return <ArrowUpIcon className="size-3.5" />;
  return <ArrowDownIcon className="size-3.5" />;
}

function SortableTaskHead({
  field,
  label,
  activeField,
  direction,
  align = "left",
  className,
  hidden = false,
  onSort,
}: {
  field: TaskSortField;
  label: string;
  activeField: TaskSortField;
  direction: SortDirection;
  align?: "left" | "right";
  className?: string;
  hidden?: boolean;
  onSort: (field: TaskSortField) => void;
}) {
  const t = useTranslations("tasksList");
  const active = activeField === field;
  let ariaSort: React.AriaAttributes["aria-sort"] = "none";
  if (active) ariaSort = direction === "asc" ? "ascending" : "descending";

  let actionLabel = t("sortDescending", { label });
  if (active) actionLabel = t(direction === "asc" ? "sortAscendingActive" : "sortDescendingActive", { label });

  return (
    <TableHead
      className={cn(className, hidden && "hidden")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={cn(
          "group/sort inline-flex h-full w-full items-center gap-1 outline-none focus-visible:underline",
          align === "right" && "justify-end",
        )}
        aria-label={actionLabel}
        onClick={() => onSort(field)}
      >
        <span>{label}</span>
        {taskSortIcon(active, direction)}
      </button>
    </TableHead>
  );
}

function TaskColumnsSettingsDialog({
  visibleColumns,
  onChange,
}: {
  visibleColumns: Record<TaskColumnKey, boolean>;
  onChange: React.Dispatch<
    React.SetStateAction<Record<TaskColumnKey, boolean>>
  >;
}) {
  const t = useTranslations("tasksList");
  const [open, setOpen] = React.useState(false);
  const visibleCount = TASK_COLUMNS.filter(
    ({ key }) => visibleColumns[key],
  ).length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={t("columnsTitle")}>
          <TablePropertiesIcon /> {t("columns")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("columnsTitle")}</DialogTitle>
          <DialogDescription>
            {t("columnsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {TASK_COLUMNS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`task-column-${key}`}
                checked={visibleColumns[key]}
                disabled={visibleColumns[key] && visibleCount === 1}
                onCheckedChange={(checked) =>
                  onChange((current) => ({
                    ...current,
                    [key]: checked === true,
                  }))
                }
              />
              <label htmlFor={`task-column-${key}`}>{key === "id" ? "ID" : t(label)}</label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onChange(DEFAULT_TASK_COLUMNS)}
          >
            {t("restoreDefaults")}
          </Button>
          <DialogClose asChild>
            <Button>{t("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConcurrencySettingsDialog() {
  const t = useTranslations("tasksList");
  const [open, setOpen] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [limit, setLimit] = React.useState("5");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .settings()
      .then((settings) => {
        setEnabled(!!settings.task_concurrency_enabled);
        setLimit(String(settings.task_concurrency_limit ?? 5));
      })
      .catch(() => {
        // Keep the dialog usable with defaults; reopening retries the request.
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function save() {
    const nextLimit = Math.max(1, Math.floor(Number(limit) || 5));
    setSaving(true);
    try {
      await api.setSettings({ task_concurrency_enabled: enabled, task_concurrency_limit: nextLimit });
      toast.success(enabled ? t("concurrencyEnabled", { count: nextLimit }) : t("concurrencyDisabled"));
      setOpen(false);
    } catch (error) {
      toast.error(t("saveFailed", { detail: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="ml-auto" aria-label={t("concurrencySettings")}>
          <SlidersHorizontalIcon /> {t("concurrency")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("concurrencyTitle")}</DialogTitle>
          <DialogDescription>
            {t("concurrencyDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="task-concurrency-enabled">{t("concurrencyEnable")}</Label>
              <span className="text-muted-foreground text-xs">{t("concurrencyDefault")}</span>
            </div>
            <Switch
              id="task-concurrency-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={loading}
            />
          </div>
          {enabled && (
            <div className="grid gap-2">
              <Label htmlFor="task-concurrency-limit">{t("concurrencyLimit")}</Label>
              <Input
                id="task-concurrency-limit"
                type="number"
                min={1}
                className="w-32"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                disabled={loading}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button onClick={save} disabled={loading || saving}>
            {saving && <Loader2Icon className="animate-spin" />} {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// TaskRow renders one row of the task table. Memoized so the per-second 运行时长 tick and
// the POLL_MS list refresh only re-render the rows whose data actually moved — a table page
// is 20 rows × (StatusBadge + Link + a Radix AlertDialog tree), far too heavy to rebuild
// wholesale on every parent render.
const TaskRow = React.memo(function TaskRow({
  task,
  nowSec,
  onDelete,
  onControl,
  onRename,
  onRemark,
  onTogglePinned,
  onToggleGlobalAssets,
  onArchive,
  selected,
  onSelectedChange,
  visibleColumns,
}: {
  task: Task;
  nowSec: number;
  onDelete: (id: string, options: DeleteTaskOptions) => Promise<void>;
  onControl: (id: string, action: "pause" | "resume") => Promise<void>;
  onRename: (task: Task, name: string) => Promise<void>;
  onRemark: (task: Task, remark: string) => Promise<void>;
  onTogglePinned: (task: Task) => Promise<void>;
  onToggleGlobalAssets: (task: Task) => Promise<void>;
  onArchive: (task: Task) => Promise<void>;
  selected: boolean;
  onSelectedChange: (id: string, checked: boolean) => void;
  visibleColumns: Record<TaskColumnKey, boolean>;
}) {
  const t = useTranslations("tasksList");
  const format = useLocaleFormatting();
  return (
    <TableRow
      className="group border-border/60"
      data-state={selected ? "selected" : undefined}
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(task.id, checked === true)}
          aria-label={t("selectTask", { id: task.id })}
        />
      </TableCell>
      <TableCell className={cn(!visibleColumns.id && "hidden")}>
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
          {task.id}
        </code>
      </TableCell>
      <TableCell
        className={cn("font-medium", !visibleColumns.name && "hidden")}
      >
        <div className="flex max-w-xs items-center gap-2">
          <TaskNameEditor task={task} onRename={onRename} />
          {task.active && <StarIcon className="size-4 shrink-0 fill-amber-400 text-amber-400" />}
          {taskIsPinned(task) && <PinIcon className="text-primary size-4 shrink-0" aria-label={t("pinnedLabel")} />}
        </div>
      </TableCell>
      <TableCell className={cn(!visibleColumns.remark && "hidden")}>
        <RemarkEditor value={task.remark} label={t("task", { id: task.id })} onSave={(remark) => onRemark(task, remark)} />
      </TableCell>
      <TableCell
        className={cn(
          "text-muted-foreground max-w-40",
          !visibleColumns.description && "hidden",
        )}
      >
        <Link
          href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`}
          className="block truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={task.description}
        >
          {task.description}
        </Link>
      </TableCell>
      <TableCell
        className="text-muted-foreground max-w-40 truncate"
        title={task.goal}
      >
        {task.goal}
      </TableCell>
      <TableCell className={cn(!visibleColumns.status && "hidden")}>
        <StatusBadge domain="task" value={task.status} dot />
      </TableCell>
      <TableCell
        className={cn(
          "text-muted-foreground text-center text-xs tabular-nums",
          !visibleColumns.progress && "hidden",
        )}
      >
        {typeof task.goals_total === "number" && task.goals_total > 0 ? (
          `${format.number(task.goals_met ?? 0, "count")}/${format.number(task.goals_total, "count")}`
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-center text-xs tabular-nums",
          !visibleColumns.findings && "hidden",
        )}
      >
        {(() => {
          // Keep report severity counts visible while a merged folder awaits its own assessment.
          const f = task.findings ?? task.distinct_findings;
          const total = f ? f.critical + f.high + f.medium + f.low : 0;
          if (!f || (total === 0 && !task.distinct_findings?.total))
            return <span className="text-muted-foreground">0</span>;
          const seg = (n: number, cls: string) => <span className={n > 0 ? cls : "text-muted-foreground"}>{format.number(n, "count")}</span>;
          return (
            <span
              className="font-medium whitespace-nowrap"
              title={t("findingCountsTitle", {
                kind: task.findings ? "reports" : "findings",
                reports: task.distinct_findings?.reports ?? total,
                unassessed: task.distinct_findings?.unassessed ?? 0,
              })}
            >
              {seg(f.critical, "text-rose-600 dark:text-rose-400")}
              <span className="text-muted-foreground">/</span>
              {seg(f.high, "text-red-600 dark:text-red-400")}
              <span className="text-muted-foreground">/</span>
              {seg(f.medium, "text-amber-600 dark:text-amber-400")}
              <span className="text-muted-foreground">/</span>
              {seg(f.low, "text-slate-600 dark:text-slate-400")}
              {task.distinct_findings ? (
                <span className="ml-1 text-muted-foreground">
                  · {t("findingCounts", { findings: task.distinct_findings.total, reports: task.distinct_findings.reports })}
                  {task.distinct_findings.unassessed > 0 ? ` · ${t("unassessed", { count: task.distinct_findings.unassessed })}` : ""}
                </span>
              ) : null}
            </span>
          );
        })()}
      </TableCell>
      <TableCell
        className={cn(
          "text-center text-xs tabular-nums",
          !visibleColumns.inFlight && "hidden",
        )}
      >
        {task.in_flight && task.in_flight > 0 ? (
          <span className="text-foreground font-medium">{format.number(task.in_flight, "count")}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className={cn("text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums", !visibleColumns.created && "hidden")}>
        {fmtDateTime(task.created_unix, format)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-xs whitespace-nowrap tabular-nums",
          !visibleColumns.duration && "hidden",
        )}
      >
        {(() => {
          const secs = taskDuration(task, nowSec);
          if (secs <= 0)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span className={task.status === "running" ? "text-foreground" : "text-muted-foreground"}>
              {fmtDuration(secs, format)}
            </span>
          );
        })()}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-xs whitespace-nowrap tabular-nums",
          !visibleColumns.tokens && "hidden",
        )}
        title={
          task.tokens
            ? t("tokenDetails", { input: task.tokens.input_tokens, cache: task.tokens.cache_read_tokens, output: task.tokens.output_tokens })
            : undefined
        }
      >
        {task.tokens ? (
          <span className="text-muted-foreground">
            {t("tokenInput")} <span className="text-foreground">{fmtTokens(task.tokens.input_tokens, format)}</span>
            {" · "}{t("tokenCache")}{" "}
            <span className="text-foreground">{fmtTokens(task.tokens.cache_read_tokens, format)}</span>
            {" · "}{t("tokenOutput")}{" "}
            <span className="text-foreground">{fmtTokens(task.tokens.output_tokens, format)}</span>
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="sticky right-0 z-10 bg-card text-right shadow-[-1px_0_0_0_hsl(var(--border))] group-hover:bg-muted/50">
        <div className="flex items-center justify-end gap-0.5">
          <TaskGlobalAssetsAction task={task} onToggle={onToggleGlobalAssets} />
          <TaskActionTooltip
            label={t("viewDetails")}
            description={t("viewDetailsDescription")}
          >
            <Button
              size="icon"
              variant="ghost"
              asChild
              aria-label={t("viewDetails")}
            >
              <Link
                href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`}
              >
                <EyeIcon />
              </Link>
            </Button>
          </TaskActionTooltip>
          <TaskControlButton task={task} onControl={onControl} />
          <TaskPinAction task={task} onTogglePinned={onTogglePinned} />
          <TaskArchiveAction task={task} onArchive={onArchive} />
          <DeleteTaskDialog task={task} onDelete={onDelete} />
        </div>
      </TableCell>
    </TableRow>
  );
});

function TaskActionTooltip({
  label,
  description,
  children,
  disabled = false,
}: {
  label: string;
  description: string;
  children: React.ReactElement;
  disabled?: boolean;
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        {disabled ? (
          <span className="inline-flex" aria-label={label}>
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="block max-w-64 space-y-1 text-left leading-relaxed"
      >
        <p className="font-medium">{label}</p>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function TaskNameEditor({
  task,
  onRename,
}: {
  task: Task;
  onRename: (task: Task, name: string) => Promise<void>;
}) {
  const t = useTranslations("tasksList");
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(task.name ?? "");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cancelOnBlurRef = React.useRef(false);

  React.useEffect(() => {
    if (!editing) setName(task.name ?? "");
  }, [editing, task.name]);

  async function finishEditing() {
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      setName(task.name ?? "");
      setEditing(false);
      return;
    }

    const next = name.trim();
    if (!next || next === task.name?.trim()) {
      setName(task.name ?? "");
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onRename(task, next);
      setEditing(false);
    } catch {
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Input
          ref={inputRef}
          value={name}
          maxLength={200}
          autoFocus
          disabled={saving}
          aria-label={t("taskName", { id: task.id })}
          className="h-7 min-w-28 max-w-48 px-2 font-medium"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void finishEditing()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelOnBlurRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        {saving && <Spinner className="shrink-0" />}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`}
        className="min-w-0 truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={task.name?.trim() ? task.name : task.description}
      >
        {task.name?.trim() ? task.name : <span className="text-muted-foreground">{t("unnamed")}</span>}
      </Link>
      <TaskActionTooltip
        label={t("renameTitle")}
        description={t("renameDescription")}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          aria-label={t("renameTask", { id: task.id })}
          onClick={() => {
            setName(task.name ?? "");
            setEditing(true);
          }}
        >
          <PencilIcon />
        </Button>
      </TaskActionTooltip>
    </div>
  );
}

function taskPinIcon(pinning: boolean, pinned: boolean) {
  if (pinning) return <Spinner />;
  if (pinned) return <PinOffIcon />;
  return <PinIcon />;
}

function TaskPinAction({ task, onTogglePinned }: { task: Task; onTogglePinned: (task: Task) => Promise<void> }) {
  const t = useTranslations("tasksList");
  const [pinning, setPinning] = React.useState(false);
  const pinned = taskIsPinned(task);

  return (
    <TaskActionTooltip
      label={pinned ? t("unpin") : t("pinTitle")}
      description={pinned ? t("unpinDescription") : t("pinDescription")}
      disabled={pinning}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pinning}
        aria-label={t(pinned ? "unpinTask" : "pinTask", { id: task.id })}
        onClick={async () => {
          setPinning(true);
          try {
            await onTogglePinned(task);
          } finally {
            setPinning(false);
          }
        }}
      >
        {taskPinIcon(pinning, pinned)}
      </Button>
    </TaskActionTooltip>
  );
}

function taskGlobalAssetsIcon(saving: boolean, enabled: boolean) {
  if (saving) return <Loader2Icon className="animate-spin" />;
  if (enabled) return <GlobeIcon />;
  return <GlobeOffIcon />;
}

function TaskGlobalAssetsAction({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (task: Task) => Promise<void>;
}) {
  const t = useTranslations("tasksList");
  const [saving, setSaving] = React.useState(false);
  const enabled = task.share_global_assets === true;
  const state = enabled ? "yes" : "no";
  const label = t("globalAssetsLabel", { enabled: state });
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-pressed={enabled}
          aria-busy={saving}
          className={enabled ? "text-foreground" : "text-muted-foreground"}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onToggle(task);
            } finally {
              setSaving(false);
            }
          }}
        >
          {taskGlobalAssetsIcon(saving, enabled)}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="block max-w-64 space-y-1 text-left leading-relaxed"
      >
        <p className="font-medium">{t("globalAssetsTitle", { enabled: state })}</p>
        <p>{t("globalAssetsDescription")}</p>
        <p className="opacity-75">{t("globalAssetsHint", { enabled: state })}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// 三态图标分开写而非嵌套三元:仓库 Biome 基线禁 noNestedTernary。
function taskControlIcon(pending: boolean, action: "pause" | "resume" | null) {
  if (pending) return <Loader2Icon className="animate-spin" />;
  if (action === "resume") return <PlayIcon />;
  return <PauseIcon />;
}

// TaskControlButton 是行内的暂停/继续开关。终态任务渲染为 disabled 而不是隐藏,
// 这样各行操作列宽度一致,按钮位置不会随状态跳动。
function TaskControlButton({
  task,
  onControl,
}: {
  task: Task;
  onControl: (id: string, action: "pause" | "resume") => Promise<void>;
}) {
  const t = useTranslations("tasksList");
  const [pending, setPending] = React.useState(false);
  const action = taskControlAction(task.status);
  const label = action === "resume" ? t("resumeTask") : t("pauseTask");
  let description = t("pauseDescription");
  if (action === "resume") description = t("resumeDescription");
  if (!action) description = t("controlUnavailable");
  return (
    <TaskActionTooltip
      label={label}
      description={description}
      disabled={!action || pending}
    >
      <Button
        size="icon"
        variant="ghost"
        aria-label={label}
        disabled={!action || pending}
        onClick={async () => {
          if (!action) return;
          setPending(true);
          try {
            await onControl(task.id, action);
          } finally {
            setPending(false);
          }
        }}
      >
        {taskControlIcon(pending, action)}
      </Button>
    </TaskActionTooltip>
  );
}

type ArchiveTranslator = ReturnType<typeof useTranslations<"taskArchives">>;
type ArchiveNumberFormatter = ReturnType<typeof useLocaleFormatting>["number"];

function archiveBlockReason(task: Task, t: ArchiveTranslator): string {
  if (task.queued) return t("blockQueued");
  if (!ARCHIVABLE_STATUSES.has(task.status)) return t("blockActive");
  if (task.archive_blocked_by_task_id) {
    return t("blockDependency", { id: task.archive_blocked_by_task_id });
  }
  return "";
}

function ArchiveConfirmDialog({
  count,
  trigger,
  onConfirm,
}: {
  count: number;
  trigger: React.ReactNode;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("taskArchives");
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{count === 1 ? t("archiveTitle") : t("archiveManyTitle", { count })}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {t("archiveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } catch {
                // The caller reports the failure; keep the confirmation open for retry.
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {t("archiveConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TaskArchiveAction({ task, onArchive }: { task: Task; onArchive: (task: Task) => Promise<void> }) {
  const t = useTranslations("taskArchives");
  const reason = archiveBlockReason(task, t);
  const trigger = (
    <Button size="icon" variant="ghost" disabled={Boolean(reason)} aria-label={t("archiveTask", { id: task.id })}>
      <ArchiveIcon />
    </Button>
  );
  if (reason) {
    return (
      <TaskActionTooltip label={t("archiveUnavailable")} description={reason} disabled>
        {trigger}
      </TaskActionTooltip>
    );
  }
  return (
    <Tooltip delayDuration={200}>
      <ArchiveConfirmDialog
        count={1}
        trigger={<TooltipTrigger asChild>{trigger}</TooltipTrigger>}
        onConfirm={() => onArchive(task)}
      />
      <TooltipContent
        side="top"
        sideOffset={6}
        className="block max-w-64 space-y-1 text-left leading-relaxed"
      >
        <p className="font-medium">{t("archiveTitle")}</p>
        <p>{t("archiveTooltip")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const ARCHIVE_PROCESSING_STATES = new Set<TaskArchiveState>([
  "archive_queued",
  "archiving",
  "restore_queued",
  "restoring",
  "delete_queued",
  "deleting",
]);

const ARCHIVE_FAILED_STATES = new Set<TaskArchiveState>([
  "archive_failed",
  "restore_failed",
  "delete_failed",
]);

function archiveStateLabel(state: TaskArchiveState, t: ArchiveTranslator): string {
  const labels: Record<TaskArchiveState, string> = {
    archive_queued: "等待归档",
    archiving: "归档中",
    archive_failed: "归档失败",
    ready: "可还原",
    restore_queued: "等待还原",
    restoring: "还原中",
    restore_failed: "还原失败",
    delete_queued: "等待删除",
    deleting: "删除中",
    delete_failed: "删除失败",
  };
  if (!Object.hasOwn(labels, state)) return state;
  const key = `states.${state}`;
  return t.has(key) ? t(key) : labels[state];
}

function ArchiveStateBadge({ state }: { state: TaskArchiveState }) {
  const t = useTranslations("taskArchives");
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (state === "ready") variant = "secondary";
  if (ARCHIVE_PROCESSING_STATES.has(state)) variant = "default";
  if (ARCHIVE_FAILED_STATES.has(state)) variant = "destructive";
  return <Badge variant={variant}>{archiveStateLabel(state, t)}</Badge>;
}

function formatArchiveBytes(bytes: number, number: ArchiveNumberFormatter): string {
  if (bytes <= 0) return "—";
  const options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  if (bytes >= 1024 ** 3) return `${number(bytes / 1024 ** 3, options)} GB`;
  if (bytes >= 1024 ** 2) return `${number(bytes / 1024 ** 2, options)} MB`;
  if (bytes >= 1024) return `${number(bytes / 1024, options)} KB`;
  return `${number(bytes, "count")} B`;
}

function archiveCompressionLabel(archive: TaskArchive, t: ArchiveTranslator, number: ArchiveNumberFormatter): string {
  if (archive.original_size <= 0 || archive.compressed_size <= 0) return "—";
  const saved = Math.max(0, 100 - (archive.compressed_size / archive.original_size) * 100);
  return t("compression", {
    size: formatArchiveBytes(archive.compressed_size, number),
    saved: number(saved, "count"),
  });
}

function archiveDataTotal(archive: TaskArchive): number {
  return Object.values(archive.data_counts).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
}

function archiveDate(value: string | undefined, dateTime: ReturnType<typeof useLocaleFormatting>["dateTime"]): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTime(date, "timestamp");
}

function ArchiveDeleteDialog({
  archives,
  onConfirm,
  trigger,
}: {
  archives: TaskArchive[];
  onConfirm: () => Promise<void>;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("taskArchives");
  const { number } = useLocaleFormatting();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const rows = archives.reduce(
    (sum, archive) => sum + archiveDataTotal(archive),
    0,
  );
  const bytes = archives.reduce(
    (sum, archive) => sum + archive.compressed_size,
    0,
  );
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { count: archives.length })}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {t("deleteDescription", { size: formatArchiveBytes(bytes, number), count: rows })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } catch {
                // The caller reports the failure; keep the confirmation open for retry.
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {t("deletePermanently")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TaskArchivesPanel({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("taskArchives");
  const { number, dateTime } = useLocaleFormatting();
  const loadTranslation = React.useRef(t);
  React.useEffect(() => {
    loadTranslation.current = t;
  }, [t]);
  const [archives, setArchives] = React.useState<TaskArchive[]>([]);
  const [query, setQuery] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const [loading, setLoading] = React.useState(true);
  const pendingRestoreIDs = React.useRef(new Set<number>());

  const load = React.useCallback(async () => {
    try {
      const result = await api.taskArchives({
        page,
        size: pageSize,
        q: query.trim(),
        state: stateFilter === "all" ? undefined : stateFilter,
      });
      setArchives(result.items);
      setTotal(result.total);
      setSelected((current) => {
        const visible = new Set(result.items.map((archive) => archive.id));
        return new Set([...current].filter((id) => visible.has(id)));
      });
      const pending = [...pendingRestoreIDs.current];
      if (pending.length > 0) {
        const states = await Promise.allSettled(
          pending.map((id) => api.taskArchive(id)),
        );
        let restored = false;
        states.forEach((state, index) => {
          if (state.status !== "rejected" || !(state.reason instanceof Error))
            return;
          const raw = state.reason instanceof ApiError ? state.reason.raw : state.reason.message;
          if (!raw.includes("归档不存在")) return;
          pendingRestoreIDs.current.delete(pending[index]);
          restored = true;
        });
        if (restored) onChanged();
      }
    } catch (error) {
      toast.error(loadTranslation.current("loadFailed", { detail: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [onChanged, page, pageSize, query, stateFilter]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2_000);
    return () => clearInterval(timer);
  }, [load]);

  const selectable = React.useMemo(
    () =>
      archives.filter(
        (archive) => !ARCHIVE_PROCESSING_STATES.has(archive.state),
      ),
    [archives],
  );
  const selectedArchives = React.useMemo(
    () => archives.filter((archive) => selected.has(archive.id)),
    [archives, selected],
  );
  const restorable = selectedArchives.filter(
    (archive) =>
      archive.state === "ready" || archive.state === "restore_failed",
  );
  const deletable = selectedArchives.filter(
    (archive) => archive.state === "ready" || archive.state === "delete_failed",
  );
  const selectedAll =
    selectable.length > 0 &&
    selectable.every((archive) => selected.has(archive.id));
  const selectedSome = selectable.some((archive) => selected.has(archive.id));

  const afterAction = React.useCallback(() => {
    setSelected(new Set());
    void load();
    onChanged();
  }, [load, onChanged]);

  async function restoreMany(items: TaskArchive[]) {
    try {
      const result =
        items.length === 1
          ? {
              items: [
                {
                  id: String(items[0].id),
                  ok: true,
                  queued: true,
                  archive_id: (await api.restoreTaskArchive(items[0].id)).id,
                },
              ],
            }
          : await api.restoreTaskArchives(items.map((archive) => archive.id));
      const succeeded = result.items.filter((item) => item.ok).length;
      const failed = result.items.length - succeeded;
      for (const item of result.items) {
        const archiveID = Number(item.archive_id ?? item.id);
        if (item.ok && Number.isSafeInteger(archiveID) && archiveID > 0)
          pendingRestoreIDs.current.add(archiveID);
      }
      if (succeeded > 0) toast.success(t("restoreQueued", { count: succeeded }));
      if (failed > 0) toast.error(t("restoreRejected", { count: failed }));
      afterAction();
    } catch (error) {
      toast.error(t("restoreFailed", { detail: (error as Error).message }));
    }
  }

  async function deleteMany(items: TaskArchive[]) {
    try {
      const result =
        items.length === 1
          ? {
              items: [
                {
                  id: String(items[0].id),
                  ok: true,
                  queued: true,
                  archive_id: (await api.deleteTaskArchive(items[0].id)).id,
                },
              ],
            }
          : await api.deleteTaskArchives(items.map((archive) => archive.id));
      const succeeded = result.items.filter((item) => item.ok).length;
      const failed = result.items.length - succeeded;
      if (succeeded > 0) toast.success(t("deleteQueued", { count: succeeded }));
      if (failed > 0) toast.error(t("deleteRejected", { count: failed }));
      afterAction();
    } catch (error) {
      toast.error(t("deleteFailed", { detail: (error as Error).message }));
      throw error;
    }
  }

  async function retry(archive: TaskArchive) {
    try {
      if (archive.state === "archive_failed") await api.archiveTask(String(archive.task_id));
      if (archive.state === "restore_failed") await api.restoreTaskArchive(archive.id);
      if (archive.state === "delete_failed") await api.deleteTaskArchive(archive.id);
      toast.success(t("retryQueued"));
      afterAction();
    } catch (error) {
      toast.error(t("retryFailed", { detail: (error as Error).message }));
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-0 pt-6">
        <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={t("search")}
              className="pl-8"
            />
          </div>
          <Select
            value={stateFilter}
            onValueChange={(value) => {
              setStateFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("state")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("allStates")}</SelectItem>
                <SelectItem value="archive_queued">{archiveStateLabel("archive_queued", t)}</SelectItem>
                <SelectItem value="archiving">{archiveStateLabel("archiving", t)}</SelectItem>
                <SelectItem value="ready">{archiveStateLabel("ready", t)}</SelectItem>
                <SelectItem value="restore_queued">{archiveStateLabel("restore_queued", t)}</SelectItem>
                <SelectItem value="restoring">{archiveStateLabel("restoring", t)}</SelectItem>
                <SelectItem value="delete_queued">{archiveStateLabel("delete_queued", t)}</SelectItem>
                <SelectItem value="deleting">{archiveStateLabel("deleting", t)}</SelectItem>
                <SelectItem value="archive_failed">{archiveStateLabel("archive_failed", t)}</SelectItem>
                <SelectItem value="restore_failed">{archiveStateLabel("restore_failed", t)}</SelectItem>
                <SelectItem value="delete_failed">{archiveStateLabel("delete_failed", t)}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs tabular-nums">{t("total", { count: total })}</span>
          {selectedArchives.length > 0 && (
            <>
              <span className="text-xs tabular-nums">{t("selected", { count: selectedArchives.length })}</span>
              {restorable.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void restoreMany(restorable)}
                >
                  <Undo2Icon data-icon="inline-start" />
                  {t("restoreCount", { count: restorable.length })}
                </Button>
              )}
              {deletable.length > 0 && (
                <ArchiveDeleteDialog
                  archives={deletable}
                  onConfirm={() => deleteMany(deletable)}
                  trigger={
                    <Button size="sm" variant="destructive">
                      <Trash2Icon data-icon="inline-start" />
                      {t("deleteCount", { count: deletable.length })}
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : archives.length === 0 ? (
          <Empty className="mx-4 border border-dashed lg:mx-6">
            <EmptyHeader>
              <EmptyTitle>{t("empty")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
            <TableHeader className="[&_tr]:border-t">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      selectedAll || (selectedSome ? "indeterminate" : false)
                    }
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked === true
                          ? new Set(selectable.map((archive) => archive.id))
                          : new Set(),
                      )
                    }
                    aria-label={t("selectPage")}
                  />
                </TableHead>
                <TableHead>{t("task")}</TableHead>
                <TableHead>{t("originalStatus")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("archivedAt")}</TableHead>
                <TableHead>{t("compressedSize")}</TableHead>
                <TableHead>{t("dataCount")}</TableHead>
                <TableHead className="min-w-44">{t("state")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.map((archive) => {
                const processing = ARCHIVE_PROCESSING_STATES.has(archive.state);
                const canRestore =
                  archive.state === "ready" ||
                  archive.state === "restore_failed";
                const canDelete =
                  archive.state === "ready" ||
                  archive.state === "delete_failed";
                return (
                  <TableRow
                    key={archive.id}
                    data-state={
                      selected.has(archive.id) ? "selected" : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(archive.id)}
                        disabled={processing}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(archive.id);
                            else next.delete(archive.id);
                            return next;
                          })
                        }
                        aria-label={t("selectArchive", { id: archive.task_id })}
                      />
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          {archive.task_name || archive.task_description || t("taskFallback", { id: archive.task_id })}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          #{archive.task_id} · {archive.task_description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        domain="task"
                        value={archive.original_status}
                        dot
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{archive.category_name || t("uncategorized")}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                      {archiveDate(archive.archived_at || archive.requested_at, dateTime)}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs"
                      title={t("originalSize", { size: formatArchiveBytes(archive.original_size, number) })}
                    >
                      {archiveCompressionLabel(archive, t, number)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{number(archiveDataTotal(archive), "count")}</TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <ArchiveStateBadge state={archive.state} />
                        {processing && <Progress value={archive.progress} />}
                        {archive.error && (
                          <p className="text-destructive text-xs [overflow-wrap:anywhere]">
                            {archive.error}
                          </p>
                        )}
                        {[...new Set(archive.warnings ?? [])].map((warning) => (
                          <p
                            key={warning}
                            className="text-amber-700 text-xs [overflow-wrap:anywhere] dark:text-amber-400"
                          >
                            {warning}
                          </p>
                        ))}
                        <span className="text-muted-foreground text-xs">
                          {archive.phase} · {number(archive.progress / 100, { style: "percent", maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        {ARCHIVE_FAILED_STATES.has(archive.state) && (
                          <TaskActionTooltip label={t("retryArchive")} description={t("retryDescription")}>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void retry(archive)}
                              aria-label={t("retryArchive")}
                            >
                              <Undo2Icon />
                            </Button>
                          </TaskActionTooltip>
                        )}
                        {canRestore && (
                          <TaskActionTooltip label={t("restoreTask")} description={t("restoreDescription")}>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void restoreMany([archive])}
                              aria-label={t("restoreTask")}
                            >
                              <Undo2Icon />
                            </Button>
                          </TaskActionTooltip>
                        )}
                        {canDelete && (
                          <Tooltip delayDuration={200}>
                            <ArchiveDeleteDialog
                              archives={[archive]}
                              onConfirm={() => deleteMany([archive])}
                              trigger={
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t("deleteArchive")}
                                  >
                                    <Trash2Icon />
                                  </Button>
                                </TooltipTrigger>
                              }
                            />
                            <TooltipContent side="top" sideOffset={6} className="block max-w-64 space-y-1 text-left leading-relaxed">
                              <p className="font-medium">{t("deleteArchive")}</p>
                              <p>{t("deleteArchiveDescription")}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </CardContent>
    </Card>
  );
}

const emptyDeleteOptions = (): DeleteTaskOptions => ({
  delete_assets: false,
  delete_traffic: false,
  delete_files: false,
  delete_findings: false,
  delete_llm_records: false,
});

const deleteOptionKeys: (keyof DeleteTaskOptions)[] = [
  "delete_assets",
  "delete_traffic",
  "delete_files",
  "delete_findings",
  "delete_llm_records",
];

// DeleteOptionFields renders the「同时清理关联数据」checkbox block shared by the
// single-task and bulk delete dialogs. idPrefix keeps the label/input ids unique when
// several dialogs live in the same table.
function DeleteOptionFields({
  idPrefix,
  options,
  onOptionsChange,
  disabled,
}: {
  idPrefix: string;
  options: DeleteTaskOptions;
  onOptionsChange: React.Dispatch<React.SetStateAction<DeleteTaskOptions>>;
  disabled: boolean;
}) {
  const t = useTranslations("tasksList");
  const selectedCount = deleteOptionKeys.filter((key) => options[key]).length;
  let allChecked: boolean | "indeterminate" = false;
  if (selectedCount === deleteOptionKeys.length) {
    allChecked = true;
  } else if (selectedCount > 0) {
    allChecked = "indeterminate";
  }

  const updateOption = (key: keyof DeleteTaskOptions, checked: boolean) => {
    onOptionsChange((current) => ({ ...current, [key]: checked }));
  };

  const updateAllOptions = (checked: boolean) => {
    onOptionsChange({
      delete_assets: checked,
      delete_traffic: checked,
      delete_files: checked,
      delete_findings: checked,
      delete_llm_records: checked,
    });
  };

  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">{t("deleteOptions")}</FieldLegend>
      <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-all-${idPrefix}`}
            checked={allChecked}
            onCheckedChange={(checked) => updateAllOptions(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-all-${idPrefix}`}>{t("deleteAll")}</FieldLabel>
            <FieldDescription>{t("deleteAllDescription")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-assets-${idPrefix}`}
            checked={options.delete_assets}
            onCheckedChange={(checked) =>
              updateOption("delete_assets", checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-assets-${idPrefix}`}>{t("deleteAssets")}</FieldLabel>
            <FieldDescription>{t("deleteAssetsDescription")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-traffic-${idPrefix}`}
            checked={options.delete_traffic}
            onCheckedChange={(checked) =>
              updateOption("delete_traffic", checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-traffic-${idPrefix}`}>{t("deleteTraffic")}</FieldLabel>
            <FieldDescription>{t("deleteTrafficDescription")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-files-${idPrefix}`}
            checked={options.delete_files}
            onCheckedChange={(checked) =>
              updateOption("delete_files", checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-files-${idPrefix}`}>{t("deleteFiles")}</FieldLabel>
            <FieldDescription>{t("deleteFilesDescription")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-findings-${idPrefix}`}
            checked={options.delete_findings}
            onCheckedChange={(checked) =>
              updateOption("delete_findings", checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-findings-${idPrefix}`}>{t("deleteFindings")}</FieldLabel>
            <FieldDescription>{t("deleteFindingsDescription")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-llm-records-${idPrefix}`}
            checked={options.delete_llm_records}
            onCheckedChange={(checked) =>
              updateOption("delete_llm_records", checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-llm-records-${idPrefix}`}>{t("deleteLLMRecords")}</FieldLabel>
            <FieldDescription>{t("deleteLLMRecordsDescription")}</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function DeleteTaskDialog({
  task,
  onDelete,
}: {
  task: Task;
  onDelete: (id: string, options: DeleteTaskOptions) => Promise<void>;
}) {
  const t = useTranslations("tasksList");
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [options, setOptions] =
    React.useState<DeleteTaskOptions>(emptyDeleteOptions);

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (next) setOptions(emptyDeleteOptions());
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(task.id, options);
      setOpen(false);
    } catch {
      // The parent displays the API error; retain the dialog for retry.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <TaskActionTooltip label={t("deleteTask")} description={t("deleteDescription")}>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="outline" aria-label={t("deleteTask")}>
            <Trash2Icon className="text-destructive" />
          </Button>
        </AlertDialogTrigger>
      </TaskActionTooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTaskTitle", { id: task.id })}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {task.description
              ? t.rich("deleteTaskDescription", {
                  description: task.description.length > 80 ? `${task.description.slice(0, 80)}…` : task.description,
                  task: (chunks) => <span className="break-all">{chunks}</span>,
                })
              : t("deleteUnnamedTaskDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DeleteOptionFields
          idPrefix={task.id}
          options={options}
          onOptionsChange={setOptions}
          disabled={deleting}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting ? t("deleting") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// BulkDeleteTasksDialog deletes every checked task with one shared set of cleanup options.
// The backend has no batch endpoint, so deletion runs one task at a time (see deleteTasks)
// and the button shows live progress.
// MoveTasksCategoryDialog confirms a target before applying, so a mis-click on a
// large selection cannot silently re-file every task. UNCATEGORIZED_VALUE stands
// in for "no category" because Select rejects an empty string value.
function MoveTasksCategoryDialog({
  categories,
  count,
  moving,
  onMove,
}: {
  categories: TaskCategory[];
  count: number;
  moving: boolean;
  onMove: (categoryID?: number) => Promise<void>;
}) {
  const t = useTranslations("tasksCreate");
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState(UNCATEGORIZED_VALUE);

  const handleOpenChange = (next: boolean) => {
    if (moving) return;
    setOpen(next);
    if (next) setTarget(UNCATEGORIZED_VALUE);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FolderInputIcon data-icon="inline-start" /> {t("moveCategory")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moveTitle", { count })}</DialogTitle>
          <DialogDescription>{t("moveDescription")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="bulk-category">{t("moveTarget")}</FieldLabel>
          <Select value={target} onValueChange={setTarget} disabled={moving}>
            <SelectTrigger id="bulk-category" className="w-full">
              <SelectValue placeholder={t("chooseCategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={UNCATEGORIZED_VALUE}>{t("uncategorized")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {categories.length === 0 && <FieldDescription>{t("noCategories")}</FieldDescription>}
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={moving}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={moving}
            onClick={() => {
              void onMove(
                target === UNCATEGORIZED_VALUE ? undefined : Number(target),
              ).then(() => setOpen(false));
            }}
          >
            {moving && <Spinner data-icon="inline-start" />}
            {t("move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteTasksDialog({
  ids,
  onDelete,
}: {
  ids: string[];
  onDelete: (
    ids: string[],
    options: DeleteTaskOptions,
    onProgress: (done: number) => void,
  ) => Promise<void>;
}) {
  const t = useTranslations("tasksList");
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [options, setOptions] =
    React.useState<DeleteTaskOptions>(emptyDeleteOptions);

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (next) {
      setOptions(emptyDeleteOptions());
      setDone(0);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDone(0);
    try {
      await onDelete(ids, options, setDone);
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2Icon className="text-destructive" /> {t("deleteSelected", { count: ids.length })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bulkDeleteTitle", { count: ids.length })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("bulkDeleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
          {ids.slice(0, 30).map((id) => (
            <code key={id} className="bg-muted rounded px-1.5 py-0.5 font-mono">
              #{id}
            </code>
          ))}
          {ids.length > 30 && <span className="self-center">{t("moreSelected", { count: ids.length })}</span>}
        </div>
        <DeleteOptionFields
          idPrefix="bulk"
          options={options}
          onOptionsChange={setOptions}
          disabled={deleting}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting ? t("deleteProgress", { done, total: ids.length }) : t("deleteCount", { count: ids.length })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// CreateTaskSheet is the 新建任务 drawer. Its form state lives HERE, not in TasksPage: with
// 描述/目标 held by the page component every keystroke re-rendered the whole task table
// behind the drawer (plus its sticky column and 20 AlertDialog trees), which showed up as
// input lag. Now typing only re-renders the drawer.
function SourceTaskPicker({
  tasks,
  value,
  onValueChange,
  portalContainer,
}: {
  tasks: Task[];
  value: string[];
  onValueChange: (value: string[]) => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("tasksCreate");
  const tasksByID = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskIDs = React.useMemo(() => tasks.map((task) => task.id), [tasks]);
  const atLimit = value.length >= MAX_SOURCE_TASKS;
  const taskLabel = (taskID: string) => {
    const task = tasksByID.get(taskID);
    return task ? `${task.id} ${task.description} ${task.goal}` : taskID;
  };

  const handleValueChange = (next: string[]) => {
    onValueChange(next.slice(0, MAX_SOURCE_TASKS));
  };

  return (
    <Combobox
      items={taskIDs}
      itemToStringLabel={taskLabel}
      itemToStringValue={taskLabel}
      multiple
      value={value}
      onValueChange={handleValueChange}
    >
      <ComboboxChips>
        <ComboboxValue>
          {value.map((taskID) => (
            <ComboboxChip key={taskID}>#{taskID}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id="source-tasks"
          placeholder={atLimit ? t("sourceLimit", { max: MAX_SOURCE_TASKS }) : t("sourceSearch")}
          disabled={atLimit}
        />
      </ComboboxChips>
      <ComboboxContent portalContainer={portalContainer}>
        <ComboboxEmpty>{t("noTasks")}</ComboboxEmpty>
        <ComboboxList>
          {(taskID) => {
            const task = tasksByID.get(taskID);
            return (
              <ComboboxItem
                key={taskID}
                value={taskID}
                disabled={atLimit && !value.includes(taskID)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      #{taskID} · {task?.description ?? t("unknownTask")}
                    </p>
                    {task?.goal && (
                      <p className="text-muted-foreground truncate text-xs">
                        {task.goal}
                      </p>
                    )}
                  </div>
                  {task && <StatusBadge domain="task" value={task.status} />}
                </div>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// CategoryPicker 是新建任务里的单选分类选择器：可搜索已有分类；输入库里没有的名称后
// 回车（或点下拉里的「创建」）即时新建分类并选中，选中项以可移除的 tag 展示。分类是
// 全局资源，这里即时创建与「分类管理」里手动新建等价。只允许一个分类。
function CategoryPicker({
  categories,
  value,
  onValueChange,
  onCategoryCreated,
  portalContainer,
}: {
  categories: TaskCategory[];
  value?: number;
  onValueChange: (categoryID?: number) => void;
  onCategoryCreated: () => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("tasksCreate");
  const [inputValue, setInputValue] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  // 新建的分类要等父层重新拉取才回流到 categories，先本地留一份，避免选中的 chip 和
  // 下拉在这段窗口里显示成「未知分类」。
  const [localExtra, setLocalExtra] = React.useState<TaskCategory[]>([]);

  const allCategories = React.useMemo(() => {
    const byID = new Map<number, TaskCategory>();
    for (const category of categories) byID.set(category.id, category);
    for (const category of localExtra)
      if (!byID.has(category.id)) byID.set(category.id, category);
    return [...byID.values()];
  }, [categories, localExtra]);

  const byID = React.useMemo(
    () => new Map(allCategories.map((c) => [String(c.id), c])),
    [allCategories],
  );
  const categoryIDs = React.useMemo(
    () => allCategories.map((c) => String(c.id)),
    [allCategories],
  );
  const selectedIDs = value != null ? [String(value)] : [];

  const trimmed = inputValue.trim();
  const lower = trimmed.toLowerCase();
  // 与 base-ui 默认子串过滤保持一致，用来判断「有没有相关分类」。
  const matchCount = trimmed
    ? allCategories.filter((c) => c.name.toLowerCase().includes(lower)).length
    : allCategories.length;

  const createAndSelect = async () => {
    if (!trimmed || creating) return;
    // 精确同名已存在则直接选中，不重复创建。
    const existing = allCategories.find((c) => c.name.toLowerCase() === lower);
    if (existing) {
      onValueChange(existing.id);
      setInputValue("");
      return;
    }
    setCreating(true);
    try {
      const created = await api.createTaskCategory(trimmed);
      setLocalExtra((prev) => [...prev, created]);
      onValueChange(created.id);
      setInputValue("");
      onCategoryCreated();
      toast.success(t("categoryCreated", { name: created.name }));
    } catch (e) {
      toast.error(t("categoryCreateFailed", { detail: (e as Error).message }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Combobox
      items={categoryIDs}
      itemToStringLabel={(id) => byID.get(id)?.name ?? id}
      itemToStringValue={(id) => byID.get(id)?.name ?? id}
      multiple
      value={selectedIDs}
      onValueChange={(next: string[]) => {
        // 单选：取最新选中的一个；移除 chip（清空）则回到未分类。
        const last = next[next.length - 1];
        onValueChange(last ? Number(last) : undefined);
        setInputValue("");
      }}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <ComboboxChips>
        <ComboboxValue>
          {selectedIDs.map((id) => (
            <ComboboxChip key={id}>{byID.get(id)?.name ?? t("unknownCategory")}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id="task-category"
          placeholder={selectedIDs.length ? "" : t("categorySearch")}
          onKeyDown={(e) => {
            // 完全无匹配时回车 = 创建；有匹配项时保留 base-ui 的「回车选中高亮项」。
            if (e.key === "Enter" && matchCount === 0 && trimmed) {
              e.preventDefault();
              void createAndSelect();
            }
          }}
        />
      </ComboboxChips>
      <ComboboxContent portalContainer={portalContainer}>
        <ComboboxList>
          {(id: string) => (
            <ComboboxItem key={id} value={id}>
              {byID.get(id)?.name ?? id}
            </ComboboxItem>
          )}
        </ComboboxList>
        {matchCount === 0 &&
          (trimmed ? (
            <button
              type="button"
              disabled={creating}
              onClick={() => void createAndSelect()}
              className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {creating ? <Spinner className="size-4" /> : <PlusIcon className="size-4" />}
              {t("createCategoryNamed", { name: trimmed })}
            </button>
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">{t("categoryEmpty")}</div>
          ))}
      </ComboboxContent>
    </Combobox>
  );
}

const COMPANY_SCOPE_LABELS: Record<string, string> = {
  domain: "域名",
  ip: "IP",
  cidr: "CIDR",
  icp: "ICP",
  keyword: "关键词",
};

function companyScopeSummary(company: Company, t: ReturnType<typeof useTranslations<"tasksCreate">>): string {
  const rows = company.scope ?? [];
  if (rows.length === 0) return t("scopeEmpty");
  const preview = rows.slice(0, 3).map((row) => {
    const value = row.raw || row.value || row.domain || row.net || "";
    const known = Object.hasOwn(COMPANY_SCOPE_LABELS, row.kind);
    const label = known ? COMPANY_SCOPE_LABELS[row.kind] : row.kind;
    return t("scopeEntry", { kind: known && t.has(`scope.${row.kind}`) ? t(`scope.${row.kind}`) : label, value });
  });
  return `${preview.join(" · ")}${rows.length > preview.length ? t("scopeMore", { count: rows.length - preview.length }) : ""}`;
}

function CompanyPicker({
  companies,
  value,
  onValueChange,
  portalContainer,
}: {
  companies: Company[];
  value: number[];
  onValueChange: (value: number[]) => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("tasksCreate");
  const companiesByID = React.useMemo(
    () => new Map(companies.map((company) => [String(company.id), company])),
    [companies],
  );
  const companyIDs = React.useMemo(
    () => companies.map((company) => String(company.id)),
    [companies],
  );
  const selectedIDs = React.useMemo(() => value.map(String), [value]);
  const companyLabel = (companyID: string) => {
    const company = companiesByID.get(companyID);
    return company ? `${company.name} ${companyScopeSummary(company, t)}` : companyID;
  };

  return (
    <Combobox
      items={companyIDs}
      itemToStringLabel={companyLabel}
      itemToStringValue={companyLabel}
      multiple
      value={selectedIDs}
      onValueChange={(next) =>
        onValueChange(next.map(Number).filter(Number.isFinite))
      }
    >
      <ComboboxChips>
        <ComboboxValue>
          {selectedIDs.map((companyID) => (
            <ComboboxChip key={companyID}>{companiesByID.get(companyID)?.name ?? t("companyFallback", { id: companyID })}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput id="task-companies" placeholder={t("companySearch")} />
      </ComboboxChips>
      <ComboboxContent portalContainer={portalContainer}>
        <ComboboxEmpty>{t("noCompanies")}</ComboboxEmpty>
        <ComboboxList>
          {(companyID) => {
            const company = companiesByID.get(companyID);
            return (
              <ComboboxItem key={companyID} value={companyID}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{company?.name ?? t("companyFallback", { id: companyID })}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {t("assetCount", { count: company?.asset_count ?? 0 })}
                    </span>
                  </div>
                  {company && (
                    <span className="text-muted-foreground truncate text-xs" title={companyScopeSummary(company, t)}>
                      {companyScopeSummary(company, t)}
                    </span>
                  )}
                </div>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

type CategoryManagementView = number | "uncategorized" | "new";

function CategoryDropTarget({
  value,
  name,
  count,
  selected,
  disabled,
  onSelect,
}: {
  value: string;
  name: string;
  count: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("taskCategories");
  const { isOver, setNodeRef } = useDroppable({ id: `category:${value}`, disabled });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        "min-w-0 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        isOver && "border-primary bg-primary/10 text-foreground",
      )}
      onClick={onSelect}
    >
      <span className="block truncate font-medium text-sm">{name}</span>
      <span className="block truncate text-muted-foreground text-xs">{isOver ? t("release") : t("count", { count })}</span>
    </button>
  );
}

function DraggableCategoryTask({ task, disabled, moving }: { task: Task; disabled: boolean; moving: boolean }) {
  const t = useTranslations("taskCategories");
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: `task:${task.id}`,
    disabled,
  });

  return (
    <Item
      ref={setNodeRef}
      variant="outline"
      size="sm"
      className={cn(isDragging && "opacity-40")}
    >
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0">
        {moving ? (
          <Spinner />
        ) : (
          <TaskActionTooltip
            label={t("moveTitle")}
            description={t("moveDescription")}
            disabled={disabled}
          >
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="touch-none cursor-grab active:cursor-grabbing"
              disabled={disabled}
              {...listeners}
              {...attributes}
              aria-label={t("dragTask", { id: task.id })}
            >
              <GripVerticalIcon />
            </Button>
          </TaskActionTooltip>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0">
          <Link href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`} className="truncate hover:underline">
            {task.name?.trim() || task.description || t("task", { id: task.id })}
          </Link>
        </ItemTitle>
        <ItemDescription className="line-clamp-1">
          #{task.id} · {task.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <StatusBadge domain="task" value={task.status} />
      </ItemActions>
    </Item>
  );
}

function CategoryTaskDragPreview({ task }: { task: Task }) {
  const t = useTranslations("taskCategories");
  return (
    <Item variant="outline" size="sm" className="w-80 bg-background shadow-lg">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0">
        <GripVerticalIcon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0 truncate">
          {task.name?.trim() || task.description || t("task", { id: task.id })}
        </ItemTitle>
        <ItemDescription className="line-clamp-1">#{task.id}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function CategoryManagementSheet({
  categories,
  tasks,
  onChanged,
  onTaskMoved,
}: {
  categories: TaskCategory[];
  tasks: Task[];
  onChanged: () => void;
  onTaskMoved: (taskID: string, category: TaskCategory | null) => void;
}) {
  const t = useTranslations("taskCategories");
  const [open, setOpen] = React.useState(false);
  const [selectedView, setSelectedView] =
    React.useState<CategoryManagementView>("new");
  const [draftName, setDraftName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [movingTaskID, setMovingTaskID] = React.useState<string | null>(null);
  const [activeTaskID, setActiveTaskID] = React.useState<string | null>(null);
  const wasOpen = React.useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      const first = categories[0];
      if (first) {
        setSelectedView(first.id);
        setDraftName(first.name);
      } else if (tasks.some((task) => task.category_id == null)) {
        setSelectedView("uncategorized");
        setDraftName("");
      } else {
        setSelectedView("new");
        setDraftName("");
      }
    }
    wasOpen.current = open;
  }, [categories, open, tasks]);

  const selectedCategory = React.useMemo(
    () =>
      typeof selectedView === "number"
        ? (categories.find((category) => category.id === selectedView) ?? null)
        : null,
    [categories, selectedView],
  );

  const uncategorizedCount = React.useMemo(
    () => tasks.filter((task) => task.category_id == null).length,
    [tasks],
  );

  const visibleTasks = React.useMemo(() => {
    if (selectedView === "uncategorized")
      return tasks.filter((task) => task.category_id == null);
    if (typeof selectedView === "number")
      return tasks.filter((task) => task.category_id === selectedView);
    return [];
  }, [selectedView, tasks]);

  const activeTask = React.useMemo(
    () => tasks.find((task) => task.id === activeTaskID) ?? null,
    [activeTaskID, tasks],
  );

  const selectCategory = (category: TaskCategory) => {
    setSelectedView(category.id);
    setDraftName(category.name);
  };

  const selectUncategorized = () => {
    setSelectedView("uncategorized");
    setDraftName("");
  };

  const startNew = () => {
    setSelectedView("new");
    setDraftName("");
  };

  async function saveCategory() {
    const name = draftName.trim();
    if (!name || saving || selectedView === "uncategorized") return;
    setSaving(true);
    try {
      if (selectedView === "new") {
        const created = await api.createTaskCategory(name);
        setSelectedView(created.id);
        setDraftName(created.name);
        toast.success(t("created"));
      } else {
        const updated = await api.renameTaskCategory(selectedView, name);
        setDraftName(updated.name);
        toast.success(t("updated"));
      }
      onChanged();
    } catch (error) {
      toast.error(t(selectedView === "new" ? "createFailed" : "updateFailed", { detail: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory() {
    if (!selectedCategory || deleting) return;
    const deletedID = selectedCategory.id;
    setDeleting(true);
    try {
      await api.deleteTaskCategory(deletedID);
      const next = categories.find((category) => category.id !== deletedID);
      if (next) selectCategory(next);
      else selectUncategorized();
      toast.success(t("deleted"));
      setDeleteOpen(false);
      onChanged();
    } catch (error) {
      toast.error(t("deleteFailed", { detail: (error as Error).message }));
    } finally {
      setDeleting(false);
    }
  }

  async function moveTask(task: Task, destination: string) {
    if (movingTaskID) return;
    const category =
      destination === "uncategorized"
        ? null
        : (categories.find((item) => item.id === Number(destination)) ?? null);
    if (destination !== "uncategorized" && !category) {
      toast.error(t("missing"));
      return;
    }
    if (
      task.category_id === category?.id ||
      (task.category_id == null && category == null)
    )
      return;

    setMovingTaskID(task.id);
    try {
      await api.updateTaskCategory(task.id, category?.id);
      onTaskMoved(task.id, category);
      toast.success(t("moved", { id: task.id, name: category?.name ?? t("uncategorized") }));
    } catch (error) {
      toast.error(t("moveFailed", { detail: (error as Error).message }));
    } finally {
      setMovingTaskID(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveTaskID(id.startsWith("task:") ? id.slice("task:".length) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeID = String(event.active.id);
    const taskID = activeID.startsWith("task:")
      ? activeID.slice("task:".length)
      : null;
    setActiveTaskID(null);
    if (!taskID || !event.over) return;
    const destination = String(event.over.id);
    if (!destination.startsWith("category:")) return;
    const task = tasks.find((item) => item.id === taskID);
    if (!task) return;
    void moveTask(task, destination.slice("category:".length));
  }

  const saveLabel = saving ? t("saving") : selectedView === "new" ? t("create") : t("save");

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="sm" variant="outline">
            <TagsIcon data-icon="inline-start" />
            {t("manage")}
          </Button>
        </SheetTrigger>
        <SheetContent className="grid h-full w-full! max-w-none! grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[48rem]! sm:max-w-[48rem]!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveTaskID(null)}
            onDragEnd={handleDragEnd}
          >
            <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-hidden">
              <div className="flex min-h-0 flex-col border-b p-3 lg:border-r lg:border-b-0">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={startNew}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("new")}
                </Button>
                <ScrollArea className="mt-2 max-h-44 lg:max-h-none lg:flex-1">
                  <div className="flex flex-col gap-1 pr-2">
                    <CategoryDropTarget
                      value="uncategorized"
                      name={t("uncategorized")}
                      count={uncategorizedCount}
                      selected={selectedView === "uncategorized"}
                      disabled={movingTaskID != null}
                      onSelect={selectUncategorized}
                    />
                    {categories.map((category) => (
                      <CategoryDropTarget
                        key={category.id}
                        value={String(category.id)}
                        name={category.name}
                        count={category.task_count}
                        selected={selectedView === category.id}
                        disabled={movingTaskID != null}
                        onSelect={() => selectCategory(category)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <ScrollArea className="min-h-0">
                <FieldGroup className="p-6">
                  {selectedView !== "uncategorized" && (
                    <Field>
                      <FieldLabel htmlFor="task-category-name">{t("name")}</FieldLabel>
                      <Input
                        id="task-category-name"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder={t("example")}
                        maxLength={80}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveCategory();
                        }}
                      />
                      <FieldDescription>
                        {selectedCategory
                          ? t("renameHint", { count: selectedCategory.task_count })
                          : t("newHint")}
                      </FieldDescription>
                    </Field>
                  )}
                  {selectedView !== "new" && (
                    <Field>
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <FieldLabel>{selectedCategory ? t("tasks") : t("uncategorizedTasks")}</FieldLabel>
                          <FieldDescription>
                            {selectedCategory
                              ? t("categoryCount", { count: visibleTasks.length })
                              : t("uncategorizedCount", { count: visibleTasks.length })}
                          </FieldDescription>
                        </div>
                      </div>
                      {visibleTasks.length === 0 ? (
                        <Empty className="min-h-36 border">
                          <EmptyHeader>
                            <EmptyTitle>{selectedCategory ? t("empty") : t("emptyUncategorized")}</EmptyTitle>
                            <EmptyDescription>{t("emptyHint")}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <ItemGroup className="gap-2">
                          {visibleTasks.map((task) => (
                            <DraggableCategoryTask
                              key={task.id}
                              task={task}
                              moving={movingTaskID === task.id}
                              disabled={movingTaskID != null}
                            />
                          ))}
                        </ItemGroup>
                      )}
                    </Field>
                  )}
                </FieldGroup>
              </ScrollArea>
            </div>
            <DragOverlay>
              {activeTask ? (
                <CategoryTaskDragPreview task={activeTask} />
              ) : null}
            </DragOverlay>
          </DndContext>
          <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:items-center">
            {selectedCategory && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={saving || deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                {t("deleteCategory")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
            {selectedView !== "uncategorized" && (
              <Button
                type="button"
                disabled={!draftName.trim() || saving || deleting}
                onClick={() => void saveCategory()}
              >
                {saving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                {saveLabel}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: selectedCategory?.name || t("unnamed") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteHint", { count: selectedCategory?.task_count ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteCategory();
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

function CreateTaskSheet({
  tasks,
  categories,
  onCreated,
  onCategoriesChanged,
}: {
  tasks: Task[];
  categories: TaskCategory[];
  onCreated: () => void;
  onCategoriesChanged: () => void;
}) {
  const t = useTranslations("tasksCreate");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [categoryID, setCategoryID] = React.useState<number | undefined>(
    undefined,
  );
  const [description, setDescription] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [selectedTemplateID, setSelectedTemplateID] = React.useState<
    number | null
  >(null);
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [sourceTaskIDs, setSourceTaskIDs] = React.useState<string[]>([]);
  const [companyIDs, setCompanyIDs] = React.useState<number[]>([]);
  const [llmProfileIDs, setLLMProfileIDs] = React.useState<string[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [timeoutMin, setTimeoutMin] = React.useState(""); // 任务级超时(分钟);空/0 = 不限时
  const [heartbeatMin, setHeartbeatMin] = React.useState("10"); // planner 心跳(分钟);默认10,下限10(与后端一致)
  const [seedFirstIntent, setSeedFirstIntent] = React.useState(false); // 创建时下发种子意图,worker 免等首轮 planner 直接开跑;默认关闭,走标准先规划再执行
  const [shareGlobalAssets, setShareGlobalAssets] = React.useState(false);
  const [coverageEnabled, setCoverageEnabled] = React.useState(true); // 资产覆盖度功能;默认开。关闭=不计算/展示覆盖度、不累积范围、隐藏范围类工具(company 关联不受影响)
  const [workerCount, setWorkerCount] = React.useState(""); // 本任务 Worker 数;空/0=用全局默认
  const [interceptRules, setInterceptRules] = React.useState<
    AssetInterceptRuleInput[]
  >([]); // 任务级资产拦截规则(仅本任务生效,不进全局表)
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [scheduleNameEdited, setScheduleNameEdited] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ScheduleInput>({
    name: "新建任务计划",
    schedule_type: "weekly",
    end_date: "",
    weekdays: [6, 7],
    start_time: "18:00",
    end_time: "",
    task_ids: [],
    timezone_mode: "beijing",
    start_immediately: false,
  });
  // 方式1 文件上传:建任务前把文件暂存到 drafts/<draftId>/uploads/,拿回绝对路径追加进描述。
  const [uploading, setUploading] = React.useState(false);
  const [uploadCount, setUploadCount] = React.useState(0);
  const draftIdRef = React.useRef<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const sheetContentRef = React.useRef<HTMLDivElement>(null);

  // load LLM profiles once for the create-task profile picker.
  React.useEffect(() => {
    api
      .llmProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    api
      .companies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  // pickFiles uploads the chosen files into this draft's staging dir and appends their
  // absolute paths to the description; the task's agents open them by path via Read/Bash.
  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // crypto.randomUUID 仅在安全上下文可用(https/localhost);经 IP+http 访问时降级。
    if (!draftIdRef.current) {
      draftIdRef.current =
        globalThis.crypto?.randomUUID?.() ??
        `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    setUploading(true);
    try {
      const r = await api.chatUpload(
        "staging",
        draftIdRef.current,
        Array.from(files),
      );
      setDescription((prev) => appendUploads(prev, r.attachments));
      setUploadCount((n) => n + r.attachments.length);
    } catch (e) {
      toast.error(t("uploadFailed", { detail: (e as Error).message }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-picking the same file
    }
  }

  async function createTask() {
    if (!description.trim() || !goal.trim()) {
      toast.error(t("descriptionGoalRequired"));
      return;
    }
    if (sourceTaskIDs.length > MAX_SOURCE_TASKS) {
      toast.error(t("sourceLimitError", { max: MAX_SOURCE_TASKS }));
      return;
    }
    const workerCountNum = parseWorkerCountInput(workerCount);
    if (workerCountNum == null) {
      toast.error(t("workerCountInvalid", { max: MAX_TASK_WORKER_COUNT }));
      return;
    }
    setCreating(true);
    try {
      const timeoutSec = Math.max(0, Math.floor(Number(timeoutMin) || 0)) * 60;
      const heartbeatSec =
        Math.max(10, Math.floor(Number(heartbeatMin) || 10)) * 60; // 下限 10min，与后端归一一致
      await api.createTask({
        name: name.trim(),
        remark: remark.trim(),
        categoryId: categoryID,
        description: description.trim(),
        goal: goal.trim(),
        llmProfileIds: llmProfileIDs.map(Number),
        sourceTaskIds: sourceTaskIDs,
        companyIds: companyIDs,
        timeoutSeconds: timeoutSec,
        seedFirstIntent,
        planHeartbeatSeconds: heartbeatSec,
        coverageEnabled,
        shareGlobalAssets,
        workerCount: workerCountNum,
        // An untouched name is saved as displayed, in the current UI language.
        schedule: scheduleEnabled
          ? { ...schedule, name: scheduleNameEdited ? schedule.name : t("defaultScheduleName"), task_ids: [] }
          : undefined,
        interceptRules: interceptRules
          .map((r) => ({ ...r, pattern: r.pattern.trim() }))
          .filter((r) => r.pattern !== ""),
      });
      toast.success(t("created"));
      setName("");
      setRemark("");
      setCategoryID(undefined);
      setDescription("");
      setGoal("");
      setSelectedTemplateID(null);
      setSourceTaskIDs([]);
      setCompanyIDs([]);
      setLLMProfileIDs([]);
      setTimeoutMin("");
      setHeartbeatMin("10");
      setSeedFirstIntent(false);
      setCoverageEnabled(true);
      setShareGlobalAssets(false);
      setWorkerCount("");
      setInterceptRules([]);
      setScheduleEnabled(false);
      setScheduleNameEdited(false);
      setSchedule({
        name: "新建任务计划",
        schedule_type: "weekly",
        end_date: "",
        weekdays: [6, 7],
        start_time: "18:00",
        end_time: "",
        task_ids: [],
        timezone_mode: "beijing",
        start_immediately: false,
      });
      setUploadCount(0);
      draftIdRef.current = "";
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(t("createFailed", { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <PlusIcon /> {t("createTitle")}
        </Button>
      </SheetTrigger>
      {/* 45vw 宽的右侧抽屉:整屏高度可滚动,长表单不再受弹窗高度限制。窄屏退化为全宽。
            内容为 flex 列:头/脚固定,中间字段区 flex-1 独立滚动。 */}
      <SheetContent
        ref={sheetContentRef}
        side="right"
        className="w-full! max-w-none! gap-0 p-0 sm:w-[45vw]! sm:max-w-[45vw]!"
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>{t("createTitle")}</SheetTitle>
          <SheetDescription>{t("createDescription")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-5">
            <TaskTemplateControls
              description={description}
              goal={goal}
              remark={remark}
              categoryID={categoryID}
              interceptRules={interceptRules}
              workerCount={workerCount}
              selectedTemplateID={selectedTemplateID}
              onSelectedTemplateIDChange={setSelectedTemplateID}
              onApply={(template) => {
                setDescription(template.description);
                setGoal(template.goal);
                setRemark(template.remark ?? "");
                setCategoryID(template.category_id ?? undefined);
                setInterceptRules(template.intercept_rules ?? []);
                setWorkerCount(
                  template.worker_count ? String(template.worker_count) : "",
                );
                setUploadCount(0);
              }}
              portalContainer={sheetContentRef}
            />
            <div className="grid gap-2">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input
                id="name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="remark">{t("remarkLabel")}</Label>
              <Textarea
                id="remark"
                className="min-h-20"
                maxLength={MAX_TASK_REMARK_RUNES}
                placeholder={t("remarkPlaceholder")}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
            <Field>
              <FieldLabel htmlFor="task-category">{t("categoryLabel")}</FieldLabel>
              <CategoryPicker
                categories={categories}
                value={categoryID}
                onValueChange={setCategoryID}
                onCategoryCreated={onCategoriesChanged}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{t("categoryHint")}</FieldDescription>
            </Field>
            <FieldSet>
              <FieldLegend>{t("scheduleLabel")}</FieldLegend>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(!!v)} />
                {t("scheduleEnable")}
              </label>
              {scheduleEnabled && (
                <FieldGroup className="rounded-lg border p-3">
                  <Field>
                    <FieldLabel htmlFor="task-schedule-name">{t("scheduleName")}</FieldLabel>
                    <Input id="task-schedule-name" value={scheduleNameEdited ? schedule.name : t("defaultScheduleName")} onChange={(e) => {
                      setScheduleNameEdited(true);
                      setSchedule({ ...schedule, name: e.target.value });
                    }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>{t("scheduleRule")}</FieldLabel>
                      <Select
                        value={schedule.schedule_type}
                        onValueChange={(value) =>
                          setSchedule({
                            ...schedule,
                            schedule_type:
                              value as ScheduleInput["schedule_type"],
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">{t("scheduleWeekly")}</SelectItem>
                          <SelectItem value="once">{t("scheduleOnce")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>{t("scheduleTimezone")}</FieldLabel>
                      <Select
                        value={schedule.timezone_mode}
                        onValueChange={(value) =>
                          setSchedule({
                            ...schedule,
                            timezone_mode:
                              value as ScheduleInput["timezone_mode"],
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beijing">{t("scheduleBeijing")}</SelectItem>
                          <SelectItem value="system">{t("scheduleSystem")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {schedule.schedule_type === "once" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <FieldLabel>{t("startDate")}</FieldLabel>
                        <DateSelect
                          value={schedule.run_date ?? ""}
                          onValueChange={(value) => setSchedule({ ...schedule, run_date: value })}
                          aria-label={t("startDate")}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t("endDate")}</FieldLabel>
                        <DateSelect
                          value={schedule.end_date ?? ""}
                          onValueChange={(value) =>
                            setSchedule({ ...schedule, end_date: value })
                          }
                          optional
                          placeholder={t("noEndDate")}
                          aria-label={t("endDateAria")}
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field>
                      <FieldLabel>{t("weekdays")}</FieldLabel>
                      <Input
                        value={(schedule.weekdays ?? []).join(",")}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            weekdays: e.target.value
                              .split(",")
                              .map(Number)
                              .filter((n) => n >= 1 && n <= 7),
                          })
                        }
                        placeholder={t("weekdaysPlaceholder")}
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>{t("startTime")}</FieldLabel>
                      <TimeSelect
                        value={schedule.start_time}
                        onValueChange={(value) => setSchedule({ ...schedule, start_time: value })}
                        aria-label={t("startTime")}
                        portalContainer={sheetContentRef}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>{t("endTime")}</FieldLabel>
                      <TimeSelect
                        value={schedule.end_time ?? ""}
                        onValueChange={(value) =>
                          setSchedule({ ...schedule, end_time: value })
                        }
                        optional
                        aria-label={t("endTimeAria")}
                        portalContainer={sheetContentRef}
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={schedule.start_immediately}
                      onCheckedChange={(v) =>
                        setSchedule({ ...schedule, start_immediately: !!v })
                      }
                    />
                    {t("startImmediately")}
                  </label>
                </FieldGroup>
              )}
            </FieldSet>
            <div className="grid gap-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                className="min-h-32"
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {/* 上传文件(可多选):暂存到 drafts/,把绝对路径追加进上方描述,worker 据此 Read/Bash 打开。 */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => void pickFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
                  {t("upload")}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {uploadCount > 0
                    ? t("uploaded", { count: uploadCount })
                    : t("uploadHint")}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal">{t("goal")}</Label>
              <Textarea
                id="goal"
                className="min-h-32"
                placeholder={t("goalPlaceholder")}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
            <Field>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-global-assets"
                  checked={shareGlobalAssets}
                  onCheckedChange={(checked) => setShareGlobalAssets(checked === true)}
                />
                <Label htmlFor="share-global-assets">{t("shareGlobalAssets")}</Label>
              </div>
              <FieldDescription>
                {t("shareGlobalAssetsHint")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="source-tasks">{t("sourceTasks")}</FieldLabel>
              <SourceTaskPicker
                tasks={tasks}
                value={sourceTaskIDs}
                onValueChange={setSourceTaskIDs}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>
                {t("sourceHint", { max: MAX_SOURCE_TASKS })}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-companies">{t("companies")}</FieldLabel>
              <CompanyPicker
                companies={companies}
                value={companyIDs}
                onValueChange={setCompanyIDs}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>
                {t("companiesHint")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-intercept-rules">{t("rulesLabel")}</FieldLabel>
              <AssetInterceptRulesEditor value={interceptRules} onChange={setInterceptRules} />
              <FieldDescription>
                {t("rulesHint")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="llm-profiles">{t("llmLabel")}</FieldLabel>
              <TaskLLMProfileChain
                profiles={profiles}
                value={llmProfileIDs}
                onValueChange={setLLMProfileIDs}
                inputId="llm-profiles"
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{t("llmHint")}</FieldDescription>
            </Field>

            {/* 高级参数默认折叠:超时/心跳/首个意图,展开才占空间,常用路径保持清爽。 */}
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center gap-2 border-t pt-4 text-sm font-medium">
                <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-90" />
                {t("advanced")}
                <span className="text-muted-foreground ml-auto text-xs font-normal">{t("advancedHint")}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-5 pt-5">
                <div className="grid gap-2">
                  <Label htmlFor="timeout-min">{t("timeoutLabel")}</Label>
                  <Input
                    id="timeout-min"
                    type="number"
                    min={0}
                    className="w-40"
                    placeholder={t("timeoutPlaceholder")}
                    value={timeoutMin}
                    onChange={(e) => setTimeoutMin(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("timeoutHint")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heartbeat-min">{t("heartbeatLabel")}</Label>
                  <Input
                    id="heartbeat-min"
                    type="number"
                    min={10}
                    className="w-40"
                    placeholder={t("heartbeatPlaceholder")}
                    value={heartbeatMin}
                    onChange={(e) => setHeartbeatMin(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("heartbeatHint")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="worker-count">{t("workerLabel")}</Label>
                  <Input
                    id="worker-count"
                    type="number"
                    min={0}
                    max={MAX_TASK_WORKER_COUNT}
                    className="w-40"
                    placeholder={t("workerPlaceholder")}
                    value={workerCount}
                    onChange={(e) => setWorkerCount(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("workerHint")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="seed-first-intent"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id="seed-first-intent"
                      checked={seedFirstIntent}
                      onCheckedChange={(v) => setSeedFirstIntent(!!v)}
                    />
                    {t("seedLabel")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {t("seedHint")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="coverage-enabled"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id="coverage-enabled"
                      checked={coverageEnabled}
                      onCheckedChange={(v) => setCoverageEnabled(!!v)}
                    />
                    {t("coverageLabel")}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {t("coverageHint")}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <SheetClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </SheetClose>
          <Button onClick={createTask} disabled={creating || uploading}>
            {creating && <Spinner data-icon="inline-start" />}
            {creating ? t("creating") : t("create")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
