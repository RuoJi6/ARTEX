import type { SortPreference } from "./sort-preference";
import type { Finding, Severity } from "./types";

export type FindingSortField = "time" | "severity";

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function filterAndSortFindings(
  findings: readonly Finding[],
  severity: "all" | Severity,
  sort: SortPreference<FindingSortField>,
  query?: string,
): Finding[] {
  const keyword = query?.trim().toLowerCase() ?? "";
  return findings
    .filter(
      (finding) =>
        (severity === "all" || finding.severity === severity) &&
        (!keyword ||
          [finding.name, finding.vulnclass, finding.summary, finding.evidence].some((value) =>
            (value ?? "").toLowerCase().includes(keyword),
          )),
    )
    .sort((a, b) => {
      const severityCompared = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
      if (sort.field === "severity" && severityCompared !== 0) return severityCompared;
      const timeCompared = Date.parse(a.ts) - Date.parse(b.ts);
      if (timeCompared !== 0) return sort.direction === "asc" ? timeCompared : -timeCompared;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
}
