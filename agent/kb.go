package agent

// KBEnabled, if set, reports whether an external knowledge base is configured. The
// server wires it to the Manager's KB state so the knowledge_search guidance is only
// injected into prompts when the tool actually exists (same wiring style as
// PromptOverride / ToolResolve).
var KBEnabled func() bool

// kbBlock is the code-owned note injected into worker/planner system prompts when an
// external knowledge base is on. Gated on KBEnabled so the prompt never references a
// tool that wasn't injected — otherwise the model would try to call a nonexistent tool.
func kbBlock() string {
	if KBEnabled == nil || !KBEnabled() {
		return ""
	}
	return "\n\n**知识检索（knowledge_search）**：遇到具体技术点（某 CVE 的利用方式、某框架的绕过技巧、某类漏洞的典型根因）先 knowledge_search 查外部知识库再动手。检索结果是【线索/参考】，不是结论——必须用真实命令/响应验证后，才能 record_fact / report_finding。"
}
