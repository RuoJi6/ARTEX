"use client";
import * as React from "react";

import Link from "next/link";

import { ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FindingCaseList } from "@/components/finding-case-list";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { type FindingSortField, filterAndSortFindings } from "@/lib/finding-severity";
import { useStoredSortPreference } from "@/lib/sort-preference";
import { SEVERITY_FILTER_OPTIONS, statusMeta } from "@/lib/status";
import type { Finding, FindingStatus, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const FINDING_SORT_FIELDS: readonly FindingSortField[] = ["time", "severity"];
const FINDING_SORT_PREFERENCE_KEY = "artex_task_findings_sort";

function findingLabel(finding: Finding, ui: UITranslate): string {
  if (finding.name?.trim()) return finding.name;
  if (finding.vulnclass?.trim()) return finding.vulnclass;
  return ui("screen.54b89f90127458");
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
  const { ui } = useUITranslation();

  const { t } = useTranslation();
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
              <span className="truncate font-medium">{findingLabel(f, ui)}</span>
              {f.inherited && f.source_task_id && (
                <Badge variant="outline" className="shrink-0">
                  {ui("screen.3afe69a08aa62f")}
                  {f.source_task_id} {ui("screen.8feecd4f35005e")}
                </Badge>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">{f.summary}</span>
          </div>
        </button>
        <Badge variant="outline">
          {ui("screen.8a7bc1e3a1c1dd")}
          {f.traffic_count ?? 0} {ui("screen.f004f1d84cf962")}
        </Badge>
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
                    {statusMeta("finding", st, t).label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge domain="finding" value={f.status} dot />
        )}
        <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
          {new Date(f.ts).toLocaleString(ui("screen.91610255157661"))}
        </span>
        {f.finding_id && (
          <Link
            href={`/function/findings/detail?id=${f.finding_id}&context_task=${contextTaskId}`}
            className="text-muted-foreground hover:text-primary inline-flex shrink-0 items-center gap-0.5 text-xs"
            title={ui("screen.047605fb3fa9cf")}
          >
            {ui("screen.979a332955c855")}
            <ArrowUpRightIcon className="size-3" />
          </Link>
        )}
      </div>
      {open && (
        <div className="bg-muted/30 px-4 pb-4 pl-11">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{ui("screen.c13ed981c63391")}</div>
          <pre className="overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
            {f.evidence}
          </pre>
        </div>
      )}
    </div>
  );
}

export function FindingsTab({ taskId }: { taskId: string }) {
  const { ui, liveUI } = useUITranslation();

  const { t } = useTranslation();
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

  const onStatus = React.useCallback(
    async (f: Finding, next: FindingStatus) => {
      if (f.inherited || !f.finding_id || next === f.status) return;
      const prev = f.status;
      setFindings((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: next } : x)));
      try {
        await api.setFindingStatus(f.finding_id, next);
        toast.success(liveUI("screen.caef7e7d3c7ddb", { v0: statusMeta("finding", next, t).label }));
      } catch (e) {
        setFindings((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: prev } : x)));
        toast.error(liveUI("screen.4f2e8a8d4cb328") + (e as Error).message);
      }
    },
    [t, liveUI],
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
          {SEVERITY_FILTER_OPTIONS.map(([val]) => (
            <ToggleGroupItem
              key={val}
              value={val}
              aria-label={ui("screen.53d32aa661fad3", {
                v0: val === "all" ? t("common.all") : t(`status.severity.${val}`),
              })}
            >
              {ui(val === "all" ? "common.all" : `status.severity.${val}`)}
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
          <SelectTrigger size="sm" className="w-36" aria-label={ui("screen.0d7b850bea889e")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="time">{ui("screen.0831df6026325b")}</SelectItem>
            <SelectItem value="severity">{ui("screen.f46e0aad8a7593")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={ui("screen.9fff32fa537a9e", {
            v0: sortPreference.field === "severity" ? ui("screen.199aa393eac673") : ui("screen.5c55a67935af8f"),
            v1: sortPreference.direction === "asc" ? ui("screen.6d91624318cd6e") : ui("screen.7fd0cf65b630d3"),
          })}
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
          {sortPreference.field === "severity" ? ui("screen.f1859b5ff631f1") : ""}
          {sortPreference.direction === "asc" ? ui("screen.7dc07a67217da2") : ui("screen.cae945a91d2ad9")}
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
              placeholder={ui("screen.3e04372feb7849")}
              aria-label={ui("screen.3e04372feb7849")}
            />
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
          <Button type="submit" size="sm" aria-label={ui("screen.44ce7ae909bbb2")}>
            {ui("screen.44ce7ae909bbb2")}
          </Button>
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
          <p className="mb-2 text-sm text-muted-foreground">
            {ui("screen.e75df74e6ee74d")}
            {source} {ui("screen.8feecd4f35005e")}
          </p>
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
        <summary className="cursor-pointer text-sm text-muted-foreground">{ui("screen.26dd913780e063")}</summary>
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <div className="flex items-center border-b px-4 py-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">
                {ui("screen.5363a2fa81e6f4")}
                {sortPreference.field === "severity" ? ui("screen.f46e0aad8a7593") : ui("screen.0831df6026325b")}
                {ui("punctuation.f2e44c6c95")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span>
                  {sortPreference.field === "severity" ? ui("screen.3248b777795bd3") : ui("screen.8e2a2e97e23d2a")}
                </span>
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
                {severity !== "all" || query ? ui("screen.b63efe5bc2266d") : ui("screen.acb274237b1913")}
              </p>
            )}
          </CardContent>
        </Card>
      </details>
    </div>
  );
}
