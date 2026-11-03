"use client";

import { useLocaleFormatting } from "@/i18n/formatting";

import { useTranslations } from "next-intl";

import * as React from "react";

import Link from "next/link";

import { ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { FindingCaseList } from "@/components/finding-case-list";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { type FindingSortField, filterAndSortFindings } from "@/lib/finding-severity";
import { useStoredSortPreference } from "@/lib/sort-preference";
import { SEVERITY_FILTER_OPTIONS, statusMeta } from "@/lib/status";
import type { Finding, FindingStatus, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const FINDING_SORT_FIELDS: readonly FindingSortField[] = ["time", "severity"];
const FINDING_SORT_PREFERENCE_KEY = "artex_task_findings_sort";

function findingLabel(finding: Finding, unclassified: string): string {
  if (finding.name?.trim()) return finding.name;
  if (finding.vulnclass?.trim()) return finding.vulnclass;
  return unclassified;
}

const FINDING_STATUSES: FindingStatus[] = [
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

function Row({
  f,
  contextTaskId,
  onStatus,
}: {
  f: Finding;
  contextTaskId: string;
  onStatus: (f: Finding, next: FindingStatus) => void;
}) {
  const format = useLocaleFormatting();
  const t = useTranslations("taskPanels.findings");
  const tStatus = useTranslations("status");
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b last:border-b-0">
      <div className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-accent/40">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRightIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <StatusBadge domain="severity" value={f.severity} dot />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{findingLabel(f, t("unclassified"))}</span>
              {f.inherited && f.source_task_id && (
                <Badge variant="outline" className="shrink-0">
                  {t("sourceReadonly", { id: f.source_task_id})}
                </Badge>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">{f.summary}</span>
          </div>
        </button>
        <Badge variant="outline">{t("trafficEvidence", { count: f.traffic_count ?? 0})}</Badge>
        {f.assets && f.assets.length > 0 && (
          <div className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
            {f.assets.slice(0, 2).map((a) => (
              <code
                key={a.id}
                className="max-w-[10rem] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                title={`${a.type} · ${a.label}`}
              >
                {a.label}
              </code>
            ))}
            {f.assets.length > 2 && <span className="text-xs text-muted-foreground">+{f.assets.length - 2}</span>}
          </div>
        )}
        {f.finding_id && !f.inherited ? (
          <Select value={f.status} onValueChange={(v) => onStatus(f, v as FindingStatus)}>
            <SelectTrigger size="sm" className="h-7 w-28 shrink-0 border-none px-1 shadow-none focus-visible:ring-0">
              <StatusBadge domain="finding" value={f.status} dot />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                {FINDING_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {tStatus(`finding.${st}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge domain="finding" value={f.status} dot />
        )}
        <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
          {format.dateTime(new Date(f.ts), "timestamp")}
        </span>
        {f.finding_id && (
          <Link
            href={`/function/findings/detail?id=${f.finding_id}&context_task=${contextTaskId}`}
            className="text-muted-foreground hover:text-primary inline-flex shrink-0 items-center gap-0.5 text-xs"
            title={t("viewDetail")}
          >
            {t("detail")}
            <ArrowUpRightIcon className="size-3" />
          </Link>
        )}
      </div>
      {open && (
        <div className="bg-muted/30 px-4 pb-4 pl-11">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t("evidencePoc")}</div>
          <pre className="overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
            {f.evidence}
          </pre>
        </div>
      )}
    </div>
  );
}

export function FindingsTab({ taskId }: { taskId: string }) {
  const ui = useTranslations();
  const t = useTranslations("taskPanels.findings");
  const tStatus = useTranslations("status");
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [severity, setSeverity] = React.useState<"all" | Severity>("all");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [sortPreference, setSortPreference] = useStoredSortPreference(
    FINDING_SORT_PREFERENCE_KEY,
    FINDING_SORT_FIELDS,
    "time",
    "desc",
  );

  React.useEffect(() => {
    let active = true;
    const load = () => {
      api
        .findings(taskId)
        .then((fs) => {
          if (active) setFindings(fs);
        })
        .catch(() => {
          // Keep the last successful snapshot during transient refresh failures.
        });
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [taskId]);

  const onStatus = React.useCallback(async (f: Finding, next: FindingStatus) => {
    if (f.inherited || !f.finding_id || next === f.status) return;
    const prev = f.status;
    setFindings((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: next } : x)));
    try {
      await api.setFindingStatus(f.finding_id, next);
      toast.success(t("markedAs", { label: tStatus(`finding.${next}`) }));
    } catch (e) {
      setFindings((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: prev } : x)));
      toast.error(t("updateFailed", { message: (e as Error).message }));
    }
  }, [t, tStatus],
  );

  // Discover inherited sources before filtering; finding-cases owns folder matching.
  const taskFindings = findings.filter((f) => f.task_id === taskId || f.inherited);
  const items = filterAndSortFindings(taskFindings, severity, sortPreference, query);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={severity}
          onValueChange={(value) => value && setSeverity(value as "all" | Severity)}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {SEVERITY_FILTER_OPTIONS.map(([val, label]) => (
            <ToggleGroupItem key={val} value={val} aria-label={val === "all" ? ui("core.common.all") : ui(`status.severity.${val}`)}>
              {val === "all" ? ui("core.common.all") : ui(`status.severity.${val}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          value={sortPreference.field}
          onValueChange={(field) => {
            if (field === "time" || field === "severity") {
              setSortPreference((current) => ({ ...current, field }));
            }
          }}
        >
          <SelectTrigger size="sm" className="w-36" aria-label={ui("core.findings.sort")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="time">{ui("core.findings.byTime")}</SelectItem>
            <SelectItem value="severity">{ui("core.findings.bySeverity")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={ui("core.findings.sortDirection", { direction: sortPreference.direction === "asc" ? ui("taskPanels.findings.orderAsc") : ui("taskPanels.findings.orderDesc") })}
          onClick={() =>
            setSortPreference((current) => ({
              ...current,
              direction: current.direction === "asc" ? "desc" : "asc",
            }))
          }
        >
          {sortPreference.direction === "asc" ? (
            <ArrowUpIcon aria-hidden="true" />
          ) : (
            <ArrowDownIcon aria-hidden="true" />
          )}
          {sortPreference.field === "severity" ? ui("core.findings.sameSeverityPrefix") : ""}
          {sortPreference.direction === "asc" ? ui("core.findings.oldest") : ui("core.findings.newest")}
        </Button>
        <form
          className="flex w-full items-center gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <InputGroup className="flex-1 sm:w-72">
            <InputGroupInput
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui("findings.search.placeholder")}
              aria-label={ui("findings.search.placeholder")}
            />
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
          <Button type="submit" size="sm" aria-label={ui("search.label")}>
            {ui("search.label")}</Button>
        </form>
      </div>
      <FindingCaseList
        query={{
          task: taskId,
          severity: severity === "all" ? undefined : severity,
          query: query || undefined,
          sort: sortPreference.field,
          timeDirection: sortPreference.direction,
        }}
        contextTask={taskId}
      />
      {[
        ...new Set(
          taskFindings
            .filter((f) => f.inherited)
            .map((f) => f.source_task_id)
            .filter((id): id is string => !!id),
        ),
      ].map((source) => (
        <div key={source}>
          <p className="mb-2 text-sm text-muted-foreground">{ui("core.findings.inheritedTask")}{source} {ui("core.common.readOnlySuffix")}</p>
          <FindingCaseList
            query={{
              task: source,
              severity: severity === "all" ? undefined : severity,
              query: query || undefined,
              sort: sortPreference.field,
              timeDirection: sortPreference.direction,
            }}
            contextTask={taskId}
            readOnly
          />
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">{ui("core.findings.viewRaw")}</summary>
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <div className="flex items-center border-b px-4 py-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">
                {ui("core.findings.listHeading", { order: sortPreference.field === "severity" ? "severity" : "time" })}
              </span>
              <span className="inline-flex items-center gap-1">
                <span>{sortPreference.field === "severity" ? ui("core.findings.sameSeverityTime") : ui("findings.detail.fieldTime")}</span>
                {sortPreference.direction === "asc" ? (
                  <ArrowUpIcon className="size-3.5" />
                ) : (
                  <ArrowDownIcon className="size-3.5" />
                )}
              </span>
            </div>
            {items.map((f) => (
              <Row key={f.id} f={f} contextTaskId={taskId} onStatus={onStatus} />
            ))}
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {severity !== "all" || query
                  ? ui("core.findings.emptyRaw")
                  : ui("taskPanels.findings.empty")}
              </p>
            )}
          </CardContent>
        </Card>
      </details>
    </div>
  );
}
