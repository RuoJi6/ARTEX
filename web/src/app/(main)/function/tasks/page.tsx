"use client";

import * as React from "react";

import Link from "next/link";

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
import type { TFunction } from "i18next";
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
  StarIcon,
  TablePropertiesIcon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { taskError } from "@/i18n/task-runtime";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api, type ScheduleInput } from "@/lib/api";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { type SortDirection, useStoredSortPreference } from "@/lib/sort-preference";
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
  const bullets = atts.map((a) => `- ${a.abs ?? a.path}（${fmtBytes(a.size)}）`).join("\n");
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

// fmtTokens renders a compact token count (1234 → 1.2k, 2_000_000 → 2M).
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

// fmtDuration renders a run duration in seconds as a compact human string.
function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// taskDuration counts only active execution segments. A live segment ticks locally;
// paused, queued, and terminal tasks stay fixed at their persisted active total.
function taskDuration(task: Task, nowSec: number): number {
  const active = Math.max(0, Math.floor(task.active_run_seconds ?? 0));
  const segmentStart = task.run_segment_started_unix ?? 0;
  if (task.status === "running" && !task.paused && !task.queued && segmentStart > 0) {
    return active + Math.max(0, Math.floor(nowSec - segmentStart));
  }
  return active;
}

// deleteDetails takes only the countable part of the result so callers can pass an
// aggregate accumulated over a bulk delete.
type DeleteCounts = Omit<DeleteTaskResult, "deleted" | "cleanup_warning">;

function deleteDetails(result: DeleteCounts, translate: TFunction): string[] {
  const details: string[] = [];
  if (result.assets_deleted > 0) details.push(translate("taskUI.deletedAssets", { count: result.assets_deleted }));
  if (result.assets_detached > 0) details.push(translate("taskUI.detachedAssets", { count: result.assets_detached }));
  if (result.traffic_deleted > 0) details.push(translate("taskUI.deletedTraffic", { count: result.traffic_deleted }));
  if (result.files_deleted) details.push(translate("taskUI.filesDeleted"));
  if (result.findings_deleted > 0)
    details.push(translate("taskUI.deletedFindings", { count: result.findings_deleted }));
  if (result.llm_records_deleted > 0)
    details.push(translate("taskUI.deletedLLM", { count: result.llm_records_deleted }));
  return details;
}

function deleteSummary(result: DeleteTaskResult, translate: TFunction): string {
  const details = deleteDetails(result, translate);
  return details.length > 0
    ? translate("taskUI.deletedDetails", { details: details.join(", ") })
    : translate("taskUI.taskDeleted");
}

// fmtDateTime renders a unix-seconds timestamp as a compact local date-time
// (MM-DD HH:mm), or "—" when unset.
function fmtDateTime(unix: number | undefined, locale: string): string {
  if (!unix || unix <= 0) return "—";
  const d = new Date(unix * 1000);
  return d.toLocaleString(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "created", label: "taskUI.created" },
  { value: "queued", label: "taskUI.queued" },
  { value: "running", label: "taskUI.running" },
  { value: "paused", label: "taskUI.paused" },
  { value: "done", label: "taskUI.done" },
  { value: "failed", label: "taskUI.failed" },
  { value: "timeout", label: "taskUI.timeout" },
];

// Select 不接受空字符串 value,所以「无分类」在筛选器、新建表单和批量移动里
// 统一用这个哨兵值,提交时再翻译成后端的 null。
const UNCATEGORIZED_VALUE = "uncategorized";

// 可暂停 = 非终态且未暂停,与后端 applyTaskControlWithCause 的门控一致
// (done/failed/timeout 为终态);paused 才可继续。行内按钮与批量控制共用此判断,
// 两边不会出现一个可点、另一个不可点的分歧。
const PAUSABLE_STATUSES = new Set<TaskStatus>(["created", "queued", "running"]);
const ARCHIVABLE_STATUSES = new Set<TaskStatus>(["paused", "done", "failed", "timeout"]);

function taskControlAction(status: TaskStatus): "pause" | "resume" | null {
  if (status === "paused") return "resume";
  if (PAUSABLE_STATUSES.has(status)) return "pause";
  return null;
}

type TaskSortField = "id" | "created" | "duration" | "status";

const TASK_SORT_FIELDS: readonly TaskSortField[] = ["id", "created", "duration", "status"];
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
  ["name", "taskUI.name"],
  ["remark", "taskUI.remark"],
  ["description", "taskUI.description"],
  ["goal", "taskUI.goal"],
  ["status", "taskUI.status"],
  ["progress", "taskUI.progress"],
  ["findings", "taskUI.findings"],
  ["inFlight", "taskUI.workers"],
  ["created", "taskUI.createdAt"],
  ["duration", "taskUI.duration"],
  ["tokens", "Token"],
].map(([key, label]) => ({ key: key as TaskColumnKey, label }));
const DEFAULT_TASK_COLUMNS = Object.fromEntries(TASK_COLUMNS.map(({ key }) => [key, true])) as Record<
  TaskColumnKey,
  boolean
>;

const TASK_STATUS_RANK = new Map(STATUS_OPTIONS.map((option, index) => [option.value, index]));

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

function compareTasks(left: Task, right: Task, field: TaskSortField, direction: SortDirection, nowSec: number): number {
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
      compared = (TASK_STATUS_RANK.get(left.status) ?? 0) - (TASK_STATUS_RANK.get(right.status) ?? 0);
      break;
    default:
      compared = compareTaskIDs(left.id, right.id);
  }
  if (compared !== 0) return direction === "asc" ? compared : -compared;
  return -compareTaskIDs(left.id, right.id);
}

export default function TasksPage() {
  const { t: translate, liveT } = useLiveTranslation();
  const [activeTab, setActiveTab] = React.useState("current");
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [categories, setCategories] = React.useState<TaskCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<TaskStatus | "all">("all");
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
  const [nowSec, setNowSec] = React.useState(() => Math.floor(Date.now() / 1000));
  const [batchControlling, setBatchControlling] = React.useState<"pause" | "resume" | null>(null);
  const [movingCategory, setMovingCategory] = React.useState(false);
  const [visibleColumns, setVisibleColumns] = React.useState<Record<TaskColumnKey, boolean>>(DEFAULT_TASK_COLUMNS);
  React.useEffect(() => {
    const raw = getLocalStorageValue(TASK_COLUMNS_PREFERENCE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setVisibleColumns(
        (current) =>
          Object.fromEntries(
            TASK_COLUMNS.map(({ key }) => [key, typeof parsed[key] === "boolean" ? parsed[key] : current[key]]),
          ) as Record<TaskColumnKey, boolean>,
      );
    } catch {
      // Ignore malformed saved preferences.
    }
  }, []);
  React.useEffect(() => {
    setLocalStorageValue(TASK_COLUMNS_PREFERENCE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  React.useEffect(() => {
    const raw = getLocalStorageValue(TASK_FILTER_PREFERENCE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          status?: unknown;
          category?: unknown;
        };
        if (parsed.status === "all" || STATUS_OPTIONS.some((option) => option.value === parsed.status)) {
          setStatusFilter(parsed.status as TaskStatus | "all");
        }
        if (
          typeof parsed.category === "string" &&
          (parsed.category === "all" || parsed.category === UNCATEGORIZED_VALUE || /^\d+$/.test(parsed.category))
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
      if (categoryFilter === UNCATEGORIZED_VALUE && t.category_id != null) return false;
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
    return [...filtered].sort((left, right) => compareTasks(left, right, sortField, sortDirection, sortNowSec));
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

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
        const next = r.tasks.map((t) => (t.id === r.active ? { ...t, active: true } : t));
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
    if (categoryFilter === "all" || categoryFilter === UNCATEGORIZED_VALUE) return;
    if (!categories.some((category) => String(category.id) === categoryFilter)) setCategoryFilter("all");
  }, [categories, categoriesLoaded, categoryFilter]);

  // 只在确有 running 任务时才每秒 tick——其余情况「运行时长」是静态值,空转的 tick 会白白
  // 重渲染整张表。
  const hasRunning = React.useMemo(() => tasks.some((t) => t.status === "running"), [tasks]);

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
          toast.warning(
            liveT("taskUI.cleanupWarning", { summary: deleteSummary(result, liveT), message: result.cleanup_warning }),
          );
        } else {
          toast.success(deleteSummary(result, liveT));
        }
        load();
      } catch (e) {
        toast.error(liveT("taskUI.deleteError", { message: taskError(e, liveT) }));
        throw e;
      }
    },
    [load, liveT],
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
            ? liveT("taskUI.taskPaused", { id: id })
            : liveT("taskUI.taskResumed", { id: id, queue: result.queued ? liveT("taskUI.queueSuffix") : "" }),
        );
      } catch (e) {
        toast.error(
          liveT("taskUI.actionFailed", {
            action: action === "pause" ? liveT("taskUI.pause") : liveT("taskUI.resume"),
            message: taskError(e, liveT),
          }),
        );
      } finally {
        // 无论成败都刷新:失败多半是状态已变化,重新拉取才能让按钮回到正确形态。
        lastRef.current = "";
        load();
      }
    },
    [load, liveT],
  );

  const updateTaskRemark = React.useCallback(
    async (task: Task, remark: string) => {
      const updated = await api.updateTask(task.id, { remark });
      setTasks((current) =>
        current.map((entry) => (entry.id === task.id ? { ...entry, remark: updated.remark } : entry)),
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
        toast.success(liveT("taskUI.taskRenamed", { id: task.id }));
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(liveT("taskUI.renameFailed", { message: taskError(error, liveT) }));
        throw error;
      }
    },
    [load, liveT],
  );

  const toggleTaskPinned = React.useCallback(
    async (task: Task) => {
      const pinned = taskIsPinned(task);
      try {
        await api.pinTask(task.id, !pinned);
        toast.success(
          pinned ? liveT("taskUI.taskUnpinned", { id: task.id }) : liveT("taskUI.taskPinned", { id: task.id }),
        );
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(
          liveT("taskUI.actionFailed", {
            action: pinned ? liveT("taskUI.unpin") : liveT("taskUI.pinAction"),
            message: taskError(error, liveT),
          }),
        );
        throw error;
      }
    },
    [load, liveT],
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
            entry.id === task.id ? { ...entry, share_global_assets: updated.share_global_assets } : entry,
          ),
        );
        toast.success(liveT(enabled ? "taskUI.globalAssetsDisabled" : "taskUI.globalAssetsEnabled", { id: task.id }));
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(liveT("taskUI.settingFailed", { message: taskError(error, liveT) }));
      }
    },
    [load, liveT],
  );

  const queueTaskArchive = React.useCallback(
    async (task: Task) => {
      try {
        await api.archiveTask(task.id);
        toast.success(liveT("taskUI.taskArchiveQueued", { id: task.id }));
        setActiveTab("archived");
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(liveT("taskUI.archiveError", { message: taskError(error, liveT) }));
        throw error;
      }
    },
    [load, liveT],
  );

  // deleteTasks 逐个删除所选任务:后端没有批量接口,且单次删除会连带清理资产/流量/文件,
  // 串行执行以免一次性打爆后端;成功的从选中集移除,失败的保留以便重试。
  const deleteTasks = React.useCallback(
    async (ids: string[], options: DeleteTaskOptions, onProgress: (done: number) => void) => {
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
          if (r.cleanup_warning) warnings.push(`#${id}：${r.cleanup_warning}`);
          deleted.push(id);
        } catch (e) {
          failed.push({ id, message: taskError(e, liveT) });
        }
        onProgress(deleted.length + failed.length);
      }

      if (deleted.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
        const details = deleteDetails(total, liveT);
        const summary =
          liveT("taskUI.deletedTasks", { count: deleted.length }) +
          (details.length > 0 ? `（${details.join(", ")}）` : "");
        if (warnings.length > 0) {
          toast.warning(liveT("taskUI.cleanupWarning", { summary: summary, message: warnings.join("; ") }));
        } else {
          toast.success(summary);
        }
      }
      if (failed.length > 0) {
        const head = failed
          .slice(0, 3)
          .map((f) => liveT("taskUI.itemError", { id: f.id, message: f.message }))
          .join("; ");
        toast.error(
          liveT("taskUI.deleteFailures", {
            count: failed.length,
            details: head,
            more: failed.length > 3 ? liveT("taskUI.andMore") : "",
          }),
        );
      }
      load();
    },
    [load, liveT],
  );

  const selectedTasks = React.useMemo(() => tasks.filter((task) => selectedIds.has(task.id)), [tasks, selectedIds]);
  const pausableTaskIDs = React.useMemo(
    () => selectedTasks.filter((task) => taskControlAction(task.status) === "pause").map((task) => task.id),
    [selectedTasks],
  );
  const resumableTaskIDs = React.useMemo(
    () => selectedTasks.filter((task) => taskControlAction(task.status) === "resume").map((task) => task.id),
    [selectedTasks],
  );
  const archivableTaskIDs = React.useMemo(
    () => selectedTasks.filter((task) => ARCHIVABLE_STATUSES.has(task.status) && !task.queued).map((task) => task.id),
    [selectedTasks],
  );

  const archiveSelectedTasks = React.useCallback(async () => {
    if (archivableTaskIDs.length === 0) return;
    const result = await api.archiveTasks(archivableTaskIDs);
    const succeeded = result.items.filter((item) => item.ok);
    const failed = result.items.filter((item) => !item.ok);
    if (succeeded.length > 0) toast.success(liveT("taskUI.tasksArchiveQueued", { count: succeeded.length }));
    if (failed.length > 0) {
      toast.error(
        liveT("taskUI.archiveFailures", {
          count: failed.length,
          details: failed
            .slice(0, 3)
            .map((item) =>
              liveT("taskUI.itemError", {
                id: item.id,
                message: item.error ? taskError(item.error, liveT) : liveT("taskUI.stateChanged"),
              }),
            )
            .join("; "),
        }),
      );
    }
    setSelectedIds(new Set());
    setActiveTab("archived");
    lastRef.current = "";
    load();
  }, [archivableTaskIDs, load, liveT]);

  const controlSelectedTasks = React.useCallback(
    async (action: "pause" | "resume", ids: string[]) => {
      if (ids.length === 0 || batchControlling) return;
      if (ids.length > 100) {
        toast.error(liveT("taskUI.batchLimit"));
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
              ? liveT("taskUI.tasksPaused", { count: succeeded.length })
              : liveT("taskUI.tasksResumed", {
                  count: succeeded.length,
                  queue: succeeded.some((item) => item.queued) ? liveT("taskUI.queueSome") : "",
                }),
          );
        }
        if (failed.length > 0) {
          const details = failed
            .slice(0, 3)
            .map((item) =>
              liveT("taskUI.itemError", { id: item.id, message: item.error || liveT("taskUI.stateChanged") }),
            )
            .join("; ");
          toast.error(
            liveT("taskUI.controlFailures", {
              count: failed.length,
              details: details,
              more: failed.length > 3 ? liveT("taskUI.andMore") : "",
            }),
          );
        }
        lastRef.current = "";
        load();
      } catch (error) {
        toast.error(
          liveT("taskUI.actionFailed", {
            action: action === "pause" ? liveT("taskUI.batchPause") : liveT("taskUI.batchResume"),
            message: taskError(error, liveT),
          }),
        );
      } finally {
        setBatchControlling(null);
      }
    },
    [batchControlling, load, liveT],
  );

  // 后端把整批分类写入放在一个事务里，所以失败项只可能是勾选后又被删掉的任务。
  const moveSelectedTasksCategory = React.useCallback(
    async (categoryID?: number) => {
      const ids = [...selectedIds];
      if (ids.length === 0 || movingCategory) return;
      if (ids.length > 100) {
        toast.error(liveT("taskUI.categoryBatchLimit"));
        return;
      }
      setMovingCategory(true);
      try {
        const result = await api.updateTasksCategory(ids, categoryID);
        const succeeded = result.items.filter((item) => item.ok);
        const failed = result.items.filter((item) => !item.ok);
        const target = result.category?.name ?? liveT("taskUI.uncategorized");
        if (succeeded.length > 0) {
          toast.success(liveT("taskUI.tasksMoved", { count: succeeded.length, category: target }));
          setSelectedIds(new Set());
        }
        if (failed.length > 0) {
          const details = failed
            .slice(0, 3)
            .map((item) =>
              liveT("taskUI.itemError", {
                id: item.id,
                message: item.error ? taskError(item.error, liveT) : liveT("taskUI.taskMissing"),
              }),
            )
            .join("; ");
          toast.error(
            liveT("taskUI.moveFailures", {
              count: failed.length,
              details: details,
              more: failed.length > 3 ? liveT("taskUI.andMore") : "",
            }),
          );
        }
        refreshCategoriesAndTasks();
      } catch (error) {
        toast.error(liveT("taskUI.categoryChangeFailed", { message: taskError(error, liveT) }));
      } finally {
        setMovingCategory(false);
      }
    },
    [movingCategory, refreshCategoriesAndTasks, selectedIds, liveT],
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
      <TabsList className="mx-4 lg:mx-6">
        <TabsTrigger value="current">{translate("taskUI.currentTasks")}</TabsTrigger>
        <TabsTrigger value="archived">{translate("taskUI.archived")}</TabsTrigger>
      </TabsList>
      <TabsContent value="current">
        <Card>
          <CardContent className="flex flex-col gap-4 px-0 pt-6">
            <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
              <div className="relative w-full sm:max-w-xs">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder={translate("taskUI.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={translate("taskUI.clearSearch")}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "all")}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={translate("taskUI.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{translate("taskUI.allStates")}</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {translate(s.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={translate("taskUI.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{translate("taskUI.allCategories")}</SelectItem>
                    <SelectItem value={UNCATEGORIZED_VALUE}>{translate("taskUI.uncategorized")}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs tabular-nums">
                {translate("taskUI.filteredCount", { visible: filtered.length, total: tasks.length })}
              </span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs tabular-nums">
                    {translate("taskUI.selectedCount", { count: selectedIds.size })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    {translate("taskUI.deselect")}
                  </Button>
                  {pausableTaskIDs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={batchControlling !== null}
                      onClick={() => void controlSelectedTasks("pause", pausableTaskIDs)}
                    >
                      {batchControlling === "pause" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <PauseIcon data-icon="inline-start" />
                      )}
                      {translate("taskUI.pause")}
                      {pausableTaskIDs.length}
                    </Button>
                  )}
                  {resumableTaskIDs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={batchControlling !== null}
                      onClick={() => void controlSelectedTasks("resume", resumableTaskIDs)}
                    >
                      {batchControlling === "resume" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <PlayIcon data-icon="inline-start" />
                      )}
                      {translate("taskUI.resume")}
                      {resumableTaskIDs.length}
                    </Button>
                  )}
                  {archivableTaskIDs.length > 0 && (
                    <ArchiveConfirmDialog
                      count={archivableTaskIDs.length}
                      onConfirm={archiveSelectedTasks}
                      trigger={
                        <Button size="sm" variant="outline">
                          <ArchiveIcon data-icon="inline-start" />
                          {translate("taskUI.archive")}
                          {archivableTaskIDs.length}
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
                  <BulkDeleteTasksDialog ids={[...selectedIds]} onDelete={deleteTasks} />
                </>
              )}
              <TaskColumnsSettingsDialog visibleColumns={visibleColumns} onChange={setVisibleColumns} />
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
                {translate("taskUI.empty")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-muted-foreground mx-4 flex items-center justify-center rounded-lg border border-dashed py-20 text-sm lg:mx-6">
                {translate("taskUI.noMatches")}
              </div>
            ) : (
              <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                <TableHeader className="[&_tr]:border-t">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={headerChecked}
                        onCheckedChange={(checked) => toggleSelectedPage(checked === true)}
                        aria-label={translate("taskUI.selectPage")}
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
                    <TableHead className={cn(!visibleColumns.name && "hidden")}>{translate("taskUI.name")}</TableHead>
                    <TableHead className={cn("w-px", !visibleColumns.remark && "hidden")}>
                      {translate("taskUI.remark")}
                    </TableHead>
                    <TableHead className={cn(!visibleColumns.description && "hidden")}>
                      {translate("taskUI.description")}
                    </TableHead>
                    <TableHead className={cn(!visibleColumns.goal && "hidden")}>{translate("taskUI.goal")}</TableHead>
                    <SortableTaskHead
                      field="status"
                      label={translate("taskUI.status")}
                      hidden={!visibleColumns.status}
                      activeField={sortField}
                      direction={sortDirection}
                      onSort={sortTasksBy}
                    />
                    <TableHead className={cn("text-center", !visibleColumns.progress && "hidden")}>
                      {translate("taskUI.progress")}
                    </TableHead>
                    <TableHead className="text-center" title={translate("taskUI.findingSeverity")}>
                      {translate("taskUI.findings")}{" "}
                      <span className="text-muted-foreground font-normal">{translate("taskUI.severityShort")}</span>
                    </TableHead>
                    <TableHead className={cn("text-center", !visibleColumns.inFlight && "hidden")}>
                      {translate("taskUI.workers")}
                    </TableHead>
                    <SortableTaskHead
                      field="created"
                      label={translate("taskUI.createdAt")}
                      hidden={!visibleColumns.created}
                      activeField={sortField}
                      direction={sortDirection}
                      align="right"
                      onSort={sortTasksBy}
                    />
                    <SortableTaskHead
                      field="duration"
                      label={translate("taskUI.duration")}
                      hidden={!visibleColumns.duration}
                      activeField={sortField}
                      direction={sortDirection}
                      align="right"
                      onSort={sortTasksBy}
                    />
                    <TableHead className={cn("text-right", !visibleColumns.tokens && "hidden")}>Token</TableHead>
                    <TableHead className="sticky right-0 z-10 bg-card text-right shadow-[-1px_0_0_0_hsl(var(--border))]">
                      {translate("taskUI.actions")}
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
    return <ArrowUpDownIcon className="size-3.5 opacity-40 transition-opacity group-hover/sort:opacity-100" />;
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
  const { t: translate } = useLiveTranslation();
  const active = activeField === field;
  let ariaSort: React.AriaAttributes["aria-sort"] = "none";
  if (active) ariaSort = direction === "asc" ? "ascending" : "descending";

  let actionLabel = translate("taskUI.sortDescending", { label: label });
  if (active)
    actionLabel = translate("taskUI.sortCurrent", {
      label: label,
      direction: direction === "asc" ? translate("taskUI.ascending") : translate("taskUI.descending"),
    });

  return (
    <TableHead className={cn(className, hidden && "hidden")} aria-sort={ariaSort}>
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
  onChange: React.Dispatch<React.SetStateAction<Record<TaskColumnKey, boolean>>>;
}) {
  const { t: translate } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const visibleCount = TASK_COLUMNS.filter(({ key }) => visibleColumns[key]).length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={translate("taskUI.columnsSettings")}>
          <TablePropertiesIcon /> {translate("taskUI.columns")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate("taskUI.columnsSettings")}</DialogTitle>
          <DialogDescription>{translate("taskUI.columnsHelp")}</DialogDescription>
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
              <label htmlFor={`task-column-${key}`}>{translate(label)}</label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(DEFAULT_TASK_COLUMNS)}>
            {translate("taskUI.reset")}
          </Button>
          <DialogClose asChild>
            <Button>{translate("taskUI.finish")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConcurrencySettingsDialog() {
  const { t: translate } = useLiveTranslation();
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
      await api.setSettings({
        task_concurrency_enabled: enabled,
        task_concurrency_limit: nextLimit,
      });
      toast.success(
        enabled
          ? translate("taskUI.concurrencyEnabled", { count: nextLimit })
          : translate("taskUI.concurrencyDisabled"),
      );
      setOpen(false);
    } catch (error) {
      toast.error(translate("taskUI.saveFailed", { message: taskError(error, translate) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="ml-auto" aria-label={translate("taskUI.concurrencySettings")}>
          <SlidersHorizontalIcon /> {translate("taskUI.concurrency")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate("taskUI.concurrencyLimit")}</DialogTitle>
          <DialogDescription>{translate("taskUI.concurrencyHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="task-concurrency-enabled">{translate("taskUI.enableConcurrency")}</Label>
              <span className="text-muted-foreground text-xs">{translate("taskUI.offByDefault")}</span>
            </div>
            <Switch id="task-concurrency-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
          </div>
          {enabled && (
            <div className="grid gap-2">
              <Label htmlFor="task-concurrency-limit">{translate("taskUI.maxConcurrent")}</Label>
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
            <Button variant="outline">{translate("taskUI.cancel")}</Button>
          </DialogClose>
          <Button onClick={save} disabled={loading || saving}>
            {saving && <Loader2Icon className="animate-spin" />} {translate("taskUI.save")}
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
  const { t: translate, i18n } = useLiveTranslation();
  return (
    <TableRow className="group border-border/60" data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(task.id, checked === true)}
          aria-label={translate("taskUI.selectTask", { id: task.id })}
        />
      </TableCell>
      <TableCell className={cn(!visibleColumns.id && "hidden")}>
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{task.id}</code>
      </TableCell>
      <TableCell className={cn("font-medium", !visibleColumns.name && "hidden")}>
        <div className="flex max-w-xs items-center gap-2">
          <TaskNameEditor task={task} onRename={onRename} />
          {task.active && <StarIcon className="size-4 shrink-0 fill-amber-400 text-amber-400" />}
          {taskIsPinned(task) && (
            <PinIcon className="text-primary size-4 shrink-0" aria-label={translate("taskUI.pinned")} />
          )}
        </div>
      </TableCell>
      <TableCell className={cn(!visibleColumns.remark && "hidden")}>
        <RemarkEditor
          value={task.remark}
          label={translate("taskUI.taskId", { id: task.id })}
          onSave={(remark) => onRemark(task, remark)}
        />
      </TableCell>
      <TableCell className={cn("text-muted-foreground max-w-40", !visibleColumns.description && "hidden")}>
        <Link
          href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`}
          className="block truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={task.description}
        >
          {task.description}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-40 truncate" title={task.goal}>
        {task.goal}
      </TableCell>
      <TableCell className={cn(!visibleColumns.status && "hidden")}>
        <StatusBadge domain="task" value={task.status} stopReason={task.stop_reason} dot />
      </TableCell>
      <TableCell
        className={cn("text-muted-foreground text-center text-xs tabular-nums", !visibleColumns.progress && "hidden")}
      >
        {typeof task.goals_total === "number" && task.goals_total > 0 ? (
          `${task.goals_met}/${task.goals_total}`
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className={cn("text-center text-xs tabular-nums", !visibleColumns.findings && "hidden")}>
        {(() => {
          // Keep report severity counts visible while a merged folder awaits its own assessment.
          const f = task.findings ?? task.distinct_findings;
          const total = f ? f.critical + f.high + f.medium + f.low : 0;
          if (!f || (total === 0 && !task.distinct_findings?.total))
            return <span className="text-muted-foreground">0</span>;
          const seg = (n: number, cls: string) => <span className={n > 0 ? cls : "text-muted-foreground"}>{n}</span>;
          return (
            <span
              className="font-medium whitespace-nowrap"
              title={translate("taskUI.findingSummary", {
                source: task.findings ? translate("taskUI.rawReports") : translate("taskUI.distinctFindings"),
                reports: task.distinct_findings?.reports ?? total,
                pending: task.distinct_findings?.unassessed ?? 0,
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
                  {translate("taskUI.findingCounts", {
                    count: task.distinct_findings.total,
                    reports: task.distinct_findings.reports,
                  })}
                  {task.distinct_findings.unassessed > 0
                    ? translate("taskUI.unassessed", { count: task.distinct_findings.unassessed })
                    : ""}
                </span>
              ) : null}
            </span>
          );
        })()}
      </TableCell>
      <TableCell className={cn("text-center text-xs tabular-nums", !visibleColumns.inFlight && "hidden")}>
        {task.in_flight && task.in_flight > 0 ? (
          <span className="text-foreground font-medium">{task.in_flight}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums",
          !visibleColumns.created && "hidden",
        )}
      >
        {fmtDateTime(task.created_unix, i18n.resolvedLanguage ?? "zh-CN")}
      </TableCell>
      <TableCell
        className={cn("text-right text-xs whitespace-nowrap tabular-nums", !visibleColumns.duration && "hidden")}
      >
        {(() => {
          const secs = taskDuration(task, nowSec);
          if (secs <= 0) return <span className="text-muted-foreground">—</span>;
          return (
            <span className={task.status === "running" ? "text-foreground" : "text-muted-foreground"}>
              {fmtDuration(secs)}
            </span>
          );
        })()}
      </TableCell>
      <TableCell
        className={cn("text-right text-xs whitespace-nowrap tabular-nums", !visibleColumns.tokens && "hidden")}
        title={
          task.tokens
            ? translate("taskUI.tokens", {
                input: task.tokens.input_tokens,
                cache: task.tokens.cache_read_tokens,
                output: task.tokens.output_tokens,
              })
            : undefined
        }
      >
        {task.tokens ? (
          <span className="text-muted-foreground">
            {translate("taskUI.inputShort")}{" "}
            <span className="text-foreground">{fmtTokens(task.tokens.input_tokens)}</span>
            {translate("taskUI.cacheShort")}
            <span className="text-foreground">{fmtTokens(task.tokens.cache_read_tokens)}</span>
            {translate("taskUI.outputShort")}
            <span className="text-foreground">{fmtTokens(task.tokens.output_tokens)}</span>
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="sticky right-0 z-10 bg-card text-right shadow-[-1px_0_0_0_hsl(var(--border))] group-hover:bg-muted/50">
        <div className="flex items-center justify-end gap-0.5">
          <TaskGlobalAssetsAction task={task} onToggle={onToggleGlobalAssets} />
          <TaskActionTooltip label={translate("taskUI.viewTask")} description={translate("taskUI.viewTaskHelp")}>
            <Button size="icon" variant="ghost" asChild aria-label={translate("taskUI.viewTask")}>
              <Link href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`}>
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
      <TooltipTrigger asChild>{disabled ? <span className="inline-flex">{children}</span> : children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="block max-w-64 space-y-1 text-left leading-relaxed">
        <p className="font-medium">{label}</p>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function TaskNameEditor({ task, onRename }: { task: Task; onRename: (task: Task, name: string) => Promise<void> }) {
  const { t: translate } = useLiveTranslation();
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
          aria-label={translate("taskUI.taskNameLabel", { id: task.id })}
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
        {task.name?.trim() ? task.name : <span className="text-muted-foreground">{translate("taskUI.untitled")}</span>}
      </Link>
      <TaskActionTooltip label={translate("taskUI.rename")} description={translate("taskUI.renameHelp")}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          aria-label={translate("taskUI.renameTaskId", { id: task.id })}
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
  const { t: translate } = useLiveTranslation();
  const [pinning, setPinning] = React.useState(false);
  const pinned = taskIsPinned(task);

  return (
    <TaskActionTooltip
      label={pinned ? translate("taskUI.unpin") : translate("taskUI.pin")}
      description={pinned ? translate("taskUI.unpinHelp") : translate("taskUI.pinHelp")}
      disabled={pinning}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pinning}
        aria-label={
          pinned ? translate("taskUI.unpinTaskId", { id: task.id }) : translate("taskUI.pinTaskId", { id: task.id })
        }
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

function TaskGlobalAssetsAction({ task, onToggle }: { task: Task; onToggle: (task: Task) => Promise<void> }) {
  const { t: translate } = useLiveTranslation();
  const [saving, setSaving] = React.useState(false);
  const enabled = task.share_global_assets === true;
  const label = translate("taskUI.shareStateLabel", {
    state: enabled ? translate("taskUI.shareOnLabel") : translate("taskUI.shareOffLabel"),
  });
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
      <TooltipContent side="top" sideOffset={6} className="block max-w-64 space-y-1 text-left leading-relaxed">
        <p className="font-medium">{translate(enabled ? "taskUI.sharingOn" : "taskUI.sharingOff")}</p>
        <p>{translate("taskUI.shareHelp")}</p>
        <p className="opacity-75">{enabled ? translate("taskUI.stopSharing") : translate("taskUI.startSharing")}</p>
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
  const { t: translate } = useLiveTranslation();
  const [pending, setPending] = React.useState(false);
  const action = taskControlAction(task.status);
  const label = action === "resume" ? translate("taskUI.resumeTask") : translate("taskUI.pauseTask");
  let description = translate("taskUI.pauseHelp");
  if (action === "resume") description = translate("taskUI.resumeHelp");
  if (!action) description = translate("taskUI.controlUnavailable");
  return (
    <TaskActionTooltip label={label} description={description} disabled={!action || pending}>
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

function archiveBlockReason(task: Task, translate: TFunction): string {
  if (task.queued) return translate("taskUI.pauseQueuedFirst");
  if (!ARCHIVABLE_STATUSES.has(task.status)) return translate("taskUI.pauseActiveFirst");
  if (task.archive_blocked_by_task_id) {
    return translate("taskUI.archiveDependency", { id: task.archive_blocked_by_task_id });
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
  const { t: translate } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 1 ? translate("taskUI.archiveTask") : translate("taskUI.archiveTasks", { count: count })}
          </AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {translate("taskUI.archiveHelp")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{translate("taskUI.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {translate("taskUI.confirmArchive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TaskArchiveAction({ task, onArchive }: { task: Task; onArchive: (task: Task) => Promise<void> }) {
  const { t: translate } = useLiveTranslation();
  const reason = archiveBlockReason(task, translate);
  const trigger = (
    <Button
      size="icon"
      variant="ghost"
      disabled={Boolean(reason)}
      aria-label={translate("taskUI.archiveTaskId", { id: task.id })}
    >
      <ArchiveIcon />
    </Button>
  );
  if (reason) {
    return (
      <TaskActionTooltip label={translate("taskUI.cannotArchive")} description={reason} disabled>
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
      <TooltipContent side="top" sideOffset={6} className="block max-w-64 space-y-1 text-left leading-relaxed">
        <p className="font-medium">{translate("taskUI.archiveTask")}</p>
        <p>{translate("taskUI.archiveTooltip")}</p>
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

const ARCHIVE_FAILED_STATES = new Set<TaskArchiveState>(["archive_failed", "restore_failed", "delete_failed"]);

function archiveStateLabel(state: TaskArchiveState, translate: TFunction): string {
  const labels: Record<TaskArchiveState, string> = {
    archive_queued: translate("taskUI.archiveQueued"),
    archiving: translate("taskUI.archiving"),
    archive_failed: translate("taskUI.archiveFailed"),
    ready: translate("taskUI.ready"),
    restore_queued: translate("taskUI.restoreQueued"),
    restoring: translate("taskUI.restoring"),
    restore_failed: translate("taskUI.restoreFailed"),
    delete_queued: translate("taskUI.deleteQueued"),
    deleting: translate("taskUI.deleting"),
    delete_failed: translate("taskUI.deleteFailed"),
  };
  return labels[state];
}

function ArchiveStateBadge({ state }: { state: TaskArchiveState }) {
  const { t: translate } = useLiveTranslation();
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (state === "ready") variant = "secondary";
  if (ARCHIVE_PROCESSING_STATES.has(state)) variant = "default";
  if (ARCHIVE_FAILED_STATES.has(state)) variant = "destructive";
  return <Badge variant={variant}>{archiveStateLabel(state, translate)}</Badge>;
}

function formatArchiveBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function archiveCompressionLabel(archive: TaskArchive, translate: TFunction): string {
  if (archive.original_size <= 0 || archive.compressed_size <= 0) return "—";
  const saved = Math.max(0, 100 - (archive.compressed_size / archive.original_size) * 100);
  return translate("taskUI.compression", {
    size: formatArchiveBytes(archive.compressed_size),
    saved: saved.toFixed(0),
  });
}

function archiveDataTotal(archive: TaskArchive): number {
  return Object.values(archive.data_counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function archiveDate(value: string | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale);
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
  const { t: translate, i18n } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const rows = archives.reduce((sum, archive) => sum + archiveDataTotal(archive), 0);
  const bytes = archives.reduce((sum, archive) => sum + archive.compressed_size, 0);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translate("taskUI.confirmDeleteArchives", { count: archives.length })}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {translate("taskUI.deleteArchiveDetails", {
              size: formatArchiveBytes(bytes),
              rows: rows.toLocaleString(i18n.resolvedLanguage),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{translate("taskUI.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {translate("taskUI.permanentDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TaskArchivesPanel({ onChanged }: { onChanged: () => void }) {
  const { t: translate, liveT, i18n } = useLiveTranslation();
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
        const states = await Promise.allSettled(pending.map((id) => api.taskArchive(id)));
        let restored = false;
        states.forEach((state, index) => {
          if (state.status !== "rejected" || !(state.reason instanceof Error)) return;
          if (!state.reason.message.includes(liveT("taskUI.archiveNotFound"))) return;
          pendingRestoreIDs.current.delete(pending[index]);
          restored = true;
        });
        if (restored) onChanged();
      }
    } catch (error) {
      toast.error(liveT("taskUI.loadArchivesFailed", { message: taskError(error, liveT) }));
    } finally {
      setLoading(false);
    }
  }, [onChanged, page, pageSize, query, stateFilter, liveT]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2_000);
    return () => clearInterval(timer);
  }, [load]);

  const selectable = React.useMemo(
    () => archives.filter((archive) => !ARCHIVE_PROCESSING_STATES.has(archive.state)),
    [archives],
  );
  const selectedArchives = React.useMemo(
    () => archives.filter((archive) => selected.has(archive.id)),
    [archives, selected],
  );
  const restorable = selectedArchives.filter(
    (archive) => archive.state === "ready" || archive.state === "restore_failed",
  );
  const deletable = selectedArchives.filter(
    (archive) => archive.state === "ready" || archive.state === "delete_failed",
  );
  const selectedAll = selectable.length > 0 && selectable.every((archive) => selected.has(archive.id));
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
        if (item.ok && Number.isSafeInteger(archiveID) && archiveID > 0) pendingRestoreIDs.current.add(archiveID);
      }
      if (succeeded > 0) toast.success(translate("taskUI.tasksRestoreQueued", { count: succeeded }));
      if (failed > 0) toast.error(translate("taskUI.restoreFailures", { count: failed }));
      afterAction();
    } catch (error) {
      toast.error(translate("taskUI.restoreError", { message: taskError(error, translate) }));
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
      if (succeeded > 0) toast.success(translate("taskUI.archivesDeleteQueued", { count: succeeded }));
      if (failed > 0) toast.error(translate("taskUI.archiveDeleteFailures", { count: failed }));
      afterAction();
    } catch (error) {
      toast.error(translate("taskUI.permanentDeleteFailed", { message: taskError(error, translate) }));
      throw error;
    }
  }

  async function retry(archive: TaskArchive) {
    try {
      if (archive.state === "archive_failed") await api.archiveTask(String(archive.task_id));
      if (archive.state === "restore_failed") await api.restoreTaskArchive(archive.id);
      if (archive.state === "delete_failed") await api.deleteTaskArchive(archive.id);
      toast.success(translate("taskUI.requeued"));
      afterAction();
    } catch (error) {
      toast.error(translate("taskUI.retryFailed", { message: taskError(error, translate) }));
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
              placeholder={translate("taskUI.archiveSearch")}
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
            <SelectTrigger className="w-36">
              <SelectValue placeholder={translate("taskUI.processingState")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{translate("taskUI.allStates")}</SelectItem>
                <SelectItem value="archive_queued">{translate("taskUI.archiveQueued")}</SelectItem>
                <SelectItem value="archiving">{translate("taskUI.archiving")}</SelectItem>
                <SelectItem value="ready">{translate("taskUI.ready")}</SelectItem>
                <SelectItem value="restore_queued">{translate("taskUI.restoreQueued")}</SelectItem>
                <SelectItem value="restoring">{translate("taskUI.restoring")}</SelectItem>
                <SelectItem value="delete_queued">{translate("taskUI.deleteQueued")}</SelectItem>
                <SelectItem value="deleting">{translate("taskUI.deleting")}</SelectItem>
                <SelectItem value="archive_failed">{translate("taskUI.archiveFailed")}</SelectItem>
                <SelectItem value="restore_failed">{translate("taskUI.restoreFailed")}</SelectItem>
                <SelectItem value="delete_failed">{translate("taskUI.deleteFailed")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs tabular-nums">
            {translate("taskUI.archiveCount", { count: total })}
          </span>
          {selectedArchives.length > 0 && (
            <>
              <span className="text-xs tabular-nums">
                {translate("taskUI.selectedCount", { count: selectedArchives.length })}
              </span>
              {restorable.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => void restoreMany(restorable)}>
                  <Undo2Icon data-icon="inline-start" />
                  {translate("taskUI.restore")}
                  {restorable.length}
                </Button>
              )}
              {deletable.length > 0 && (
                <ArchiveDeleteDialog
                  archives={deletable}
                  onConfirm={() => deleteMany(deletable)}
                  trigger={
                    <Button size="sm" variant="destructive">
                      <Trash2Icon data-icon="inline-start" />
                      {translate("taskUI.permanentDelete")}
                      {deletable.length}
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
              <EmptyTitle>{translate("taskUI.noArchives")}</EmptyTitle>
              <EmptyDescription>{translate("taskUI.noArchivesHelp")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
            <TableHeader className="[&_tr]:border-t">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedAll || (selectedSome ? "indeterminate" : false)}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? new Set(selectable.map((archive) => archive.id)) : new Set())
                    }
                    aria-label={translate("taskUI.selectArchivePage")}
                  />
                </TableHead>
                <TableHead>{translate("taskUI.task")}</TableHead>
                <TableHead>{translate("taskUI.originalState")}</TableHead>
                <TableHead>{translate("taskUI.categoryLabel")}</TableHead>
                <TableHead>{translate("taskUI.archivedAt")}</TableHead>
                <TableHead>{translate("taskUI.compressedSize")}</TableHead>
                <TableHead>{translate("taskUI.dataCount")}</TableHead>
                <TableHead className="min-w-44">{translate("taskUI.processingState")}</TableHead>
                <TableHead className="text-right">{translate("taskUI.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.map((archive) => {
                const processing = ARCHIVE_PROCESSING_STATES.has(archive.state);
                const canRestore = archive.state === "ready" || archive.state === "restore_failed";
                const canDelete = archive.state === "ready" || archive.state === "delete_failed";
                return (
                  <TableRow key={archive.id} data-state={selected.has(archive.id) ? "selected" : undefined}>
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
                        aria-label={translate("taskUI.selectArchive", { id: archive.task_id })}
                      />
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          {archive.task_name ||
                            archive.task_description ||
                            translate("taskUI.taskId", { id: archive.task_id })}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          #{archive.task_id} · {archive.task_description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge domain="task" value={archive.original_status} dot />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {archive.category_name || translate("taskUI.uncategorized")}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                      {archiveDate(archive.archived_at || archive.requested_at, i18n.resolvedLanguage ?? "zh-CN")}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs"
                      title={translate("taskUI.beforeCompression", { size: formatArchiveBytes(archive.original_size) })}
                    >
                      {archiveCompressionLabel(archive, translate)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{archiveDataTotal(archive).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <ArchiveStateBadge state={archive.state} />
                        {processing && <Progress value={archive.progress} />}
                        {archive.error && (
                          <p className="text-destructive text-xs [overflow-wrap:anywhere]">
                            {taskError(archive.error, translate)}
                          </p>
                        )}
                        {[...new Set(archive.warnings ?? [])].map((warning) => (
                          <p
                            key={taskError(warning, translate)}
                            className="text-amber-700 text-xs [overflow-wrap:anywhere] dark:text-amber-400"
                          >
                            {warning}
                          </p>
                        ))}
                        <span className="text-muted-foreground text-xs">
                          {translate(`taskUI.phase.${archive.phase}`, { defaultValue: archive.phase })} ·{" "}
                          {archive.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        {ARCHIVE_FAILED_STATES.has(archive.state) && (
                          <TaskActionTooltip
                            label={translate("taskUI.retryArchive")}
                            description={translate("taskUI.retryArchiveHelp")}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void retry(archive)}
                              aria-label={translate("taskUI.retryArchive")}
                            >
                              <Undo2Icon />
                            </Button>
                          </TaskActionTooltip>
                        )}
                        {canRestore && (
                          <TaskActionTooltip
                            label={translate("taskUI.restoreTask")}
                            description={translate("taskUI.restoreHelp")}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void restoreMany([archive])}
                              aria-label={translate("taskUI.restoreTask")}
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
                                  <Button size="icon" variant="ghost" aria-label={translate("taskUI.deleteArchive")}>
                                    <Trash2Icon />
                                  </Button>
                                </TooltipTrigger>
                              }
                            />
                            <TooltipContent
                              side="top"
                              sideOffset={6}
                              className="block max-w-64 space-y-1 text-left leading-relaxed"
                            >
                              <p className="font-medium">{translate("taskUI.deleteArchive")}</p>
                              <p>{translate("taskUI.deleteArchiveHelp")}</p>
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
  const { t: translate } = useLiveTranslation();
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
      <FieldLegend variant="label">{translate("taskUI.cleanup")}</FieldLegend>
      <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-all-${idPrefix}`}
            checked={allChecked}
            onCheckedChange={(checked) => updateAllOptions(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-all-${idPrefix}`}>{translate("taskUI.deleteAll")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteAllHelp")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-assets-${idPrefix}`}
            checked={options.delete_assets}
            onCheckedChange={(checked) => updateOption("delete_assets", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-assets-${idPrefix}`}>{translate("taskUI.linkedAssets")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteAssetsHelp")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-traffic-${idPrefix}`}
            checked={options.delete_traffic}
            onCheckedChange={(checked) => updateOption("delete_traffic", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-traffic-${idPrefix}`}>{translate("taskUI.linkedTraffic")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteTrafficHelp")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-files-${idPrefix}`}
            checked={options.delete_files}
            onCheckedChange={(checked) => updateOption("delete_files", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-files-${idPrefix}`}>{translate("taskUI.taskFiles")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteFilesHelp")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-findings-${idPrefix}`}
            checked={options.delete_findings}
            onCheckedChange={(checked) => updateOption("delete_findings", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-findings-${idPrefix}`}>{translate("taskUI.linkedFindings")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteFindingsHelp")}</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`delete-llm-records-${idPrefix}`}
            checked={options.delete_llm_records}
            onCheckedChange={(checked) => updateOption("delete_llm_records", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`delete-llm-records-${idPrefix}`}>{translate("taskUI.llmRecords")}</FieldLabel>
            <FieldDescription>{translate("taskUI.deleteLLMHelp")}</FieldDescription>
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
  const { t: translate } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [options, setOptions] = React.useState<DeleteTaskOptions>(emptyDeleteOptions);

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
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <TaskActionTooltip label={translate("taskUI.deleteTask")} description={translate("taskUI.deleteTaskHelp")}>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="outline" aria-label={translate("taskUI.deleteTask")}>
            <Trash2Icon className="text-destructive" />
          </Button>
        </AlertDialogTrigger>
      </TaskActionTooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translate("taskUI.confirmDeleteTask", { id: task.id })}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {translate("taskUI.deleteTaskDetails", {
              name: task.description
                ? task.description.length > 80
                  ? `${task.description.slice(0, 80)}…`
                  : task.description
                : translate("taskUI.thisTask"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DeleteOptionFields idPrefix={task.id} options={options} onOptionsChange={setOptions} disabled={deleting} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{translate("taskUI.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting ? translate("taskUI.deleting") : translate("taskUI.delete")}
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
  const { t: translate } = useLiveTranslation();
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
          <FolderInputIcon data-icon="inline-start" /> {translate("taskUI.changeCategory")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("taskUI.moveCategoryTitle", { count })}</DialogTitle>
          <DialogDescription>{translate("taskUI.changeCategoryHelp")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="bulk-category">{translate("taskUI.targetCategory")}</FieldLabel>
          <Select value={target} onValueChange={setTarget} disabled={moving}>
            <SelectTrigger id="bulk-category" className="w-full">
              <SelectValue placeholder={translate("taskUI.selectCategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={UNCATEGORIZED_VALUE}>{translate("taskUI.uncategorized")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {categories.length === 0 && <FieldDescription>{translate("taskUI.noCategoriesHelp")}</FieldDescription>}
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={moving}>
              {translate("taskUI.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={moving}
            onClick={() => {
              void onMove(target === UNCATEGORIZED_VALUE ? undefined : Number(target)).then(() => setOpen(false));
            }}
          >
            {moving && <Spinner data-icon="inline-start" />}
            {translate("taskUI.move")}
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
  onDelete: (ids: string[], options: DeleteTaskOptions, onProgress: (done: number) => void) => Promise<void>;
}) {
  const { t: translate } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [options, setOptions] = React.useState<DeleteTaskOptions>(emptyDeleteOptions);

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
          <Trash2Icon className="text-destructive" /> {translate("taskUI.deleteSelectedCount", { count: ids.length })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{translate("taskUI.confirmDeleteSelected", { count: ids.length })}</AlertDialogTitle>
          <AlertDialogDescription>{translate("taskUI.deleteSelectedHelp")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
          {ids.slice(0, 30).map((id) => (
            <code key={id} className="bg-muted rounded px-1.5 py-0.5 font-mono">
              #{id}
            </code>
          ))}
          {ids.length > 30 && (
            <span className="self-center">{translate("taskUI.moreSelected", { count: ids.length })}</span>
          )}
        </div>
        <DeleteOptionFields idPrefix="bulk" options={options} onOptionsChange={setOptions} disabled={deleting} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{translate("taskUI.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting
              ? translate("taskUI.deleteProgress", { done: done, total: ids.length })
              : translate("taskUI.deleteTasks", { count: ids.length })}
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
  const { t: translate } = useLiveTranslation();
  const tasksByID = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskIDs = React.useMemo(() => tasks.map((task) => task.id), [tasks]);
  const atLimit = value.length >= MAX_SOURCE_TASKS;

  const handleValueChange = (next: string[]) => {
    onValueChange(next.slice(0, MAX_SOURCE_TASKS));
  };

  return (
    <Combobox
      items={taskIDs}
      itemToStringValue={(taskID) => {
        const task = tasksByID.get(taskID);
        return task ? `${task.id} ${task.description} ${task.goal}` : taskID;
      }}
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
          placeholder={
            atLimit ? translate("taskUI.sourceLimit", { count: MAX_SOURCE_TASKS }) : translate("taskUI.sourceSearch")
          }
          disabled={atLimit}
        />
      </ComboboxChips>
      <ComboboxContent portalContainer={portalContainer}>
        <ComboboxEmpty>{translate("taskUI.sourceNoMatches")}</ComboboxEmpty>
        <ComboboxList>
          {(taskID) => {
            const task = tasksByID.get(taskID);
            return (
              <ComboboxItem key={taskID} value={taskID} disabled={atLimit && !value.includes(taskID)}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      #{taskID} · {task?.description ?? translate("taskUI.unknownTask")}
                    </p>
                    {task?.goal && <p className="text-muted-foreground truncate text-xs">{task.goal}</p>}
                  </div>
                  {task && <StatusBadge domain="task" value={task.status} stopReason={task.stop_reason} />}
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
  const { t: translate } = useLiveTranslation();
  const [inputValue, setInputValue] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  // 新建的分类要等父层重新拉取才回流到 categories，先本地留一份，避免选中的 chip 和
  // 下拉在这段窗口里显示成「未知分类」。
  const [localExtra, setLocalExtra] = React.useState<TaskCategory[]>([]);

  const allCategories = React.useMemo(() => {
    const byID = new Map<number, TaskCategory>();
    for (const category of categories) byID.set(category.id, category);
    for (const category of localExtra) if (!byID.has(category.id)) byID.set(category.id, category);
    return [...byID.values()];
  }, [categories, localExtra]);

  const byID = React.useMemo(() => new Map(allCategories.map((c) => [String(c.id), c])), [allCategories]);
  const categoryIDs = React.useMemo(() => allCategories.map((c) => String(c.id)), [allCategories]);
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
      toast.success(translate("taskUI.categoryCreatedName", { name: created.name }));
    } catch (e) {
      toast.error(translate("taskUI.createCategoryFailed", { message: taskError(e, translate) }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Combobox
      items={categoryIDs}
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
            <ComboboxChip key={id}>{byID.get(id)?.name ?? translate("taskUI.unknownCategory")}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id="task-category"
          placeholder={selectedIDs.length ? "" : translate("taskUI.categorySearch")}
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
              {translate("taskUI.createCategoryName", { name: trimmed })}
            </button>
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">{translate("taskUI.categorySearchHelp")}</div>
          ))}
      </ComboboxContent>
    </Combobox>
  );
}

const COMPANY_SCOPE_LABELS: Record<string, string> = {
  domain: "taskUI.domain",
  ip: "IP",
  cidr: "CIDR",
  icp: "ICP",
  keyword: "taskUI.keyword",
};

function companyScopeSummary(company: Company, translate: TFunction): string {
  const rows = company.scope ?? [];
  if (rows.length === 0) return translate("taskUI.noScope");
  const preview = rows.slice(0, 3).map((row) => {
    const value = row.raw || row.value || row.domain || row.net || "";
    return `${translate(COMPANY_SCOPE_LABELS[row.kind] ?? row.kind)}: ${value}`;
  });
  return `${preview.join(" · ")}${rows.length > preview.length ? translate("taskUI.scopeMore", { count: rows.length - preview.length }) : ""}`;
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
  const { t: translate } = useLiveTranslation();
  const companiesByID = React.useMemo(
    () => new Map(companies.map((company) => [String(company.id), company])),
    [companies],
  );
  const companyIDs = React.useMemo(() => companies.map((company) => String(company.id)), [companies]);
  const selectedIDs = React.useMemo(() => value.map(String), [value]);

  return (
    <Combobox
      items={companyIDs}
      itemToStringValue={(companyID) => {
        const company = companiesByID.get(companyID);
        return company ? `${company.name} ${companyScopeSummary(company, translate)}` : companyID;
      }}
      multiple
      value={selectedIDs}
      onValueChange={(next) => onValueChange(next.map(Number).filter(Number.isFinite))}
    >
      <ComboboxChips>
        <ComboboxValue>
          {selectedIDs.map((companyID) => (
            <ComboboxChip key={companyID}>
              {companiesByID.get(companyID)?.name ?? translate("taskUI.companyId", { id: companyID })}
            </ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput id="task-companies" placeholder={translate("taskUI.companySearch")} />
      </ComboboxChips>
      <ComboboxContent portalContainer={portalContainer}>
        <ComboboxEmpty>{translate("taskUI.companyNoMatches")}</ComboboxEmpty>
        <ComboboxList>
          {(companyID) => {
            const company = companiesByID.get(companyID);
            return (
              <ComboboxItem key={companyID} value={companyID}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {company?.name ?? translate("taskUI.companyId", { id: companyID })}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {translate("taskUI.assetCount", { count: company?.asset_count ?? 0 })}
                    </span>
                  </div>
                  {company && (
                    <span
                      className="text-muted-foreground truncate text-xs"
                      title={companyScopeSummary(company, translate)}
                    >
                      {companyScopeSummary(company, translate)}
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
  const { t: translate } = useLiveTranslation();
  const { isOver, setNodeRef } = useDroppable({
    id: `category:${value}`,
    disabled,
  });

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
      <span className="block truncate text-muted-foreground text-xs">
        {isOver ? translate("taskUI.dropToMove") : translate("taskUI.taskCount", { count: count })}
      </span>
    </button>
  );
}

function DraggableCategoryTask({ task, disabled, moving }: { task: Task; disabled: boolean; moving: boolean }) {
  const { t: translate } = useLiveTranslation();
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: `task:${task.id}`,
    disabled,
  });

  return (
    <Item ref={setNodeRef} variant="outline" size="sm" className={cn(isDragging && "opacity-40")}>
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0">
        {moving ? (
          <Spinner />
        ) : (
          <TaskActionTooltip
            label={translate("taskUI.moveCategory")}
            description={translate("taskUI.dragHelp")}
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
              aria-label={translate("taskUI.dragTask", { id: task.id })}
            >
              <GripVerticalIcon />
            </Button>
          </TaskActionTooltip>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0">
          <Link href={`/function/tasks/detail?id=${encodeURIComponent(task.id)}`} className="truncate hover:underline">
            {task.name?.trim() || task.description || translate("taskUI.taskId", { id: task.id })}
          </Link>
        </ItemTitle>
        <ItemDescription className="line-clamp-1">
          #{task.id} · {task.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <StatusBadge domain="task" value={task.status} stopReason={task.stop_reason} />
      </ItemActions>
    </Item>
  );
}

function CategoryTaskDragPreview({ task }: { task: Task }) {
  const { t: translate } = useLiveTranslation();
  return (
    <Item variant="outline" size="sm" className="w-80 bg-background shadow-lg">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0">
        <GripVerticalIcon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0 truncate">
          {task.name?.trim() || task.description || translate("taskUI.taskId", { id: task.id })}
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
  const { t: translate } = useLiveTranslation();
  const [open, setOpen] = React.useState(false);
  const [selectedView, setSelectedView] = React.useState<CategoryManagementView>("new");
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
      typeof selectedView === "number" ? (categories.find((category) => category.id === selectedView) ?? null) : null,
    [categories, selectedView],
  );

  const uncategorizedCount = React.useMemo(() => tasks.filter((task) => task.category_id == null).length, [tasks]);

  const visibleTasks = React.useMemo(() => {
    if (selectedView === "uncategorized") return tasks.filter((task) => task.category_id == null);
    if (typeof selectedView === "number") return tasks.filter((task) => task.category_id === selectedView);
    return [];
  }, [selectedView, tasks]);

  const activeTask = React.useMemo(() => tasks.find((task) => task.id === activeTaskID) ?? null, [activeTaskID, tasks]);

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
        toast.success(translate("taskUI.categoryCreated"));
      } else {
        const updated = await api.renameTaskCategory(selectedView, name);
        setDraftName(updated.name);
        toast.success(translate("taskUI.categoryUpdated"));
      }
      onChanged();
    } catch (error) {
      toast.error(
        translate("taskUI.categorySaveFailed", {
          action: selectedView === "new" ? translate("taskUI.create") : translate("taskUI.updateAction"),
          message: taskError(error, translate),
        }),
      );
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
      toast.success(translate("taskUI.categoryDeleted"));
      setDeleteOpen(false);
      onChanged();
    } catch (error) {
      toast.error(translate("taskUI.deleteCategoryFailed", { message: taskError(error, translate) }));
    } finally {
      setDeleting(false);
    }
  }

  async function moveTask(task: Task, destination: string) {
    if (movingTaskID) return;
    const category =
      destination === "uncategorized" ? null : (categories.find((item) => item.id === Number(destination)) ?? null);
    if (destination !== "uncategorized" && !category) {
      toast.error(translate("taskUI.targetCategoryMissing"));
      return;
    }
    if (task.category_id === category?.id || (task.category_id == null && category == null)) return;

    setMovingTaskID(task.id);
    try {
      await api.updateTaskCategory(task.id, category?.id);
      onTaskMoved(task.id, category);
      toast.success(
        translate("taskUI.taskMoved", { id: task.id, category: category?.name ?? translate("taskUI.uncategorized") }),
      );
    } catch (error) {
      toast.error(translate("taskUI.moveTaskFailed", { message: taskError(error, translate) }));
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
    const taskID = activeID.startsWith("task:") ? activeID.slice("task:".length) : null;
    setActiveTaskID(null);
    if (!taskID || !event.over) return;
    const destination = String(event.over.id);
    if (!destination.startsWith("category:")) return;
    const task = tasks.find((item) => item.id === taskID);
    if (!task) return;
    void moveTask(task, destination.slice("category:".length));
  }

  const saveLabel = saving
    ? translate("taskUI.saving")
    : selectedView === "new"
      ? translate("taskUI.createCategory")
      : translate("taskUI.saveChanges");

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="sm" variant="outline">
            <TagsIcon data-icon="inline-start" />
            {translate("taskUI.manageCategories")}
          </Button>
        </SheetTrigger>
        <SheetContent className="grid h-full w-full! max-w-none! grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[48rem]! sm:max-w-[48rem]!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{translate("taskUI.categoryManagement")}</SheetTitle>
            <SheetDescription>{translate("taskUI.categoryManagementHelp")}</SheetDescription>
          </SheetHeader>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveTaskID(null)}
            onDragEnd={handleDragEnd}
          >
            <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-hidden">
              <div className="flex min-h-0 flex-col border-b p-3 lg:border-r lg:border-b-0">
                <Button type="button" variant="outline" className="w-full" onClick={startNew}>
                  <PlusIcon data-icon="inline-start" />
                  {translate("taskUI.newCategory")}
                </Button>
                <ScrollArea className="mt-2 max-h-44 lg:max-h-none lg:flex-1">
                  <div className="flex flex-col gap-1 pr-2">
                    <CategoryDropTarget
                      value="uncategorized"
                      name={translate("taskUI.uncategorized")}
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
                      <FieldLabel htmlFor="task-category-name">{translate("taskUI.categoryName")}</FieldLabel>
                      <Input
                        id="task-category-name"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder={translate("taskUI.categoryExample")}
                        maxLength={80}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveCategory();
                        }}
                      />
                      <FieldDescription>
                        {selectedCategory
                          ? translate("taskUI.categoryUsed", { count: selectedCategory.task_count })
                          : translate("taskUI.categoryCreateHelp")}
                      </FieldDescription>
                    </Field>
                  )}
                  {selectedView !== "new" && (
                    <Field>
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <FieldLabel>
                            {selectedCategory
                              ? translate("taskUI.categoryTasks")
                              : translate("taskUI.uncategorizedTasks")}
                          </FieldLabel>
                          <FieldDescription>
                            {selectedCategory
                              ? translate("taskUI.categoryContains", { count: visibleTasks.length })
                              : translate("taskUI.uncategorizedCount", { count: visibleTasks.length })}
                          </FieldDescription>
                        </div>
                      </div>
                      {visibleTasks.length === 0 ? (
                        <Empty className="min-h-36 border">
                          <EmptyHeader>
                            <EmptyTitle>
                              {selectedCategory
                                ? translate("taskUI.categoryEmpty")
                                : translate("taskUI.uncategorizedEmpty")}
                            </EmptyTitle>
                            <EmptyDescription>{translate("taskUI.categoryEmptyHelp")}</EmptyDescription>
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
            <DragOverlay>{activeTask ? <CategoryTaskDragPreview task={activeTask} /> : null}</DragOverlay>
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
                {translate("taskUI.deleteCategory")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {translate("taskUI.close")}
            </Button>
            {selectedView !== "uncategorized" && (
              <Button
                type="button"
                disabled={!draftName.trim() || saving || deleting}
                onClick={() => void saveCategory()}
              >
                {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                {saveLabel}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("taskUI.confirmDeleteCategory", {
                name: selectedCategory?.name || translate("taskUI.untitledCategory"),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate("taskUI.deleteCategoryDetails", { count: selectedCategory?.task_count ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{translate("taskUI.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteCategory();
              }}
            >
              {deleting && <Spinner data-icon="inline-start" />}
              {deleting ? translate("taskUI.deleting") : translate("taskUI.delete")}
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
  const { t: translate } = useLiveTranslation();
  const scheduleEnabledID = React.useId();
  const scheduleImmediateID = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [categoryID, setCategoryID] = React.useState<number | undefined>(undefined);
  const [description, setDescription] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [selectedTemplateID, setSelectedTemplateID] = React.useState<number | null>(null);
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [sourceTaskIDs, setSourceTaskIDs] = React.useState<string[]>([]);
  const [companyIDs, setCompanyIDs] = React.useState<number[]>([]);
  const [llmProfileIDs, setLLMProfileIDs] = React.useState<string[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [timeoutMin, setTimeoutMin] = React.useState(""); // 任务级超时(分钟);空/0 = 不限时
  const [noResultMin, setNoResultMin] = React.useState("");
  const [noResultCount, setNoResultCount] = React.useState("1");
  const [noResultSeverity, setNoResultSeverity] = React.useState<NonNullable<Task["no_result_min_severity"]>>("");
  const [heartbeatMin, setHeartbeatMin] = React.useState("10"); // planner 心跳(分钟);默认10,下限10(与后端一致)
  const [seedFirstIntent, setSeedFirstIntent] = React.useState(false); // 创建时下发种子意图,worker 免等首轮 planner 直接开跑;默认关闭,走标准先规划再执行
  const [shareGlobalAssets, setShareGlobalAssets] = React.useState(false);
  const [coverageEnabled, setCoverageEnabled] = React.useState(true); // 资产覆盖度功能;默认开。关闭=不计算/展示覆盖度、不累积范围、隐藏范围类工具(company 关联不受影响)
  const [workerCount, setWorkerCount] = React.useState(""); // 本任务 Worker 数;空/0=用全局默认
  const [interceptRules, setInterceptRules] = React.useState<AssetInterceptRuleInput[]>([]); // 任务级资产拦截规则(仅本任务生效,不进全局表)
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ScheduleInput>({
    name: "",
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
        globalThis.crypto?.randomUUID?.() ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    setUploading(true);
    try {
      const r = await api.chatUpload("staging", draftIdRef.current, Array.from(files));
      setDescription((prev) => appendUploads(prev, r.attachments));
      setUploadCount((n) => n + r.attachments.length);
    } catch (e) {
      toast.error(translate("taskUI.uploadError", { message: taskError(e, translate) }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-picking the same file
    }
  }

  async function createTask() {
    if (!description.trim() || !goal.trim()) {
      toast.error(translate("taskUI.descriptionGoalRequired"));
      return;
    }
    if (sourceTaskIDs.length > MAX_SOURCE_TASKS) {
      toast.error(translate("taskUI.sourceTaskLimit", { count: MAX_SOURCE_TASKS }));
      return;
    }
    const workerCountNum = parseWorkerCountInput(workerCount);
    if (workerCountNum == null) {
      toast.error(translate("taskUI.invalidWorkers", { max: MAX_TASK_WORKER_COUNT }));
      return;
    }
    setCreating(true);
    try {
      const timeoutSec = Math.max(0, Math.floor(Number(timeoutMin) || 0)) * 60;
      const heartbeatSec = Math.max(10, Math.floor(Number(heartbeatMin) || 10)) * 60; // 下限 10min，与后端归一一致
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
        noResultSeconds: Math.max(0, Math.floor((Number(noResultMin) || 0) * 60)),
        noResultMinFindings: Math.max(1, Math.floor(Number(noResultCount) || 1)),
        noResultMinSeverity: noResultSeverity,
        seedFirstIntent,
        planHeartbeatSeconds: heartbeatSec,
        coverageEnabled,
        shareGlobalAssets,
        workerCount: workerCountNum,
        schedule: scheduleEnabled
          ? { ...schedule, name: schedule.name.trim() || translate("taskUI.defaultSchedule"), task_ids: [] }
          : undefined,
        interceptRules: interceptRules
          .map((r) => ({ ...r, pattern: r.pattern.trim() }))
          .filter((r) => r.pattern !== ""),
      });
      toast.success(translate("taskUI.taskCreated"));
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
      setNoResultMin("");
      setNoResultCount("1");
      setNoResultSeverity("");
      setHeartbeatMin("10");
      setSeedFirstIntent(false);
      setCoverageEnabled(true);
      setShareGlobalAssets(false);
      setWorkerCount("");
      setInterceptRules([]);
      setScheduleEnabled(false);
      setSchedule({
        name: translate("taskUI.defaultSchedule"),
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
      toast.error(translate("taskUI.createError", { message: taskError(e, translate) }));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <PlusIcon /> {translate("taskUI.newTask")}
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
          <SheetTitle>{translate("taskUI.newTask")}</SheetTitle>
          <SheetDescription>{translate("taskUI.newTaskHelp")}</SheetDescription>
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
                setWorkerCount(template.worker_count ? String(template.worker_count) : "");
                setUploadCount(0);
              }}
              portalContainer={sheetContentRef}
            />
            <div className="grid gap-2">
              <Label htmlFor="name">{translate("taskUI.nameOptional")}</Label>
              <Input
                id="name"
                placeholder={translate("taskUI.nameExample")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="remark">{translate("taskUI.remarkOptional")}</Label>
              <Textarea
                id="remark"
                className="min-h-20"
                maxLength={MAX_TASK_REMARK_RUNES}
                placeholder={translate("taskUI.remarkExample")}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
            <Field>
              <FieldLabel htmlFor="task-category">{translate("taskUI.category")}</FieldLabel>
              <CategoryPicker
                categories={categories}
                value={categoryID}
                onValueChange={setCategoryID}
                onCategoryCreated={onCategoriesChanged}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{translate("taskUI.categoryHelp")}</FieldDescription>
            </Field>
            <FieldSet>
              <FieldLegend>{translate("taskUI.scheduleOptional")}</FieldLegend>
              <label htmlFor={scheduleEnabledID} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={scheduleEnabledID}
                  checked={scheduleEnabled}
                  onCheckedChange={(v) => setScheduleEnabled(!!v)}
                />
                {translate("taskUI.scheduleEnable")}
              </label>
              {scheduleEnabled && (
                <FieldGroup className="rounded-lg border p-3">
                  <Field>
                    <FieldLabel>{translate("taskUI.scheduleName")}</FieldLabel>
                    <Input
                      placeholder={translate("taskUI.defaultSchedule")}
                      value={schedule.name}
                      onChange={(e) => setSchedule({ ...schedule, name: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>{translate("taskUI.rule")}</FieldLabel>
                      <Select
                        value={schedule.schedule_type}
                        onValueChange={(value) =>
                          setSchedule({
                            ...schedule,
                            schedule_type: value as ScheduleInput["schedule_type"],
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">{translate("taskUI.weekly")}</SelectItem>
                          <SelectItem value="once">{translate("taskUI.once")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>{translate("taskUI.timezone")}</FieldLabel>
                      <Select
                        value={schedule.timezone_mode}
                        onValueChange={(value) =>
                          setSchedule({
                            ...schedule,
                            timezone_mode: value as ScheduleInput["timezone_mode"],
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beijing">{translate("taskUI.beijing")}</SelectItem>
                          <SelectItem value="system">{translate("taskUI.systemTimezone")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {schedule.schedule_type === "once" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <FieldLabel>{translate("taskUI.startDate")}</FieldLabel>
                        <DateSelect
                          value={schedule.run_date ?? ""}
                          onValueChange={(value) => setSchedule({ ...schedule, run_date: value })}
                          aria-label={translate("taskUI.startDate")}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{translate("taskUI.endDateOptional")}</FieldLabel>
                        <DateSelect
                          value={schedule.end_date ?? ""}
                          onValueChange={(value) => setSchedule({ ...schedule, end_date: value })}
                          optional
                          placeholder={translate("taskUI.noEndDate")}
                          aria-label={translate("taskUI.endDateAccessible")}
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field>
                      <FieldLabel>{translate("taskUI.weekdays")}</FieldLabel>
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
                        placeholder={translate("taskUI.weekdaysExample")}
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>{translate("taskUI.startTime")}</FieldLabel>
                      <TimeSelect
                        value={schedule.start_time}
                        onValueChange={(value) => setSchedule({ ...schedule, start_time: value })}
                        aria-label={translate("taskUI.startTime")}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>{translate("taskUI.endTimeOptional")}</FieldLabel>
                      <TimeSelect
                        value={schedule.end_time ?? ""}
                        onValueChange={(value) => setSchedule({ ...schedule, end_time: value })}
                        optional
                        aria-label={translate("taskUI.endTimeAccessible")}
                      />
                    </Field>
                  </div>
                  <label htmlFor={scheduleImmediateID} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={scheduleImmediateID}
                      checked={schedule.start_immediately}
                      onCheckedChange={(v) => setSchedule({ ...schedule, start_immediately: !!v })}
                    />
                    {translate("taskUI.startImmediately")}
                  </label>
                </FieldGroup>
              )}
            </FieldSet>
            <div className="grid gap-2">
              <Label htmlFor="description">{translate("taskUI.description")}</Label>
              <Textarea
                id="description"
                className="min-h-32"
                placeholder={translate("taskUI.descriptionExample")}
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
                  {translate("taskUI.upload")}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {uploadCount > 0
                    ? translate("taskUI.uploaded", { count: uploadCount })
                    : translate("taskUI.uploadHelp")}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal">{translate("taskUI.goal")}</Label>
              <Textarea
                id="goal"
                className="min-h-32"
                placeholder={translate("taskUI.goalExample")}
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
                <Label htmlFor="share-global-assets">{translate("taskUI.shareGlobal")}</Label>
              </div>
              <FieldDescription>{translate("taskUI.shareGlobalHelp")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="source-tasks">{translate("taskUI.linkedTasks")}</FieldLabel>
              <SourceTaskPicker
                tasks={tasks}
                value={sourceTaskIDs}
                onValueChange={setSourceTaskIDs}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{translate("taskUI.sourceHelp", { count: MAX_SOURCE_TASKS })}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-companies">{translate("taskUI.companyScope")}</FieldLabel>
              <CompanyPicker
                companies={companies}
                value={companyIDs}
                onValueChange={setCompanyIDs}
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{translate("taskUI.companyScopeHelp")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-intercept-rules">{translate("taskUI.interceptOptional")}</FieldLabel>
              <AssetInterceptRulesEditor value={interceptRules} onChange={setInterceptRules} />
              <FieldDescription>{translate("taskUI.interceptHelp")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="llm-profiles">{translate("taskUI.llmChain")}</FieldLabel>
              <TaskLLMProfileChain
                profiles={profiles}
                value={llmProfileIDs}
                onValueChange={setLLMProfileIDs}
                inputId="llm-profiles"
                portalContainer={sheetContentRef}
              />
              <FieldDescription>{translate("taskUI.llmChainHelp")}</FieldDescription>
            </Field>

            {/* 高级参数默认折叠:超时/心跳/首个意图,展开才占空间,常用路径保持清爽。 */}
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center gap-2 border-t pt-4 text-sm font-medium">
                <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-90" />
                {translate("taskUI.advanced")}
                <span className="text-muted-foreground ml-auto text-xs font-normal">
                  {translate("taskUI.advancedSummary")}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-5 pt-5">
                <div className="grid gap-2">
                  <Label htmlFor="timeout-min">{translate("taskUI.timeoutOptional")}</Label>
                  <Input
                    id="timeout-min"
                    type="number"
                    min={0}
                    className="w-40"
                    placeholder={translate("taskUI.noTimeout")}
                    value={timeoutMin}
                    onChange={(e) => setTimeoutMin(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{translate("taskUI.timeoutHelp")}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="no-result-min">{translate("taskUI.noResultOptional")}</Label>
                  <Input
                    id="no-result-min"
                    type="number"
                    min={0}
                    className="w-40"
                    placeholder="120"
                    value={noResultMin}
                    onChange={(e) => setNoResultMin(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{translate("taskUI.noResultHelp")}</p>
                </div>
                {Number(noResultMin) > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="no-result-count">{translate("taskUI.noResultCount")}</Label>
                      <Input
                        id="no-result-count"
                        type="number"
                        min={1}
                        step={1}
                        value={noResultCount}
                        onChange={(e) => setNoResultCount(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="no-result-severity">{translate("taskUI.noResultSeverity")}</Label>
                      <Select
                        value={noResultSeverity || "any"}
                        onValueChange={(v) =>
                          setNoResultSeverity((v === "any" ? "" : v) as NonNullable<Task["no_result_min_severity"]>)
                        }
                      >
                        <SelectTrigger id="no-result-severity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">{translate("taskUI.noResultAnySeverity")}</SelectItem>
                          <SelectItem value="low">{translate("taskUI.noResultLow")}</SelectItem>
                          <SelectItem value="medium">{translate("taskUI.noResultMedium")}</SelectItem>
                          <SelectItem value="high">{translate("taskUI.noResultHigh")}</SelectItem>
                          <SelectItem value="critical">{translate("taskUI.noResultCritical")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="heartbeat-min">{translate("taskUI.heartbeat")}</Label>
                  <Input
                    id="heartbeat-min"
                    type="number"
                    min={10}
                    className="w-40"
                    placeholder={translate("taskUI.defaultTen")}
                    value={heartbeatMin}
                    onChange={(e) => setHeartbeatMin(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{translate("taskUI.heartbeatHelp")}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="worker-count">{translate("taskUI.workerCount")}</Label>
                  <Input
                    id="worker-count"
                    type="number"
                    min={0}
                    max={MAX_TASK_WORKER_COUNT}
                    className="w-40"
                    placeholder={translate("taskUI.globalDefault")}
                    value={workerCount}
                    onChange={(e) => setWorkerCount(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{translate("taskUI.workerCountHelp")}</p>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="seed-first-intent" className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="seed-first-intent"
                      checked={seedFirstIntent}
                      onCheckedChange={(v) => setSeedFirstIntent(!!v)}
                    />
                    {translate("taskUI.seedIntent")}
                  </label>
                  <p className="text-muted-foreground text-xs">{translate("taskUI.seedIntentHelp")}</p>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="coverage-enabled" className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="coverage-enabled"
                      checked={coverageEnabled}
                      onCheckedChange={(v) => setCoverageEnabled(!!v)}
                    />
                    {translate("taskUI.coverage")}
                  </label>
                  <p className="text-muted-foreground text-xs">{translate("taskUI.coverageHelp")}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <SheetClose asChild>
            <Button variant="outline">{translate("taskUI.cancel")}</Button>
          </SheetClose>
          <Button onClick={createTask} disabled={creating || uploading}>
            {creating && <Spinner data-icon="inline-start" />}
            {creating ? translate("taskUI.creating") : translate("taskUI.create")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
