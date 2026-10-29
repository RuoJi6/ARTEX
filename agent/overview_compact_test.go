package agent

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestPlannerOverviewPreservesDigestDecisionFields(t *testing.T) {
	data := map[string]any{
		"task":          map[string]any{"description": "authorized fixture", "goal": "review evidence"},
		"frontier_open": 0, "done_intents_total": 2, "facts": 2, "findings_total": 1,
		"cold_digests": []map[string]any{{
			"id": int64(42), "member_count": 5, "body": "SOURCE DIGEST: confirmed and negative conclusions coexist",
			"work": []map[string]any{{"intent_id": int64(8), "state": "done"}, {"intent_id": int64(9), "state": "blocked"}},
			"key_results": []map[string]any{
				{"fact_id": int64(10), "state": "confirmed", "confidence": "observed", "summary": "tenant A order is readable"},
				{"fact_id": int64(11), "state": "confirmed", "confidence": "inferred", "summary": "tenant C order was not readable", "conditions": "expired token only"},
			},
			"unresolved":  []map[string]any{{"intent_id": int64(9), "state": "blocked", "reason": "remaining tenant unavailable"}},
			"source_refs": map[string][]int64{"intents": {8, 9}, "facts": {10, 11}, "findings": {12}},
		}},
		"cold_digests_more": []int64{43, 44},
	}
	card := data["cold_digests"].([]map[string]any)[0]
	results := card["key_results"].([]map[string]any)
	for i := range 12 {
		results = append(results, map[string]any{
			"fact_id": int64(20 + i), "state": "confirmed", "confidence": "observed",
			"summary": "additional observed result with a persistent source identifier",
		})
	}
	card["key_results"] = results
	got := plannerOverviewText(data)
	for _, want := range []string{
		"SOURCE DIGEST: confirmed and negative", "#8/done", "#9/blocked",
		"Fact #10 [confirmed/observed] tenant A order is readable",
		"Fact #11 [confirmed/inferred] tenant C order was not readable",
		"conditions=expired token only", "未完成: #9 [blocked] remaining tenant unavailable",
		"关联发现: 12", "43,44", "graph_overview", "expand_digest(id)",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("lost %q in compact overview:\n%s", want, got)
		}
	}
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) >= len(raw) {
		t.Fatalf("expected compact view to be shorter than JSON: view=%d json=%d", len(got), len(raw))
	}
}

func TestPlannerOverviewDigestBodyTruncationHasRecoveryPath(t *testing.T) {
	data := map[string]any{
		"cold_digests": []map[string]any{
			{"id": int64(42), "body": strings.Repeat("原始历史结论", 500), "member_count": 19},
			{"id": int64(43), "body": "OLD BODY MUST SURVIVE", "member_count": 1},
		},
		"cold_digests_more": []int64{44, 45},
	}
	got := plannerOverviewText(data)
	for _, want := range []string{"原始历史结论", "摘要已截断", "expand_digest(42)", "OLD BODY MUST SURVIVE", "44,45"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing disclosure %q in:\n%s", want, got)
		}
	}
}

func TestPlannerOverviewFormatsCoverageRatio(t *testing.T) {
	ratio := 0.325
	data := map[string]any{
		"coverage": map[string]any{"host_count": 3, "tested": 13, "denominator": 40, "pct": &ratio},
		"related_tasks": []map[string]any{{
			"source_task_id": 12,
			"task":           map[string]any{"status": "done", "description": "source"},
			"asset_coverage": map[string]any{"tested": 1, "denominator": 8, "pct": 0.125},
		}},
	}
	got := plannerOverviewText(data)
	if !strings.Contains(got, "pct=32.5%") || !strings.Contains(got, "pct=12.5%") || strings.Contains(got, "0x") {
		t.Fatalf("incorrect coverage formatting: %s", got)
	}
}

func TestPlannerOverviewGlobalLimitKeepsRecoveryPath(t *testing.T) {
	items := make([]map[string]any, 200)
	for i := range items {
		items[i] = map[string]any{"id": i, "state": "running", "summary": strings.Repeat("测试背景", 100)}
	}
	got := plannerOverviewText(map[string]any{
		"task":            map[string]any{"description": "test", "goal": "keep original goals"},
		"running_intents": items,
	})
	if utf8.RuneCountInString(got) > plannerOverviewMaxRunes || !utf8.ValidString(got) {
		t.Fatalf("invalid capped view: runes=%d", utf8.RuneCountInString(got))
	}
	for _, want := range []string{"本节已截断", "graph_overview", "expand_digest(id)", "keep original goals"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q after global limit", want)
		}
	}
}

func TestPlannerOverviewPreservesHintTrafficRefs(t *testing.T) {
	got := plannerOverviewText(map[string]any{
		"hints": []map[string]any{{"id": 12, "text": "proof", "traffic_refs": []map[string]any{{"traffic_id": "packet-42", "role": "proof"}}}},
	})
	for _, want := range []string{`traffic_refs=`, `"traffic_id":"packet-42"`, `"role":"proof"`} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in overview: %s", want, got)
		}
	}
}

func TestPlannerOverviewTruncationKeepsCriticalHistoryAndRecovery(t *testing.T) {
	completed := make([]map[string]any, 200)
	for i := range completed {
		completed[i] = map[string]any{"id": i, "state": "done", "summary": strings.Repeat("次要完成历史", 100)}
	}
	related := make([]map[string]any, 20)
	for i := range related {
		digests := make([]map[string]any, 6)
		for j := range digests {
			digests[j] = map[string]any{"id": int64(1000 + j), "body": strings.Repeat("关联历史", 250), "member_count": 2}
		}
		related[i] = map[string]any{
			"source_task_id": int64(12 + i), "task": map[string]any{"description": "secondary related history"},
			"cold_digests": digests,
		}
	}
	got := plannerOverviewText(map[string]any{
		"task":            map[string]any{"description": "critical task", "goal": "critical goal"},
		"goals":           []map[string]any{{"id": 1, "state": "open", "text": "critical goal"}},
		"hints":           []map[string]any{{"id": 2, "text": "critical hint"}},
		"running_intents": []map[string]any{{"id": 3, "state": "running", "summary": "critical running work"}},
		"cold_digests": []map[string]any{{
			"id": int64(42), "member_count": 1, "body": "CRITICAL DIGEST HISTORY",
			"unresolved": []map[string]any{{"intent_id": int64(9), "state": "blocked", "reason": "critical unresolved boundary"}},
		}},
		"recent_done_intents": completed,
		"related_tasks":       related,
	})
	for _, want := range []string{
		"critical goal", "critical hint", "critical running work", "CRITICAL DIGEST HISTORY",
		"critical unresolved boundary", "【全局视图截断】", "graph_overview", "expand_digest(id)",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("critical content %q missing after truncation:\n%s", want, got)
		}
	}
	if strings.Index(got, "CRITICAL DIGEST HISTORY") > strings.Index(got, "近期完成/中断") {
		t.Fatal("secondary completed history was emitted before critical digest history")
	}
}

func TestPlannerOverviewRecoveryIDsSurviveLargeRecords(t *testing.T) {
	goals := make([]map[string]any, 100)
	for i := range goals {
		goals[i] = map[string]any{"id": i, "text": strings.Repeat("目", 600)}
	}
	results := make([]map[string]any, 200)
	for i := range results {
		results[i] = map[string]any{"fact_id": i, "summary": strings.Repeat("事实", 400)}
	}
	for _, data := range []map[string]any{
		{"goals": goals, "cold_digests": []map[string]any{{"id": 42}, {"id": 43}}, "related_tasks": []map[string]any{{"cold_digests": []map[string]any{{"id": 44}}}}},
		{"cold_digests": []map[string]any{{"id": 42, "key_results": results}, {"id": 43}}},
	} {
		got := plannerOverviewText(data)
		for _, want := range []string{"Digest ID: 42,43", "expand_digest(id)", "【全局视图截断】"} {
			if !strings.Contains(got, want) {
				t.Fatalf("missing %q after truncation", want)
			}
		}
		if data["related_tasks"] != nil && !strings.Contains(got, "42,43,44") {
			t.Fatal("missing related digest recovery ID")
		}
		if utf8.RuneCountInString(got) > plannerOverviewMaxRunes {
			t.Fatal("overview exceeds limit")
		}
	}
}

func TestPlannerOverviewReservesRunningAndHints(t *testing.T) {
	goals := make([]map[string]any, 100)
	for i := range goals {
		goals[i] = map[string]any{"id": i, "text": strings.Repeat("目", 600)}
	}
	running := make([]map[string]any, 300)
	for i := range running {
		running[i] = map[string]any{"id": i, "state": "running", "summary": strings.Repeat("工", 340)}
	}
	got := plannerOverviewText(map[string]any{
		"goals": goals, "running_intents": running, "running_intents_total": 300,
		"hints": []map[string]any{{"id": 900, "text": "must preserve hint"}},
	})
	for _, want := range []string{"running_intents_total=300", "hints=1", "执行中 running_intents", "must preserve hint", "本节已截断", "graph_overview"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q after truncation", want)
		}
	}
	if utf8.RuneCountInString(got) > plannerOverviewMaxRunes {
		t.Fatal("overview exceeds limit")
	}
}

func TestOverviewFindsRunningIntentOutsideRecentWindow(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("older running", "older running", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	id, err := store.AddIntent(map[string]any{"summary": "old active work"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentState(id, "running"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO exploration_nodes(exploration_id, kind, payload, state) SELECT $1, 'intent', '{}', 'done' FROM generate_series(1, 301)`, task.ExplorationID); err != nil {
		t.Fatal(err)
	}
	data := NewToolSet(store, "").graphOverviewData()
	if data["running_intents_total"] != 1 {
		t.Fatalf("running total = %v", data["running_intents_total"])
	}
	if got := plannerOverviewText(data); !strings.Contains(got, "old active work") || !strings.Contains(got, "running_intents_total=1") {
		t.Fatalf("older running work missing from overview: %s", got)
	}
}

func TestOverviewOnlyIncludesActiveHints(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("active hints", "active hints", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	if _, err := d.Exec(`INSERT INTO exploration_nodes(exploration_id,kind,payload,state) VALUES
		($1,'hint','{"text":"keep active hint"}','active'),
		($1,'hint','{"text":"remove completed hint"}','consumed')`, task.ExplorationID); err != nil {
		t.Fatal(err)
	}
	data := NewToolSet(d.Exploration(task.ExplorationID), "").graphOverviewData()
	got := plannerOverviewText(data)
	if !strings.Contains(got, "keep active hint") || strings.Contains(got, "remove completed hint") {
		t.Fatalf("hint lifecycle filtering failed: %s", got)
	}
}

func TestRenderGraphOverviewConverterToggle(t *testing.T) {
	data := map[string]any{
		"task":          map[string]any{"description": "authorized fixture", "goal": "review evidence"},
		"frontier_open": float64(0),
		"recent_facts":  []map[string]any{{"id": float64(7), "summary": "source fact"}},
	}
	compact := renderGraphOverview(data, true)
	if !strings.Contains(compact, "同源压缩视图") || strings.Contains(compact, `"recent_facts"`) {
		t.Fatalf("converter was not applied: %s", compact)
	}
	full := renderGraphOverview(data, false)
	if !strings.Contains(full, `"recent_facts"`) || !strings.Contains(full, "source fact") || strings.Contains(full, "同源压缩视图") {
		t.Fatalf("full JSON was not restored: %s", full)
	}
}
