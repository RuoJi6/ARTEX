import { filterAndSortFindings } from "./finding-severity.ts";
import assert from "node:assert/strict";
import test from "node:test";

const finding = (id, severity, ts, extra = {}) => ({
  id,
  severity,
  ts,
  vulnclass: "XSS",
  status: "confirmed",
  summary: id,
  evidence: "",
  ...extra,
});

const rows = [
  finding("1", "low", "2026-10-26T12:00:00Z"),
  finding("2", "high", "2026-10-25T12:00:00Z"),
  finding("3", "critical", "2026-10-24T12:00:00Z"),
  finding("4", "medium", "2026-10-26T12:00:00Z"),
  finding("5", "high", "2026-10-26T12:00:00Z", { inherited: true, source_task_id: "source" }),
];

test("time descending sorts across severity levels instead of promoting older critical findings", () => {
  assert.deepEqual(
    filterAndSortFindings(rows, "all", { field: "time", direction: "desc" }).map((row) => row.id),
    ["5", "4", "1", "2", "3"],
  );
});

test("time ascending can place an older low-severity finding before a critical finding", () => {
  const oldest = finding("6", "low", "2026-10-23T12:00:00Z");
  assert.deepEqual(
    filterAndSortFindings([...rows, oldest], "all", { field: "time", direction: "asc" }).map((row) => row.id),
    ["6", "3", "2", "5", "4", "1"],
  );
});

test("time sorting preserves severity/search filters and inherited records without mutating the snapshot", () => {
  const snapshot = Object.freeze(rows.map((row) => Object.freeze({ ...row, evidence: "Shared evidence" })));
  for (const direction of ["asc", "desc"]) {
    const result = filterAndSortFindings(snapshot, "high", { field: "time", direction }, " EVIDENCE ");
    assert.deepEqual(
      result.map((row) => row.id),
      direction === "asc" ? ["2", "5"] : ["5", "2"],
    );
    assert.equal(result.find((row) => row.id === "5").source_task_id, "source");
  }
  assert.deepEqual(
    snapshot.map((row) => row.id),
    rows.map((row) => row.id),
  );
});

test("all keeps every report and orders severity before newest time", () => {
  assert.deepEqual(
    filterAndSortFindings(rows, "all", { field: "severity", direction: "desc" }).map((row) => row.id),
    ["3", "5", "2", "4", "1"],
  );
});

test("each severity filters reports including inherited reports", () => {
  for (const severity of ["critical", "high", "medium", "low"]) {
    const items = filterAndSortFindings(rows, severity, { field: "severity", direction: "desc" });
    assert.equal(items.length, severity === "high" ? 2 : 1);
    assert.ok(items.every((row) => row.severity === severity));
  }
  assert.equal(
    filterAndSortFindings(rows, "high", { field: "severity", direction: "desc" })[0].source_task_id,
    "source",
  );
});

test("ascending time changes only the order within a severity", () => {
  assert.deepEqual(
    filterAndSortFindings(rows, "all", { field: "severity", direction: "asc" }).map((row) => row.id),
    ["3", "2", "5", "4", "1"],
  );
});

test("matching severity and timestamp use descending numeric IDs", () => {
  const tied = [finding("2", "high", rows[0].ts), finding("10", "high", rows[0].ts)];
  for (const direction of ["asc", "desc"]) {
    assert.deepEqual(
      filterAndSortFindings(tied, "all", { field: "severity", direction }).map((row) => row.id),
      ["10", "2"],
    );
  }
});

test("empty input and a severity without matches return an empty list", () => {
  assert.deepEqual(filterAndSortFindings([], "all", { field: "severity", direction: "desc" }), []);
  assert.deepEqual(filterAndSortFindings([rows[0]], "critical", { field: "severity", direction: "desc" }), []);
});

test("filtering and sorting preserve the polling snapshot", () => {
  const snapshot = Object.freeze(rows.map((row) => Object.freeze({ ...row })));
  const before = [...snapshot];
  assert.notEqual(filterAndSortFindings(snapshot, "all", { field: "severity", direction: "desc" }), snapshot);
  filterAndSortFindings(snapshot, "high", { field: "severity", direction: "asc" });
  assert.deepEqual(snapshot, before);
});

test("keywords match each searchable field as a trimmed, case-insensitive substring", () => {
  for (const field of ["name", "vulnclass", "summary", "evidence"]) {
    const match = finding("match", "high", rows[0].ts, { [field]: "prefix NeEdLe suffix" });
    assert.deepEqual(
      filterAndSortFindings([rows[0], match], "all", { field: "severity", direction: "desc" }, "  nEEdle  "),
      [match],
    );
  }
});

test("unmatched keywords and missing searchable fields return no matches", () => {
  const missing = finding("missing", "high", rows[0].ts, {
    name: undefined,
    vulnclass: undefined,
    summary: undefined,
    evidence: undefined,
  });
  assert.deepEqual(
    filterAndSortFindings([...rows, missing], "all", { field: "severity", direction: "desc" }, "needle"),
    [],
  );
  assert.deepEqual(filterAndSortFindings([], "all", { field: "severity", direction: "desc" }, "needle"), []);
});

test("undefined, empty and whitespace keywords preserve severity filtering and sorting", () => {
  for (const query of [undefined, "", "  \t\n  "]) {
    for (const severity of ["all", "high"]) {
      for (const direction of ["asc", "desc"]) {
        assert.deepEqual(
          filterAndSortFindings(rows, severity, { field: "severity", direction }, query),
          filterAndSortFindings(rows, severity, { field: "severity", direction }),
        );
      }
    }
  }
});

test("keywords combine with severity and preserve time ordering for inherited reports", () => {
  const matches = rows.map((row) => ({ ...row, evidence: "Shared keyword" }));
  assert.deepEqual(
    filterAndSortFindings(matches, "high", { field: "severity", direction: "desc" }, "KEYWORD").map((row) => row.id),
    ["5", "2"],
  );
  assert.deepEqual(
    filterAndSortFindings(matches, "high", { field: "severity", direction: "asc" }, "keyword").map((row) => row.id),
    ["2", "5"],
  );
  assert.deepEqual(filterAndSortFindings(matches, "high", { field: "severity", direction: "desc" }, "absent"), []);
});
