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
	if !strings.Contains(guide, "不能直接取成员最高等级") || !strings.Contains(guide, "独立报告") {
		t.Fatal("missing preservation rules")
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
