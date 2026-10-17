package agent

import (
	actool "github.com/Autumn-27/norma/tool"
)

// kbBlock is the code-owned note injected into worker/planner system prompts when the
// task has the external knowledge base turned on (tasks.kb_enabled). enabled=false →
// empty, so the prompt never references a tool that wasn't injected — otherwise the
// model would try to call a nonexistent tool.
func kbBlock(enabled bool) string {
	if !enabled {
		return ""
	}
	return "\n\n**知识检索（knowledge_search）**：遇到具体技术点（某 CVE 的利用方式、某框架的绕过技巧、某类漏洞的典型根因）先 knowledge_search 查外部知识库再动手。检索结果是【线索/参考】，不是结论——必须用真实命令/响应验证后，才能 record_fact / report_finding。"
}

// dropKBTool removes knowledge_search from an assembled tool list. Used by worker/
// planner to hide the KB tool for tasks with kb_enabled=false (per-task gating,
// mirroring the coverage_enabled per-task toggle).
func dropKBTool(tools []actool.CoreTool) []actool.CoreTool {
	out := tools[:0]
	for _, t := range tools {
		if t.Name() == "knowledge_search" {
			continue
		}
		out = append(out, t)
	}
	return out
}
