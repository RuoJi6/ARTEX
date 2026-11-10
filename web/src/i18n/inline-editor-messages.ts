export const inlineEditorMessages = {
  "inlineEditor.remark": ["备注", "Notes"],
  "inlineEditor.name": ["名称", "Name"],
  "inlineEditor.addRemark": ["添加备注", "Add notes"],
  "inlineEditor.unnamed": ["未命名", "Untitled"],
  "inlineEditor.nameRequired": ["名称不能为空", "Name is required"],
  "inlineEditor.tooLong": ["{{field}}最多 {{max}} 个字符", "{{field}} must be {{max}} characters or fewer"],
  "inlineEditor.saved": ["{{field}}已保存", "{{field}} saved"],
  "inlineEditor.saveFailed": ["{{field}}保存失败：{{message}}", "Could not save {{field}}: {{message}}"],
  "inlineEditor.fieldLabel": ["{{label}}{{field}}", "{{field}} for {{label}}"],
  "inlineEditor.multilineHelp": [
    "Enter 保存，Shift+Enter 换行，Esc 取消；留空可清除备注",
    "Enter to save, Shift+Enter for a new line, Esc to cancel; leave empty to clear notes",
  ],
  "inlineEditor.singleHelp": ["Enter 或失焦保存，Esc 取消", "Enter or click elsewhere to save, Esc to cancel"],
  "inlineEditor.clickLabel": ["{{label}}{{field}}，点击编辑", "{{field}} for {{label}}; click to edit"],
  "inlineEditor.clickEdit": ["点击编辑{{field}}", "Click to edit {{field}}"],
  "inlineEditor.editLabel": ["编辑{{label}}的{{field}}", "Edit {{field}} for {{label}}"],
  "inlineEditor.editHelp": [
    "编辑{{field}}：输入完成后按 Enter 或点击其他位置保存，按 Esc 取消。",
    "Edit {{field}}: press Enter or click elsewhere to save, or press Esc to cancel.",
  ],
} as const;
