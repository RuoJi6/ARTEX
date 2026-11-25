package db

import (
	"encoding/json"
	"slices"
	"strconv"
	"testing"
)

func TestInterceptApprovalFilters(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	scope := "approval-filter-" + t.Name()
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id IN ($1,$2)`, scope, scope+"-other") })
	rule, err := d.CreateInterceptRule("filter fixture", "tool_name", "string", "Bash", "deny", "fixture", 1, true, false, 0, "deny")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_rules WHERE id=$1`, rule.ID) })
	filter := InterceptApprovalFilter{Status: "denied", DecisionSource: "model"}
	basePage, err := d.ListAllInterceptsPage(1, 20, filter)
	if err != nil {
		t.Fatal(err)
	}
	baseline := basePage.Total
	expected := []int64{}
	for _, task := range []string{scope, scope + "-other"} {
		copies := 3
		if task != scope {
			copies = 1
		}
		for _, status := range []string{"pending", "allowed", "denied", "timeout"} {
			for _, source := range []string{"model", "rule", "unknown"} {
				for i := 0; i < copies; i++ {
					var ruleID int64
					reason := "legacy reason"
					if source == "rule" {
						ruleID = rule.ID
					}
					if source == "model" {
						reason = "[模型] fixture"
					}
					id, err := d.CreateDecidedIntercept(ruleID, 0, task, "test", "Bash", []byte(`{"command":"fixture"}`), status, reason)
					if err != nil {
						t.Fatal(err)
					}
					// Legacy source fields and tied timestamps must filter/page consistently.
					if i == 0 {
						if _, err = d.Exec(`UPDATE intercept_pending SET decision_source='' WHERE id=$1`, id); err != nil {
							t.Fatal(err)
						}
					}
					if task == scope && status == "denied" && source == "model" {
						expected = append(expected, id)
					}
				}
			}
		}
	}
	if _, err := d.Exec(`UPDATE intercept_pending SET created_at='2099-01-01' WHERE task_id IN ($1,$2)`, scope, scope+"-other"); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		filter InterceptApprovalFilter
		want   int
	}{
		{"all", InterceptApprovalFilter{}, 36},
	}
	for _, s := range []string{"pending", "allowed", "denied", "timeout"} {
		cases = append(cases, struct {
			name   string
			filter InterceptApprovalFilter
			want   int
		}{s, InterceptApprovalFilter{Status: s}, 9})
	}
	for _, s := range []string{"model", "rule", "unknown"} {
		cases = append(cases, struct {
			name   string
			filter InterceptApprovalFilter
			want   int
		}{s, InterceptApprovalFilter{DecisionSource: s}, 12})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := d.ListTaskInterceptsPage(scope, 1, 100, tc.filter)
			if err != nil || res.Total != tc.want || len(res.Items) != tc.want {
				t.Fatalf("count=%d rows=%d err=%v", res.Total, len(res.Items), err)
			}
			for _, r := range res.Items {
				if r.TaskID == nil || *r.TaskID != scope || tc.filter.Status != "" && r.Status != tc.filter.Status || tc.filter.DecisionSource != "" && r.DecisionSource != tc.filter.DecisionSource {
					t.Fatalf("nonmatching row: %+v", r)
				}
			}
		})
	}
	slices.Reverse(expected)
	var seen []int64
	for page := 1; page <= 2; page++ {
		res, err := d.ListTaskInterceptsPage(scope, page, 2, filter)
		if err != nil || res.Total != 3 {
			t.Fatalf("page %d total=%d err=%v", page, res.Total, err)
		}
		if wantMore := page == 1; res.HasMore != wantMore {
			t.Fatalf("page %d hasMore=%v want=%v", page, res.HasMore, wantMore)
		}
		for _, r := range res.Items {
			seen = append(seen, r.ID)
		}
	}
	if !slices.Equal(seen, expected) {
		t.Fatalf("unstable combined-filter pagination: got %v want %v", seen, expected)
	}
	res, err := d.ListTaskInterceptsPage(scope, 3, 2, filter)
	if err != nil || len(res.Items) != 0 || res.Total != 3 || res.HasMore {
		t.Fatalf("empty page count=%d rows=%d hasMore=%v err=%v", res.Total, len(res.Items), res.HasMore, err)
	}
	globalRes, err := d.ListAllInterceptsPage(1, 100, filter)
	if err != nil || globalRes.Total != baseline+4 {
		t.Fatalf("global filter count=%d want=%d err=%v", globalRes.Total, baseline+4, err)
	}
	// Values must remain SQL parameters even for direct store callers.
	res, err = d.ListTaskInterceptsPage(scope, 1, 20, InterceptApprovalFilter{Status: "denied' OR 1=1 --"})
	if err != nil || res.Total != 0 || len(res.Items) != 0 {
		t.Fatalf("invalid value escaped filter: %d %v", res.Total, err)
	}
	// A rule's persisted source survives deletion of its associated rule.
	_, err = d.Exec(`UPDATE intercept_pending SET decision_source='rule' WHERE task_id=$1 AND rule_id=$2`, scope, rule.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = d.DeleteInterceptRule(rule.ID); err != nil {
		t.Fatal(err)
	}
	res, err = d.ListTaskInterceptsPage(scope, 1, 100, InterceptApprovalFilter{DecisionSource: "rule"})
	if err != nil || res.Total != 12 {
		t.Fatalf("deleted-rule source count=%d err=%v", res.Total, err)
	}
	for _, r := range res.Items {
		if r.RuleID != nil || r.DecisionSource != "rule" {
			t.Fatal("deleted rule lost its source")
		}
	}

	modelInput := json.RawMessage(`{"script_files":[{"path":"scripts/check.py","content":"https://example.test/a?x=100%"}]}`)
	searchID, err := d.CreateDecidedIntercept(0, 0, scope, "search-agent", "Bash", []byte(`{"command":"python3 scripts/check.py"}`), "denied", "[模型] searched", &InterceptAudit{ModelInput: modelInput, Output: "response contains example.test"})
	if err != nil {
		t.Fatal(err)
	}
	res, err = d.ListTaskInterceptsPage(scope, 1, 20, InterceptApprovalFilter{Search: "example.test"})
	if err != nil || res.Total != 1 || len(res.Items) != 1 || res.Items[0].ID != searchID {
		t.Fatalf("snapshot search total=%d rows=%d err=%v", res.Total, len(res.Items), err)
	}
	res, err = d.ListTaskInterceptsPage(scope, 1, 20, InterceptApprovalFilter{Search: "100%"})
	if err != nil || res.Total != 1 || len(res.Items) != 1 {
		t.Fatalf("literal percent search total=%d rows=%d err=%v", res.Total, len(res.Items), err)
	}
	res, err = d.ListTaskInterceptsPage(scope, 1, 20, InterceptApprovalFilter{Search: "#" + strconv.FormatInt(searchID, 10)})
	if err != nil || res.Total != 1 || len(res.Items) != 1 || res.Items[0].ID != searchID {
		t.Fatalf("id search total=%d rows=%d err=%v", res.Total, len(res.Items), err)
	}
	res, err = d.ListTaskInterceptsPage(scope, 1, 20, InterceptApprovalFilter{
		Search: "example.test", CreatedFrom: "2099-01-01", CreatedTo: "2099-01-01",
	})
	if err != nil || res.Total != 1 || len(res.Items) != 1 || res.Items[0].ID != searchID {
		t.Fatalf("date search total=%d rows=%d err=%v", res.Total, len(res.Items), err)
	}
}

func TestInterceptPendingSummaryAndBoundedCount(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	scope := "approval-summary-" + t.Name()
	other := scope + "-other"
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id IN ($1,$2)`, scope, other) })

	baseCount, err := d.CountPendingIntercepts()
	if err != nil {
		t.Fatal(err)
	}

	for _, agent := range []string{"mainagent", "work#1 · #101", "work#1 · #101", "planner"} {
		if _, err := d.CreateInterceptPending(0, 0, scope, agent, "Bash", []byte(`{"command":"id"}`), "ask"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.CreateInterceptPending(0, 0, other, "mainagent", "Bash", []byte(`{"command":"id"}`), "ask"); err != nil {
		t.Fatal(err)
	}
	for range 8 {
		if _, err := d.CreateDecidedIntercept(0, 0, scope, "work#2 · #202", "Bash", []byte(`{"command":"ls"}`), "allowed", "ok"); err != nil {
			t.Fatal(err)
		}
	}

	globalCount, err := d.CountPendingIntercepts()
	if err != nil || globalCount != baseCount+5 {
		t.Fatalf("CountPendingIntercepts=%d want=%d err=%v", globalCount, baseCount+5, err)
	}
	summary, err := d.TaskPendingInterceptSummary(scope)
	if err != nil {
		t.Fatal(err)
	}
	wantAgents := []string{"mainagent", "planner", "work#1 · #101"}
	if summary.Count != 4 || !slices.Equal(summary.AgentNames, wantAgents) {
		t.Fatalf("TaskPendingInterceptSummary=%+v want count=4 agents=%v", summary, wantAgents)
	}
	taskPending, err := d.ListPendingInterceptsByTask(scope)
	if err != nil || len(taskPending) != 4 {
		t.Fatalf("ListPendingInterceptsByTask len=%d err=%v", len(taskPending), err)
	}
	limited, err := d.ListTaskInterceptsLimit(scope, 5)
	if err != nil || len(limited) != 5 {
		t.Fatalf("ListTaskInterceptsLimit len=%d err=%v", len(limited), err)
	}

	// Exercise bounded count cap and unfiltered approximate estimate without
	// inserting tens of thousands of rows.
	prevCap := interceptExactCountCap
	interceptExactCountCap = 5
	t.Cleanup(func() { interceptExactCountCap = prevCap })

	capped, err := d.ListTaskInterceptsPage(scope, 1, 3, InterceptApprovalFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(capped.Items) != 3 || !capped.HasMore || !capped.TotalApproximate || !capped.TotalCapped || capped.Total != 5 {
		t.Fatalf("capped task page=%+v", capped)
	}

	if _, err := d.Exec(`ANALYZE intercept_pending`); err != nil {
		t.Fatal(err)
	}
	approx, err := d.ListAllInterceptsPage(1, 3, InterceptApprovalFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(approx.Items) != 3 || !approx.HasMore || !approx.TotalApproximate || approx.TotalCapped || approx.Total < 13 {
		t.Fatalf("unfiltered approximate page=%+v", approx)
	}
}
