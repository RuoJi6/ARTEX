import type { TFunction } from "i18next";

import { localizedError } from "./errors";
import { scheduleRuntimeText } from "./schedule-runtime";

const messages: Record<string, string> = {
  请求正文过大: "taskUI.runtime.requestTooLarge",
  任务名称不能为空: "taskUI.runtime.nameRequired",
  "任务正在删除，无法控制": "taskUI.runtime.deleting",
  终态任务不能执行暂停: "taskUI.runtime.terminalPause",
  任务已经暂停: "taskUI.runtime.alreadyPaused",
  "Worker 运行数量不能为负数": "taskUI.runtime.workerNegative",
  模板名称已存在: "taskUI.runtime.templateExists",
  任务正在进行其他归档或删除操作: "taskUI.runtime.archiveBusy",
  "任务仍有运行中的 Agent，请先暂停后重试归档": "taskUI.runtime.agentsRunning",
  任务探索记录在归档快照期间发生变化: "taskUI.runtime.snapshotChanged",
  归档包路径为空: "taskUI.runtime.emptyArchivePath",
  归档包路径不在受管目录内: "taskUI.runtime.archivePathOutside",
  "归档 id 无效": "taskUI.runtime.invalidArchiveId",
  归档不存在: "taskUI.runtime.archiveNotFound",
  "任务 id 无效": "taskUI.runtime.invalidTaskId",
  "task_ids 不能为空": "taskUI.runtime.taskIdsRequired",
  "一次最多处理 100 个任务": "taskUI.runtime.taskBatchLimit",
  "archive_ids 不能为空": "taskUI.runtime.archiveIdsRequired",
  "一次最多处理 100 个归档": "taskUI.runtime.archiveBatchLimit",
  分类名称不能为空: "taskUI.runtime.categoryRequired",
  "分类名称最多 80 个字符": "taskUI.runtime.categoryLimit",
  分类名称已存在: "taskUI.runtime.categoryExists",
  "任务分类 id 无效": "taskUI.runtime.invalidCategoryId",
  "action 必须是 block 或 allow": "taskUI.runtime.invalidRuleAction",
};
const patterns: [RegExp, string][] = [
  [/^任务名称最多 (\d+) 个字符$/, "taskUI.runtime.nameLimit"],
  [/^备注最多 (\d+) 个字符$/, "taskUI.runtime.remarkLimit"],
  [/^Worker 运行数量最多 (\d+)$/, "taskUI.runtime.workerLimit"],
  [/^task_ids 数量必须为 1-(\d+)$/, "taskUI.runtime.taskIdCount"],
];
export function taskError(error: unknown, translate: TFunction): string {
  const value = scheduleRuntimeText(localizedError(error, translate), translate);
  if (messages[value]) return translate(messages[value]);
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(value);
    if (match) return translate(key, { limit: match[1] });
  }
  return value;
}
