export const findingMessages = {
  "findingDetail.remark": ["备注", "Notes"],
  "findingDetail.addRemark": ["添加备注", "Add notes"],
  "findingDetail.editRemark": ["编辑备注", "Edit notes"],
  "findingDetail.remarkEmpty": [
    "暂无备注，点击添加排查记录或复核备忘",
    "No notes yet. Click to add review notes or reminders.",
  ],
  "findingDetail.remarkEmptyReadOnly": ["暂无备注", "No notes"],
  "findingDetail.remarkPlaceholder": [
    "记录排查结论、利用条件或复核备忘…",
    "Record triage notes, exploit conditions, or follow-up reminders…",
  ],
  "findingDetail.remarkHint": [
    "Ctrl/⌘ + Enter 保存，Esc 取消；留空保存可清除备注",
    "Ctrl/⌘ + Enter to save, Esc to cancel; save empty to clear",
  ],
  "findingDetail.remarkTooLong": ["备注最多 {{max}} 个字符", "Notes must be {{max}} characters or fewer"],
  "findingDetail.remarkSaved": ["备注已保存", "Notes saved"],
  "findingDetail.remarkCleared": ["备注已清除", "Notes cleared"],
  "findingDetail.editButton": ["编辑", "Edit"],
  "findingDetail.editTitle": ["编辑漏洞", "Edit finding"],
  "findingDetail.editDescription": [
    "手工修改当前漏洞的标题、分类、严重等级、状态、内容与备注。",
    "Manually update the finding title, category, severity, status, details, and notes.",
  ],
  "findingDetail.nameLabel": ["漏洞标题", "Title"],
  "findingDetail.summaryPlaceholder": [
    "简要描述漏洞位置、成因与影响…",
    "Summarize the affected component, root cause, and impact…",
  ],
  "findingDetail.evidencePlaceholder": [
    "粘贴关键请求、响应片段或复现 PoC…",
    "Paste key requests, response snippets, or PoC…",
  ],
  "findingDetail.reportPlaceholder": ["支持 Markdown 格式的详细漏洞报告…", "Detailed Markdown vulnerability report…"],
  "findingDetail.findingSaved": ["漏洞信息已更新", "Finding updated"],
} as const;
