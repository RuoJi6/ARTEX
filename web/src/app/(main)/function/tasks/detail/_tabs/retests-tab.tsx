"use client";

import { useTranslations } from "next-intl";

import * as React from "react";

import Link from "next/link";

import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";

import { FindingRetestPanel } from "@/components/finding-retest-panel";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { SEVERITY_FILTER_OPTIONS } from "@/lib/status";
import type { Finding, FindingsPage, Severity } from "@/lib/types";

const PAGE_SIZE = 20;

function findingLabel(finding: Finding, unclassified: string) {
  return finding.name?.trim() || finding.vulnclass.trim() || unclassified;
}

export function RetestsTab({ taskId }: { taskId: string }) {
  const ui = useTranslations();
  const t = useTranslations("taskPanels");
  const [page, setPage] = React.useState(1);
  const [severity, setSeverity] = React.useState<"all" | Severity>("all");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [data, setData] = React.useState<
    (FindingsPage & { taskId: string; severity: "all" | Severity; query: string }) | null
  >(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [error, setError] = React.useState("");
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const refresh = React.useCallback(() => setRefreshVersion((version) => version + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Filter changes restart pagination.
  React.useEffect(() => {
    setPage(1);
  }, [severity, query]);

  // Only this task's own findings, including those without graph nodes.
  // Fetch history only for the selection, and wait for each poll to finish.
  React.useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await api.findingsPage({
          task: taskId,
          page,
          pageSize: PAGE_SIZE,
          severity: severity === "all" ? undefined : severity,
          query: query || undefined,
          sort: "severity",
        });
        if (disposed) return;
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData({ ...result, taskId, severity, query });
        setSelectedId((current) =>
          result.items.some((finding) => finding.id === current) ? current : (result.items[0]?.id ?? ""),
        );
        setError("");
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      } finally {
        if (!disposed) timer = setTimeout(() => void load(), 3000);
      }
    }
    void refreshVersion; // Refresh triage immediately after a retest completes.
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [taskId, page, refreshVersion, severity, query]);

  const loaded = data?.page === page && data.taskId === taskId && data.severity === severity && data.query === query;
  const findings = loaded ? data.items : [];
  const selected = findings.find((finding) => finding.id === selectedId);
  const hasFilters = severity !== "all" || !!query;

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
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("retests.loadError", {error })}
            <Button variant="outline" size="sm" onClick={refresh}>
              {t("retests.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{ui("taskPanels.retests.selectTitle")}{loaded ? ` · ${data.total}` : ""}</CardTitle>
            <CardDescription>{ui("taskPanels.retests.selectDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-[32rem] flex-col overflow-y-auto">
            {!loaded && !error ? <Skeleton className="h-24 w-full" /> : null}
            {findings.map((finding, index) => (
              <React.Fragment key={finding.id}>
                {index > 0 ? <Separator className="my-1" /> : null}
                <Button
                  variant={finding.id === selectedId ? "secondary" : "ghost"}
                  className="h-auto w-full shrink-0 flex-col items-start gap-2 whitespace-normal py-3 text-left"
                  aria-label={t("retests.selectAria", { name: findingLabel(finding, t("findings.unclassified")) })}
                  aria-pressed={finding.id === selectedId}
                  onClick={() => setSelectedId(finding.id)}
                >
                  <span className="line-clamp-2 break-words">{findingLabel(finding, t("findings.unclassified"))}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge domain="severity" value={finding.severity} dot />
                    <StatusBadge domain="finding" value={finding.status} dot />
                  </span>
                </Button>
              </React.Fragment>
            ))}
            {loaded && findings.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{hasFilters ? ui("core.retests.emptyFiltered") : ui("taskPanels.retests.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>
                    {hasFilters ? ui("core.retests.adjustFilters") : ui("taskPanels.retests.emptyDesc")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </CardContent>
          {loaded && data.total > PAGE_SIZE ? (
            <CardFooter className="justify-between gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("retests.prevPage")}
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="text-muted-foreground text-xs">
                {t("retests.pageIndicator", {page, total: Math.ceil(data.total / PAGE_SIZE)})}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("retests.nextPage")}
                disabled={page * PAGE_SIZE >= data.total}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </CardFooter>
          ) : null}
        </Card>
        {selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 break-words font-medium">{findingLabel(selected, t("findings.unclassified"))}</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/function/findings/detail?id=${selected.finding_id || selected.id}`}>
                    {t("retests.findingDetail")} <ArrowUpRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
              <p className="line-clamp-3 break-words text-muted-foreground text-sm">{selected.summary}</p>
            </div>
            <FindingRetestPanel
              key={selected.id}
              findingId={selected.finding_id || selected.id}
              findingName={findingLabel(selected, t("findings.unclassified"))}
              onCompleted={refresh}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
