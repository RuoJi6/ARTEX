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
	for _, want := range []string{"【全局视图截断】", "graph_overview", "expand_digest(id)", "keep original goals"} {
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
