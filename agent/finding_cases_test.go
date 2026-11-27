package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

func TestFindingCaseGuidanceRespectsToolsAndTrafficSwitch(t *testing.T) {
	tools := []actool.CoreTool{}
	for _, name := range []string{"search_finding_duplicates", "merge_finding_records", "get_finding_case", "update_finding_case_report"} {
		tools = append(tools, writeTool(name, name, obj(nil), func(context.Context, json.RawMessage) (actool.Result, error) { return actool.Text("ok"), nil }))
	}
	_, guide := findingCaseWorkflow("reporter", tools)
	if !strings.Contains(guide, "不能直接取成员最高等级") || !strings.Contains(guide, "独立报告") || !strings.Contains(guide, "由 AI 直接做出最终判断并完成合并") {
		t.Fatal("missing preservation or auto-merge rules")
	}
	if strings.Contains(guide, "suggest_finding_merge") {
		t.Fatal("retired suggest_finding_merge still referenced in workflow guidance")
	}
	if _, guide := findingCaseWorkflow("worker", tools); guide != "" {
		t.Fatal("worker changed")
	}
	if _, guide := findingCaseWorkflow("reporter", tools[:2]); guide != "" {
		t.Fatal("unbound tools reintroduced")
	}
	system, _ := deferredSystem("CUSTOM PROMPT", DeferredInfo{CaseGuidance: guide})
	if !strings.HasPrefix(system[0], "CUSTOM PROMPT") || !strings.Contains(system[0], guide) {
		t.Fatal("custom prompt lost")
	}
}

func TestHistoricalFindingReviewFiltersMutationAndProbeTools(t *testing.T) {
	oldAugment, oldResolve := ToolAugment, ToolResolve
	ToolAugment, ToolResolve = nil, nil
	t.Cleanup(func() { ToolAugment, ToolResolve = oldAugment, oldResolve })
	tools := []actool.CoreTool{}
	for _, name := range []string{"update_finding_report", "bind_finding_traffic", "report_finding", "suggest_finding_merge", "Bash", "Write", "Edit", "mcp__custom__write", "get_finding_record", "merge_finding_records", "search_finding_duplicates", "get_finding_case", "update_finding_case_report", "complete_finding_case_review"} {
		tools = append(tools, writeTool(name, name, obj(nil), func(context.Context, json.RawMessage) (actool.Result, error) { return actool.Text("ok"), nil }))
	}
	out, def, cleanup := AugmentTools(WithFindingCaseReview(t.Context()), "reporter", tools)
	defer cleanup()
	for _, tool := range out {
		switch tool.Name() {
		case "update_finding_report", "bind_finding_traffic", "report_finding", "suggest_finding_merge", "Bash", "Write", "Edit", "mcp__custom__write":
			t.Fatal("historical mutation or retired suggestion capability", tool.Name())
		}
	}
	if len(out) != 6 || def.FindingGuidance != "" || !strings.Contains(def.CaseGuidance, "历史整理模式") || !strings.Contains(def.CaseGuidance, "端点/路由") || !strings.Contains(def.CaseGuidance, "仅 independent 或 merged") || strings.Contains(def.CaseGuidance, "suggest_finding_merge") {
		t.Fatal("missing historical isolation or auto-merge guidance", def)
	}
	normal, _, cl := AugmentTools(t.Context(), "reporter", tools)
	defer cl()
	found := map[string]bool{}
	for _, tool := range normal {
		found[tool.Name()] = true
	}
	if !found["update_finding_report"] || !found["Bash"] || !found["report_finding"] {
		t.Fatal("normal reporting was restricted")
	}
}
