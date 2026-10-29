package agent

import (
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestRenderWorkerTaskContextKeepsOnlyRelevantHistory(t *testing.T) {
	longHint := "人工提示" + strings.Repeat("完整", 400)
	intent := &db.Node{ID: 100, Payload: []byte(`{"summary":"current intent","asset_ids":[1,2]}`)}
	data := map[string]any{
		"task":     map[string]any{"description": "whole task must not be injected", "goal": "unrelated global goal"},
		"coverage": map[string]any{"host_count": 99},
		"hints": []map[string]any{
			{"id": int64(1), "state": "active", "text": longHint, "traffic_refs": []any{int64(77)}},
		},
		"running_intents": []map[string]any{
			{"id": int64(100), "summary": "current intent", "state": "running", "asset_ids": []any{int64(1), int64(2)}, "parents": []int64{200, 205}, "yields": []int64{201}},
			{"id": int64(102), "summary": "unrelated running", "state": "running", "asset_ids": []any{int64(999)}, "yields": []int64{203}},
		},
		"recent_done_intents": []map[string]any{
			{"id": int64(101), "summary": "same asset history", "state": "done", "asset_ids": []any{int64(2)}, "yields": []int64{202}},
			{"id": int64(103), "summary": "unrelated done", "state": "done", "asset_ids": []any{int64(998)}, "yields": []int64{204}},
		},
		"recent_facts": []map[string]any{
			{"id": int64(200), "summary": "direct parent fact", "state": "done"},
			{"id": int64(201), "summary": "current result", "state": "done", "from_intent": int64(100)},
			{"id": int64(202), "summary": "same asset fact", "state": "done", "from_intent": int64(101)},
			{"id": int64(203), "summary": "unrelated fact", "state": "done", "from_intent": int64(102)},
			{"id": int64(204), "summary": "other unrelated fact", "state": "done", "from_intent": int64(103)},
		},
		"finding_list": []map[string]any{
			{"id": int64(300), "summary": "same asset finding", "from_intent": int64(101)},
			{"id": int64(301), "summary": "unrelated finding", "from_intent": int64(102)},
		},
		"cold_digests": []map[string]any{
			{"id": int64(400), "body": "relevant digest body", "work": []map[string]any{{"intent_id": int64(101), "state": "done"}}},
			{"id": int64(401), "body": "unrelated digest body", "work": []map[string]any{{"intent_id": int64(102), "state": "done"}}},
			{"id": int64(402), "body": "source ref relevant digest", "source_refs": map[string][]int64{"facts": {202}}},
			{"id": int64(403), "body": "source ref unrelated digest", "source_refs": map[string][]int64{"facts": {203}}},
		},
		"related_tasks": []map[string]any{
			{
				"source_task_id": int64(855),
				"hints":          []map[string]any{{"id": int64(2), "state": "active", "text": "source task hint"}},
				"recent_intent_results": []map[string]any{
					{"id": int64(501), "summary": "inherited same asset", "state": "done", "asset_ids": []any{int64(1)}, "yields": []int64{500}},
				},
				"recent_facts": []map[string]any{
					{"id": int64(500), "summary": "inherited relevant fact", "state": "done", "from_intent": int64(501)},
					{"id": int64(502), "summary": "inherited unrelated fact", "state": "done", "from_intent": int64(502)},
				},
			},
		},
	}

	got := renderWorkerTaskContext(data, intent)
	for _, want := range []string{
		longHint, `"traffic_refs":[77]`, "source task hint", `"source_task_id":855`,
		"same asset history", "direct parent fact", "current result", "same asset fact",
		"same asset finding", "relevant digest body", "source ref relevant digest", "inherited same asset", "inherited relevant fact",
		"205", "node_detail(id)", "list_facts", "expand_digest(id)",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("compact context missing %q:\n%s", want, got)
		}
	}
	for _, unwanted := range []string{
		"whole task must not be injected", "unrelated global goal", "host_count",
		"unrelated running", "unrelated done", "unrelated fact", "other unrelated fact",
		"unrelated finding", "unrelated digest body", "source ref unrelated digest", "inherited unrelated fact",
	} {
		if strings.Contains(got, unwanted) {
			t.Errorf("compact context leaked %q:\n%s", unwanted, got)
		}
	}
}

func TestWorkerCompactContextDefaultsOff(t *testing.T) {
	worker := &Worker{}
	if worker.compactContext() {
		t.Fatal("compact context must default to the original full overview")
	}
	worker.SetCompactContext(func() bool { return true })
	if !worker.compactContext() {
		t.Fatal("compact context resolver was not applied")
	}
}

func TestWorkerToolsRetainHistoryRecovery(t *testing.T) {
	toolSet := &ToolSet{}
	found := map[string]bool{}
	for _, tool := range toolSet.WorkerTools() {
		found[tool.Name()] = true
	}
	for _, name := range []string{"node_detail", "record_fact", "report_finding"} {
		if !found[name] {
			t.Errorf("original worker tool %s is missing", name)
		}
	}
	for _, name := range []string{"list_facts", "expand_digest"} {
		if found[name] {
			t.Errorf("default worker unexpectedly gained %s", name)
		}
	}
	for _, tool := range toolSet.workerHistoryTools() {
		found[tool.Name()] = true
	}
	for _, name := range []string{"list_facts", "expand_digest"} {
		if !found[name] {
			t.Errorf("compact-context recovery tool %s is missing", name)
		}
	}
}
