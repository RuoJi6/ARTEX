const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

require("ts-node").register({
  skipProject: true,
  transpileOnly: true,
  compilerOptions: { target: "ES2022", module: "CommonJS", moduleResolution: "Node" },
});
const { mockHandle } = require("./mock/handler.ts");
const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports: exportsObject,
    Error,
    URLSearchParams,
    process: { env: {} },
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: true };
      if (id === "@/lib/mock/handler") return { mockHandle };
      throw new Error(`Unexpected import: ${id}`);
    },
    fetch: () => {
      throw new Error("Schedule preview must not use the network");
    },
  },
);
const api = exportsObject.api;
const draft = {
  name: "Preview schedule",
  schedule_type: "weekly",
  weekdays: [7, 6],
  start_time: "18:00",
  end_time: "06:00",
  task_ids: [],
};

test("schedule preview persists edits, numeric task bindings and history without faking task execution", async () => {
  assert.equal((await api.schedules()).length, 0);
  const tasks = (await api.tasks()).tasks;
  const taskID = tasks[0].numeric_id;
  assert.ok(Number.isSafeInteger(taskID));
  const created = await api.createSchedule({ ...draft, task_ids: [taskID] });
  assert.ok(Number.isSafeInteger(created.id));
  assert.equal(created.name, draft.name);
  assert.equal(created.timezone, "Asia/Shanghai");
  assert.equal(JSON.stringify(created.weekdays), "[6,7]");
  assert.equal(created.start_time, "18:00");
  assert.equal(created.end_time, "06:00");
  assert.equal(created.run_count, 0);
  assert.equal((await api.schedules()).length, 1);
  created.name = "Client-only edit";
  assert.equal((await api.schedule(created.id)).name, draft.name);
  await api.renameSchedule(created.id, "用户计划");
  await api.updateScheduleRemark(created.id, "用户备注");
  await api.updateSchedule(created.id, { ...draft, name: "Updated", task_ids: [taskID], end_time: "" });
  assert.equal((await api.schedule(created.id)).remark, "用户备注");
  assert.equal((await api.schedule(created.id)).end_time, "");
  await api.pauseSchedule(created.id);
  const paused = await api.schedule(created.id);
  assert.equal(paused.enabled, false);
  assert.equal(paused.status, "paused");
  assert.equal(paused.history[0].action, "paused");
  await api.resumeSchedule(created.id);
  assert.equal((await api.schedule(created.id)).status, "waiting");
  await assert.rejects(api.runScheduleNow(created.id), /演示模式不会执行计划任务/);
  assert.equal((await api.schedule(created.id)).run_count, 0);
  await api.deleteSchedule(created.id);
  assert.equal((await api.schedules()).length, 0);
  await assert.rejects(api.schedule(created.id), /计划不存在/);
});

test("invalid preview schedules are rejected and task creation attaches a valid schedule atomically", async () => {
  await assert.rejects(api.createSchedule({ ...draft, task_ids: [Number.NaN] }), /绑定任务编号无效/);
  await assert.rejects(api.createSchedule({ ...draft, task_ids: [999999] }), /任务 #999999 不存在/);
  await assert.rejects(api.createSchedule({ ...draft, weekdays: [8] }), /星期选择必须/);
  await assert.rejects(
    api.createSchedule({ ...draft, schedule_type: "once", run_date: "2026-02-30" }),
    /开始日期格式不正确/,
  );
  await assert.rejects(
    api.createSchedule({ ...draft, schedule_type: "once", run_date: "2026-11-10", end_date: "2026-11-09" }),
    /截止日期不能早于/,
  );
  const initial = (await api.tasks()).tasks.length;
  await assert.rejects(
    api.createTask({
      description: "Original description",
      goal: "Original goal",
      schedule: { ...draft, start_time: "bad" },
    }),
    /开始时间格式不正确/,
  );
  assert.equal((await api.tasks()).tasks.length, initial);
  const task = await api.createTask({ description: "原始描述", goal: "原始目标", schedule: draft });
  const savedTask = (await api.tasks()).tasks.find((item) => item.id === task.id);
  const schedule = (await api.schedules()).find((item) => item.name === draft.name);
  assert.equal(savedTask.description, "原始描述");
  assert.equal(savedTask.goal, "原始目标");
  assert.equal(schedule.task_ids[0], savedTask.numeric_id);
  await api.deleteSchedule(schedule.id);
  await api.deleteTask(task.id);
});
