const assert = require("node:assert/strict");
const test = require("node:test");

// Use the existing TypeScript dev dependency to exercise the real mock routes,
// including their extensionless imports, without adding a test runtime.
require("ts-node").register({
  skipProject: true,
  transpileOnly: true,
  compilerOptions: { target: "ES2022", module: "CommonJS", moduleResolution: "Node" },
});
const data = require("./data.ts");
const finding = (id, task, severity, day, status = "pending") => ({
  id,
  task_id: task,
  severity,
  ts: `2026-01-${String(day).padStart(2, "0")}T12:00:00Z`,
  status,
  name: "needle",
  vulnclass: "Demo",
  summary: "Synthetic sorting fixture",
  evidence: "",
  assets: [],
});
const fixtures = [
  finding("1", "2", "low", 2),
  finding("2", "2", "high", 4),
  finding("10", "10", "high", 4),
  finding("11", "10", "critical", 1),
  finding("12", "20", "high", 4),
  finding("13", undefined, "high", 4),
  finding("14", "30", "low", 5),
  finding("15", "40", "critical", 1),
  finding("16", "10", "high", 3, "resolved"),
];
// handler.ts snapshots fixtures on import. Restore exported demo data immediately;
// node:test runs this test file in its own process, separate from the application.
const original = data.findings.slice();
let mockHandle;
try {
  data.findings.splice(0, data.findings.length, ...fixtures);
  ({ mockHandle } = require("./handler.ts"));
} finally {
  data.findings.splice(0, data.findings.length, ...original);
}

const rowOrders = {
  time: {
    asc: ["15", "11", "1", "16", "13", "12", "10", "2", "14"],
    desc: ["14", "13", "12", "10", "2", "16", "1", "15", "11"],
  },
  severity: {
    asc: ["15", "11", "16", "13", "12", "10", "2", "1", "14"],
    desc: ["15", "11", "13", "12", "10", "2", "16", "14", "1"],
  },
};
const groupOrders = {
  time: {
    asc: ["40", "20", "10", "2", null, "30"],
    desc: ["30", "20", "10", "2", null, "40"],
  },
  severity: {
    asc: ["40", "10", "20", "2", null, "30"],
    desc: ["10", "40", "20", "2", null, "30"],
  },
};
const routes = [
  { path: "/exploration/findings", key: (row) => row.id, orders: rowOrders },
  { path: "/exploration/finding-cases", key: (row) => row.finding.id, orders: rowOrders },
  { path: "/exploration/findings/groups", key: (row) => row.task_id, orders: groupOrders },
];
const read = (route, query = {}) =>
  mockHandle("GET", `${route.path}?${new URLSearchParams({ page: "1", limit: "100", ...query })}`);

for (const route of routes) {
  for (const sort of ["time", "severity"]) {
    for (const direction of ["asc", "desc"]) {
      test(`${route.path}: ${sort}/${direction} sorts before pagination with stable ID ties`, async () => {
        const expected = route.orders[sort][direction];
        const full = await read(route, { sort, time_direction: direction });
        assert.deepEqual(full.items.map(route.key), expected);
        assert.equal(full.total, expected.length);
        const paged = [];
        for (let page = 1; page <= Math.ceil(expected.length / 2); page++) {
          const result = await read(route, { sort, time_direction: direction, page: String(page), limit: "2" });
          assert.equal(result.total, expected.length);
          assert.equal(result.page, page);
          assert.equal(result.page_size, 2);
          paged.push(...result.items.map(route.key));
        }
        assert.deepEqual(paged, expected);
      });
    }
  }

  test(`${route.path}: missing or invalid direction defaults to descending`, async () => {
    for (const sort of ["time", "severity"]) {
      for (const direction of [undefined, "", "ASC", "invalid", "asc; DROP TABLE findings"]) {
        const query = { sort, ...(direction === undefined ? {} : { time_direction: direction }) };
        assert.deepEqual((await read(route, query)).items.map(route.key), route.orders[sort].desc);
      }
    }
  });

  test(`${route.path}: direction preserves combined filters and leaves the snapshot unchanged`, async () => {
    const before = await read(route, { sort: "time", time_direction: "desc" });
    const grouped = route.path.endsWith("/groups");
    for (const direction of ["asc", "desc"]) {
      const result = await read(route, {
        sort: "time",
        time_direction: direction,
        severity: "high",
        status: "pending",
        q: "needle",
      });
      assert.deepEqual(result.items.map(route.key), grouped ? ["20", "10", "2", null] : ["13", "12", "10", "2"]);
      assert.equal(result.total, 4);
      if (grouped) assert.equal(result.finding_total, 4);
      const empty = await read(route, { time_direction: direction, q: "absent fixture text" });
      assert.deepEqual(empty.items, []);
      assert.equal(empty.total, 0);
    }
    const after = await read(route, { sort: "time", time_direction: "desc" });
    assert.deepEqual(after, before);
  });
}

test("group dates use the latest matching finding after filters", async () => {
  const route = routes[2];
  const result = await read(route, { status: "resolved", time_direction: "asc" });
  assert.equal(result.total, 1);
  assert.equal(result.finding_total, 1);
  assert.equal(result.items[0].task_id, "10");
  assert.equal(result.items[0].last_found_at, fixtures[8].ts);
});
