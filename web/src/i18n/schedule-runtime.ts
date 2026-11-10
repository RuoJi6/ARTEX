import type { TFunction } from "i18next";

// Recognize existing server-owned schedule messages, including stored history.
// Unknown details and user content are preserved verbatim.
const messages: Record<string, string> = {
  "演示模式不会执行计划任务，请在实际部署中运行": "schedule.runtime.demoNoExecution",
  计划编号无效: "schedule.runtime.invalidId",
  计划不存在: "schedule.runtime.notFound",
  无法启动计划任务: "schedule.runtime.cannotStart",
  计划名称不能为空: "schedule.runtime.nameRequired",
  时区必须选择北京时间或系统当前时区: "schedule.runtime.timezoneRequired",
  规则必须选择一次性或按周: "schedule.runtime.ruleRequired",
  "开始时间格式不正确，请使用 HH:MM": "schedule.runtime.startTimeInvalid",
  "结束时间格式不正确，请使用 HH:MM": "schedule.runtime.endTimeInvalid",
  开始日期格式不正确: "schedule.runtime.startDateInvalid",
  截止日期格式不正确: "schedule.runtime.endDateInvalid",
  截止日期不能早于开始日期: "schedule.runtime.endDateBeforeStart",
  同一天的结束时间必须晚于开始时间: "schedule.runtime.endTimeBeforeStart",
  星期选择必须为周一至周日且不能重复: "schedule.runtime.weekdaysInvalid",
  按周计划至少选择一天: "schedule.runtime.weekdaysRequired",
  绑定任务编号无效或重复: "schedule.runtime.taskIdsInvalid",
  最多选择100个任务: "schedule.runtime.tooManyTasks",
  "task_id 无效": "schedule.runtime.taskIdInvalid",
  手动立即运行: "schedule.runtime.manualRun",
  状态读取失败: "schedule.runtime.stateFailed",
  人工暂停优先: "schedule.runtime.manualPause",
  立即运行: "schedule.runtime.runNow",
  "立即运行（显式恢复人工暂停）": "schedule.runtime.forceResume",
  计划窗口: "schedule.runtime.window",
};
const taskMessages: [RegExp, string][] = [
  [/^任务 #(\d+) 未找到$/, "schedule.runtime.taskNotFound"],
  [/^任务 #(\d+) 不存在$/, "schedule.runtime.taskMissing"],
  [/^任务 #(\d+) 已结束，无法立即运行$/, "schedule.runtime.taskEnded"],
  [/^任务 #(\d+) 状态读取失败$/, "schedule.runtime.taskStateFailed"],
  [/^任务 #(\d+) 由人工暂停，计划不能强制恢复$/, "schedule.runtime.taskManualPause"],
];
export function scheduleRuntimeText(value: string, translate: TFunction): string {
  const key = messages[value];
  if (key) return translate(key);
  for (const [pattern, message] of taskMessages) {
    const match = pattern.exec(value);
    if (match) return translate(message, { id: match[1] });
  }
  // Scheduler summaries join several task failures with semicolons.
  if (value.includes("; ") && value.startsWith("任务 #"))
    return value
      .split("; ")
      .map((part) => scheduleRuntimeText(part, translate))
      .join("; ");
  const taskError = /^任务 #(\d+)[:：]\s*([\s\S]*)$/.exec(value);
  if (taskError)
    return translate("schedule.runtime.taskError", {
      id: taskError[1],
      message: scheduleRuntimeText(taskError[2], translate),
    });
  return value;
}
