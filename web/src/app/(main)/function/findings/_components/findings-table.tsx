"use client";
import * as React from "react";

import Link from "next/link";

import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlaskConicalIcon,
  FolderIcon,
  FolderOpenIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CopyButton } from "@/components/copy-button";
import { FindingCaseMembers, FindingSeverityCounts } from "@/components/finding-case-list";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { statusMeta } from "@/lib/status";
import type {
  ActiveFindingRetest,
  Finding,
  FindingAsset,
  FindingCaseListRow,
  FindingStatus,
  Severity,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export const FINDING_STATUSES: FindingStatus[] = [
  "pending",
  "in_progress",
  "confirmed",
  "resolved",
  "fixed",
  "false_positive",
  "ignored",
  "duplicate",
  "risk_accepted",
];

export const UNASSIGNED_TASK = "__unassigned__";

// 行内编辑缓冲:当前展开行的名称/类别/严重等级。
export interface FindingEdit {
  name: string;
  vulnclass: string;
  severity: Severity;
}

export type FindingReport = { status: "loading" | "done" | "error"; text: string };

function isStructuredReproductionReport(report: string) {
  return (
    /^##\s+(?:复现步骤|测试过程|复现过程)\s*$/im.test(report) && /^\s*(?:###\s*)?步骤\s*\d+[.、:：)）]/im.test(report)
  );
}

// Exploration node ids are only unique inside a task. Prefer the persisted
// finding id and otherwise namespace the node id by task so editing one group
// cannot update a similarly-named node in another expanded group.
export function findingRowKey(finding: Finding): string {
  if (finding.finding_id) return `finding:${finding.finding_id}`;
  return `node:${finding.task_id ?? UNASSIGNED_TASK}:${finding.id}`;
}

export function isSameFinding(left: Finding, right: Finding): boolean {
  return findingRowKey(left) === findingRowKey(right);
}

export function fmtTime(ts: string, ui: UITranslate) {
  return new Date(ts).toLocaleString(ui("screen.91610255157661"), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLUMN_COUNT = 9;

interface FindingsTableProps {
  items: Finding[];
  caseRows?: FindingCaseListRow[];
  hideHeader?: boolean;
  matchedIds?: number[];
  presentation?: "records" | "task" | "asset";
  selectedIds: Set<string>;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectedPage: (ids: string[], checked: boolean) => void;
  /** 当前展开行的 findingRowKey;null = 全部收起。 */
  expandedKey: string | null;
  onToggleRow: (finding: Finding) => void;
  reports: Record<string, FindingReport>;
  edit: FindingEdit | null;
  onEditChange: React.Dispatch<React.SetStateAction<FindingEdit | null>>;
  saving: boolean;
  onSave: (finding: Finding) => void;
  onStatusChange: (finding: Finding, next: FindingStatus) => void;
  onRetest: (finding: Finding) => void;
  activeRetests: Record<string, ActiveFindingRetest>;
  onDeepen: (finding: Finding) => void;
  onDelete: (finding: Finding) => void;
  /** 全选框的无障碍标签,平铺视图与分组视图措辞不同。 */
  selectAllLabel?: string;
}

// FindingsTable 是发现列表的表格主体,平铺视图与按任务分组视图共用同一份行渲染
// (勾选 / 行内展开 / 行内改名与改状态 / 复测 / 深入 / 删除),差异只在外层容器与分页。
export function FindingsTable({
  items,
  caseRows,
  hideHeader = false,
  matchedIds,
  presentation = "records",
  selectedIds,
  onToggleSelected,
  onToggleSelectedPage,
  expandedKey,
  onToggleRow,
  reports,
  edit,
  onEditChange,
  saving,
  onSave,
  onStatusChange,
  onRetest,
  activeRetests,
  onDeepen,
  onDelete,
  selectAllLabel,
}: FindingsTableProps) {
  const { ui } = useUITranslation();

  selectAllLabel ??= ui("screen.bc039dd5faffdd");

  const { t } = useTranslation();
  const selectableIds = items.map((finding) => finding.finding_id).filter((id): id is string => Boolean(id));
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  let headerChecked: boolean | "indeterminate" = false;
  if (selectableIds.length > 0 && selectedCount === selectableIds.length) {
    headerChecked = true;
  } else if (selectedCount > 0) {
    headerChecked = "indeterminate";
  }

  const rows: FindingCaseListRow[] = caseRows ?? items.map((finding) => ({ finding, matched_ids: [] }));

  const shared: Omit<FindingsTableProps, "items" | "caseRows"> = {
    presentation,
    selectedIds,
    onToggleSelected,
    onToggleSelectedPage,
    expandedKey,
    onToggleRow,
    reports,
    edit,
    onEditChange,
    saving,
    onSave,
    onStatusChange,
    onRetest,
    activeRetests,
    onDeepen,
    onDelete,
  };

  return (
    /* 固定列宽保证展开内容不撑开表格；窄屏只在表格内部横向滚动。 */
    <Table className="min-w-[60rem] table-fixed">
      {hideHeader ? (
        <colgroup>
          <col className="w-8" />
          <col className="w-8" />
          <col className="w-20" />
          <col />
          <col className="w-44" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-24" />
          <col className="w-48" />
        </colgroup>
      ) : null}
      {!hideHeader ? (
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={headerChecked}
                onCheckedChange={(checked) => onToggleSelectedPage(selectableIds, checked === true)}
                aria-label={selectAllLabel}
              />
            </TableHead>
            <TableHead className="w-8" />
            <TableHead className="w-20">{ui("screen.367839ef9f8c2f")}</TableHead>
            <TableHead>{ui("screen.f9d4d157ae40c7")}</TableHead>
            <TableHead className="w-44">{ui("screen.5f45bb826b168f")}</TableHead>
            <TableHead className="w-28">{ui("screen.6320b4a8722a85")}</TableHead>
            <TableHead className="w-32">{ui("screen.9f232c4d19886f")}</TableHead>
            <TableHead className="w-24">{ui("screen.8b6ff498515bcc")}</TableHead>
            <TableHead className="w-48">{ui("screen.ed31fbb483ee1b")}</TableHead>
          </TableRow>
        </TableHeader>
      ) : null}
      <TableBody>
        {rows.map((row) => {
          if (row.case) return <FindingFolderTableRows key={`case:${row.case.id}`} row={row} shared={shared} />;
          const f = row.finding;
          if (!f) return null;
          const rowKey = findingRowKey(f);
          const open = expandedKey === rowKey;
          const retest = f.finding_id ? activeRetests[f.finding_id] : undefined;
          return (
            <React.Fragment key={rowKey}>
              <TableRow
                className={cn(
                  "cursor-pointer",
                  matchedIds && !matchedIds.includes(Number(f.finding_id)) && "bg-muted/30",
                )}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => onToggleRow(f)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onToggleRow(f);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {f.finding_id && (
                    <Checkbox
                      checked={selectedIds.has(f.finding_id)}
                      onCheckedChange={(c) => onToggleSelected(f.finding_id as string, c === true)}
                      aria-label={ui("screen.f535063ffeb25d")}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRightIcon
                    className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge domain="severity" value={f.severity} dot />
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {f.finding_id ? (
                      <Link
                        href={`/function/findings/detail?id=${f.finding_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-medium hover:text-primary hover:underline"
                        title={ui("screen.232a97b3cf149e")}
                      >
                        {f.name || f.vulnclass || ui("screen.54b89f90127458")}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">
                        {f.name || f.vulnclass || ui("screen.54b89f90127458")}
                      </span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">{f.summary}</span>
                    {matchedIds && !matchedIds.includes(Number(f.finding_id)) ? (
                      <Badge variant="outline" className="w-fit">
                        {ui("screen.7852ff0b787df8")}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      {ui("screen.8a7bc1e3a1c1dd")}
                      {f.traffic_count ?? 0} {ui("screen.f004f1d84cf962")}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <FindingAssetLabels assets={f.assets} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {f.finding_id ? (
                    <Select value={f.status} onValueChange={(v) => onStatusChange(f, v as FindingStatus)}>
                      <SelectTrigger size="sm" className="h-7 w-full border-none px-1 shadow-none focus-visible:ring-0">
                        <StatusBadge domain="finding" value={f.status} dot />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {FINDING_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {statusMeta("finding", st, t).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge domain="finding" value={f.status} dot />
                  )}
                </TableCell>
                <TableCell>
                  {f.task_id ? (
                    <Link
                      href={`/function/tasks/detail?id=${f.task_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                      title={f.task_description}
                    >
                      <span className="truncate">{f.task_description}</span>
                      <ArrowUpRightIcon className="size-3 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(f.ts, ui)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {retest ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/chat?c=${retest.conversation_id}`} title={ui("screen.5a43849420b2d1")}>
                          <Spinner data-icon="inline-start" />
                          {ui("screen.9426ed1cf45977")}
                        </Link>
                      </Button>
                    ) : null}
                    {!retest && f.finding_id && !f.inherited ? (
                      <Button size="sm" variant="ghost" onClick={() => onRetest(f)} title={ui("screen.1fa76681c39c38")}>
                        <RotateCcwIcon data-icon="inline-start" />
                        {ui("screen.d95315ddeb80c2")}
                      </Button>
                    ) : null}
                    {f.finding_id && f.task_id && (
                      <Button size="sm" variant="ghost" onClick={() => onDeepen(f)}>
                        <FlaskConicalIcon data-icon="inline-start" />
                        {ui("screen.e952e0cafb0e8a")}
                      </Button>
                    )}
                    {f.finding_id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={ui("screen.623b2dfaaa3ba0")}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{ui("screen.fa4ee33b1be3d3")}</AlertDialogTitle>
                            <AlertDialogDescription className="break-words">
                              {ui("punctuation.b269e4a091")}
                              <span className="break-all">
                                {f.name || f.vulnclass || f.summary || `#${f.finding_id}`}
                              </span>
                              {ui("screen.10177194107fe4")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(f)}>
                              {ui("screen.2f9daa828907b9")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {open && (
                <TableRow className="hover:bg-transparent">
                  {/* whitespace-normal 覆盖 TableCell 默认的 nowrap,否则展开区文字
                      被强制单行、直接溢出单元格。 */}
                  <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30 whitespace-normal">
                    <div className="flex flex-col gap-2 px-2 py-1">
                      {/* 行内编辑:名称/类别/严重等级,可改并保存(仅独立 finding 行)。 */}
                      {f.finding_id && edit && (
                        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-background px-3 py-2.5">
                          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{ui("screen.f9d4d157ae40c7")}</Label>
                            <Input
                              value={edit.name}
                              onChange={(e) => onEditChange((s) => (s ? { ...s, name: e.target.value } : s))}
                              placeholder={ui("screen.e4ca1c94d239bd")}
                            />
                          </div>
                          <div className="flex min-w-[10rem] flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{ui("screen.0d12cbd6562bfb")}</Label>
                            <Input
                              value={edit.vulnclass}
                              onChange={(e) => onEditChange((s) => (s ? { ...s, vulnclass: e.target.value } : s))}
                              placeholder={ui("screen.18f8e077cc27a6")}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{ui("screen.2e21284b7229e6")}</Label>
                            <Select
                              value={edit.severity}
                              onValueChange={(v) => onEditChange((s) => (s ? { ...s, severity: v as Severity } : s))}
                            >
                              <SelectTrigger size="sm" className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SEVERITIES.map((sv) => (
                                  <SelectItem key={sv} value={sv}>
                                    {statusMeta("severity", sv, t).label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" disabled={saving} onClick={() => onSave(f)}>
                            {saving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlertIcon className="size-3.5" />
                        {ui("screen.d883c636d3f891")}
                        {f.vulnclass && (
                          <span>
                            {ui("screen.e9b150245e3845")}
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{f.vulnclass}</code>
                          </span>
                        )}
                        {f.param_id && <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{f.param_id}</code>}
                        {f.assets && f.assets.length > 0 && (
                          <span className="flex flex-wrap items-center gap-1">
                            {ui("screen.a85936ba84b226")}
                            {f.assets.map((a) => (
                              <code key={a.id} className="rounded bg-muted px-1.5 py-0.5 font-mono" title={a.type}>
                                {a.label}
                              </code>
                            ))}
                          </span>
                        )}
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                        {f.evidence}
                      </pre>

                      {/* 旧版详细报告保留；新版合并报告在详情页按概览/步骤/根因/修复展示。 */}
                      {f.finding_id && !isStructuredReproductionReport(reports[rowKey]?.text ?? "") && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <FileTextIcon className="size-3.5" />
                              {ui("screen.566e5ab4ab0638")}
                            </span>
                            {reports[rowKey]?.status === "done" && reports[rowKey]?.text.trim() && (
                              <CopyButton
                                text={reports[rowKey]?.text}
                                successMessage={ui("screen.10a2e40390af5f")}
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                              />
                            )}
                          </div>
                          {(() => {
                            const rep = reports[rowKey];
                            if (!rep || rep.status === "loading")
                              return <p className="text-xs text-muted-foreground">{ui("screen.4927a53bcc886a")}</p>;
                            if (rep.status === "error")
                              return <p className="text-xs text-muted-foreground">{ui("screen.bf456ab5176d85")}</p>;
                            if (!rep.text.trim())
                              return <p className="text-xs text-muted-foreground">{ui("screen.6283d9ab225878")}</p>;
                            return (
                              // break-words 会继承到段落/列表,pre 另加
                              // whitespace-pre-wrap 让代码块也换行——否则长代码行/长 URL
                              // 会撑宽 colSpan 单元格,把整张表挤出横向滚动条。
                              <div className="min-w-0 break-words rounded-md border bg-background px-3 py-2 [&_pre]:whitespace-pre-wrap">
                                <Markdown text={rep.text} />
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
        })}
        {(caseRows ? caseRows.length : items.length) === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="py-12 text-center text-sm text-muted-foreground">
              {ui("screen.839ae9d1758f4a")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// Ordinary reports and merged folders share one asset presentation, including
// truncation and overflow counts, so labels align in every table view.
function FindingAssetLabels({
  assets = [],
  totalCount = assets.length,
}: {
  assets?: FindingAsset[];
  totalCount?: number;
}) {
  if (assets.length === 0) return <span className="text-muted-foreground">—</span>;
  const visibleAssets = assets.slice(0, 3);
  const remaining = Math.max(totalCount, assets.length) - visibleAssets.length;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visibleAssets.map((asset) => (
        <code
          key={asset.id}
          className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
          title={`${asset.type} · ${asset.label}`}
        >
          {asset.label}
        </code>
      ))}
      {remaining > 0 ? <span className="text-xs text-muted-foreground">+{remaining}</span> : null}
    </div>
  );
}

// Folder summaries occupy the same columns as the current view's ordinary rows.
// Expanded members reuse those rows without a second heading or column header.
function FindingFolderTableRows({
  row,
  shared,
}: {
  row: FindingCaseListRow;
  shared: Omit<FindingsTableProps, "items" | "caseRows">;
}) {
  const { ui } = useUITranslation();

  const [open, setOpen] = React.useState(false);
  const group = row.case;
  if (!group) return null;
  // Match the current table's ordinary rows, which display the task description.
  const taskLabel = row.task_description;
  const assets = row.assets ?? [];
  const assetCount = row.asset_count ?? assets.length;
  return (
    <>
      <TableRow className={cn(open && "bg-muted/60")}>
        <TableCell />
        <TableCell>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={`finding-table-members-${group.id}`}
            aria-label={`${open ? ui("screen.afd4b783536b82") : ui("screen.00bd3960fea8ea")}${group.title}`}
          >
            <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
          </Button>
        </TableCell>
        <TableCell>
          <FindingSeverityCounts counts={group} />
        </TableCell>
        <TableCell>
          <div className="flex min-w-0 items-start gap-2">
            {open ? (
              <FolderOpenIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <FolderIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                className="truncate font-medium hover:text-primary hover:underline"
                title={group.title}
                href={`/function/findings/case?id=${group.id}`}
              >
                {group.title}
              </Link>
              <span className="truncate text-muted-foreground text-xs">
                {group.count} {ui("screen.0ebb9fd0cad94e")}
                {group.report_version !== group.version ? ui("screen.99c01379e8e143") : ui("screen.632e3cdf7f317c")}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <FindingAssetLabels assets={assets} totalCount={assetCount} />
        </TableCell>
        <TableCell>
          <span className="text-muted-foreground" title={ui("screen.1ae6e90569357d")}>
            —
          </span>
        </TableCell>
        <TableCell>
          {group.task_id ? (
            <Link
              className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
              title={taskLabel}
              href={`/function/tasks/detail?id=${group.task_id}`}
            >
              <span className="truncate">{taskLabel}</span>
              <ArrowUpRightIcon className="size-3 shrink-0" />
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {row.last_found_at ? fmtTime(row.last_found_at, ui) : "—"}
        </TableCell>
        <TableCell>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/function/findings/case?id=${group.id}`}>{ui("screen.37707567ad4c9b")}</Link>
          </Button>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal bg-muted/20 px-4 py-4">
            <section
              id={`finding-table-members-${group.id}`}
              aria-label={ui("screen.9a800fb52c2cf7", { v0: group.title })}
            >
              <FindingCaseMembers
                caseId={group.id}
                version={group.version}
                nested
                renderRecords={(members) => (
                  <FindingsTable {...shared} items={members} matchedIds={row.matched_ids} hideHeader />
                )}
              />
            </section>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
