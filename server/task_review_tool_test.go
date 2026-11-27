package server

import (
	"context"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestTaskReviewToolRejectsInvalidInput(t *testing.T) {
	s := &Server{m: &Manager{tasks: map[string]*Task{"no-graph": {ID: "no-graph"}}}}
	tool := workflowTool(t, s.orchestrationTools(), "get_task_review")
	for _, raw := range []string{`{`, `{}`, `{"task_id":42}`, `{"task_id":"  "}`, `{"task_id":"missing"}`, `{"task_id":"no-graph"}`, `{"task_id":"missing","page":0}`, `{"task_id":"missing","page":100001}`} {
		r, err := tool.Call(context.Background(), json.RawMessage(raw), nil)
		if err != nil || !r.IsError {
			t.Errorf("input %q: expected a tool error, got %v %s", raw, err, r.Flatten())
		}
	}
}

func TestTaskReviewTextOnlyIncludesBoundedDisplayFields(t *testing.T) {
	for _, tc := range []struct {
		kind, payload, want string
	}{
		{db.KindGoal, `{"text":" 复核报告 "}`, "复核报告"},
		{db.KindGoal, `{"text":"` + strings.Repeat("字", 161) + `"}`, strings.Repeat("字", 160) + "…"},
		{db.KindIntent, `{"text":"内部描述","summary":"内部摘要"}`, ""},
		{db.KindFinding, `{"name":"已有发现","summary":"内部摘要","evidence":"敏感证据"}`, "已有发现"},
		{db.KindFinding, `{"summary":"内部摘要","evidence":"敏感证据"}`, ""},
		{db.KindGoal, `{"text":123}`, ""},
	} {
		if got := taskReviewText(&db.Node{Kind: tc.kind, Payload: json.RawMessage(tc.payload)}); got != tc.want {
			t.Errorf("%s payload %s: got %q, want %q", tc.kind, tc.payload, got, tc.want)
		}
	}
}

func TestTaskReviewToolReadsOriginalTaskWithoutChanges(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("ARTEX_PG_DSN not configured")
	}
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	s := &Server{m: m} // No engine: review must not depend on execution services.
	s.seedOrchestrationTools()
	seed, err := m.PG().GetTool("get_task_review")
	if err != nil || seed == nil || !seed.Enabled || !slices.Contains(seed.Agents, "auto") {
		t.Fatalf("default Auto binding missing: %+v, %v", seed, err)
	}
	original, err := m.CreateTask("original", "", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	other, err := m.CreateTask("other", "", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	original.updateLifecycle(func(state *taskLifecycleState) { state.Status = "done" })
	add := func(task *Task, kind, state string, payload map[string]any) int64 {
		t.Helper()
		id, err := task.Store.AddNode(kind, payload, 0, state, "test", nil)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	goal := add(original, db.KindGoal, "open", map[string]any{"text": "review existing report"})
	add(original, db.KindGoal, "met", map[string]any{"text": "finished goal"})
	first := add(original, db.KindIntent, "open", map[string]any{"summary": "internal intent details"})
	for i := 0; i < taskReviewPageSize-1; i++ {
		add(original, db.KindIntent, "open", nil)
	}
	paused := add(original, db.KindIntent, "paused", nil)
	add(original, db.KindIntent, "done", nil)
	finding := add(original, db.KindFinding, "confirmed", map[string]any{"name": "Recorded result", "evidence": "internal evidence"})
	add(other, db.KindFinding, "confirmed", map[string]any{"name": "other task result"})
	before := original.lifecycleSnapshot()
	activeBefore := m.ActiveTask()
	tasksBefore := len(m.List())

	review := func(page int) taskReview {
		t.Helper()
		text := workflowCall(t, context.Background(), s.toolGetTaskReview(), map[string]any{"task_id": original.ID, "page": page}, false)
		for _, excluded := range []string{"finished goal", "internal intent details", "internal evidence", "other task result"} {
			if strings.Contains(text, excluded) {
				t.Errorf("unexpected data in review: %s", excluded)
			}
		}
		var got taskReview
		if err := json.Unmarshal([]byte(text), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}
	got := review(1)
	if got.TaskID != original.ID || got.Status != "done" || !got.ReadOnly || got.PageSize != taskReviewPageSize || got.Page != 1 {
		t.Fatalf("wrong review metadata: %+v", got)
	}
	if got.Goals.Total != 1 || !slices.Equal(got.Goals.Items, []taskReviewItem{{NodeID: goal, State: "open", Text: "review existing report"}}) ||
		got.Findings.Total != 1 || !slices.Equal(got.Findings.Items, []taskReviewItem{{NodeID: finding, State: "confirmed", Text: "Recorded result"}}) {
		t.Fatalf("wrong goals or findings: %+v", got)
	}
	if got.Intents.Total != taskReviewPageSize+1 || len(got.Intents.Items) != taskReviewPageSize || got.Intents.Items[0] != (taskReviewItem{NodeID: paused, State: "paused"}) {
		t.Fatalf("wrong first page of intents: %+v", got.Intents)
	}
	if got := review(2); got.Intents.Total != taskReviewPageSize+1 || !slices.Equal(got.Intents.Items, []taskReviewItem{{NodeID: first, State: "open"}}) || len(got.Goals.Items) != 0 {
		t.Fatalf("wrong second page: %+v", got)
	}
	if after := original.lifecycleSnapshot(); after.Status != before.Status || after.Paused != before.Paused || after.Queued != before.Queued || len(m.List()) != tasksBefore || m.ActiveTask() != activeBefore {
		t.Fatalf("review changed task state: before=%+v after=%+v", before, after)
	}
}
