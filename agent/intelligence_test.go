package agent

import (
	"context"
	"encoding/json"
	"github.com/Autumn-27/mysterysecurityteam/db"
	"strings"
	"testing"
)

func TestIntelligenceGateRemovesTokenOverheadAndRejectsLiveWrites(t *testing.T) {
	oldEnabled, oldRecord := IntelligenceEnabled, IntelligenceRecord
	oldResolve, oldAugment := ToolResolve, ToolAugment
	defer func() {
		IntelligenceEnabled, IntelligenceRecord = oldEnabled, oldRecord
		ToolResolve, ToolAugment = oldResolve, oldAugment
	}()
	ToolResolve = nil
	ToolAugment = nil
	enabled := false
	calls := 0
	IntelligenceEnabled = func() bool { return enabled }
	IntelligenceRecord = func(_ context.Context, taskID, nodeID int64, worker string, in db.IntelligenceInput) (int64, error) {
		calls++
		if taskID != 42 || nodeID != 7 || worker != "qa" {
			t.Fatalf("bad attribution: %d %d %s", taskID, nodeID, worker)
		}
		return 123, nil
	}
	ts := NewToolSet(nil, "qa")
	ts.SetTaskID(42)
	ts.SetOwnerNode(7)
	ctx := WithRunInfo(context.Background(), RunInfo{TaskID: 42, IntentID: 7})
	tools, def, cleanup := AugmentTools(ctx, "worker", ts.WorkerTools())
	cleanup()
	if def.IntelligenceGuidance != "" {
		t.Fatal("disabled prompt overhead")
	}
	for _, tool := range tools {
		if tool.Name() == "record_intelligence" {
			t.Fatal("disabled tool exposed")
		}
		if tool.Name() == "record_fact" && strings.Contains(mustJSON(tool.InputSchema()), "intelligence") {
			t.Fatal("disabled schema overhead")
		}
	}
	enabled = true
	tools, def, cleanup = AugmentTools(ctx, "worker", ts.WorkerTools())
	cleanup()
	if def.IntelligenceGuidance == "" {
		t.Fatal("missing guidance")
	}
	input := json.RawMessage(`{"kind":"lead","title":"config path","content":"/tmp/qa","evidence":"fixture","confidence":"observed"}`)
	found := false
	for _, tool := range tools {
		if tool.Name() != "record_intelligence" {
			continue
		}
		found = true
		result, err := tool.Call(ctx, input, nil)
		if err != nil || result.IsError || calls != 1 || ts.Writes().Total() != 1 {
			t.Fatal("record failed", err, result.Flatten())
		}
		enabled = false
		result, err = tool.Call(ctx, input, nil)
		if err != nil || !result.IsError || calls != 1 {
			t.Fatal("live disable did not block write")
		}
	}
	if !found {
		t.Fatal("missing enabled tool")
	}
	enabled = true
	tools, def, cleanup = AugmentTools(context.Background(), "worker", ts.WorkerTools())
	cleanup()
	if def.IntelligenceGuidance != "" {
		t.Fatal("taskless guidance")
	}
	for _, tool := range tools {
		if tool.Name() == "record_intelligence" {
			t.Fatal("taskless tool")
		}
	}
}
func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }
func TestIntelligenceAssetAndFactWriteback(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("intelligence tool integration", "local fixtures", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	ts := NewToolSet(d.Exploration(task.ExplorationID), "qa")
	ts.SetTaskID(task.ID)
	ts.SetAssetStore(d.Assets(), d.Companies())
	node, err := d.Exploration(task.ExplorationID).AddIntent(map[string]any{"summary": "fixture"}, 5, nil, "qa")
	if err != nil {
		t.Fatal(err)
	}
	ts.SetOwnerNode(node)
	oldEnabled, oldRecord := IntelligenceEnabled, IntelligenceRecord
	defer func() { IntelligenceEnabled, IntelligenceRecord = oldEnabled, oldRecord }()
	IntelligenceEnabled = func() bool { return true }
	IntelligenceRecord = func(ctx context.Context, tid, nid int64, w string, in db.IntelligenceInput) (int64, error) {
		item, err := d.RecordIntelligence(ctx, tid, nid, w, in)
		if err != nil {
			return 0, err
		}
		return item.ID, nil
	}
	defer d.Exec(`DELETE FROM assets WHERE domain='intelligence-tool.example' OR root_domain='intelligence-tool.example'`)
	result := callInsertAssets(t, ts, map[string]any{"assets": []any{map[string]any{"type": "service", "url": "https://intelligence-tool.example", "auth": []any{map[string]any{"username": "qa", "password": "fixture"}}}}})
	if errs, ok := result["errors"].([]any); ok && len(errs) > 0 {
		t.Fatal(result)
	}
	raw := json.RawMessage(`{"summary":"found useful fixture","intelligence":[{"kind":"lead","title":"fixture path","content":"/tmp/config","evidence":"read fixture","confidence":"observed"}]}`)
	res, err := ts.recordFact().Call(context.Background(), raw, nil)
	if err != nil || res.IsError {
		t.Fatal("fact intelligence", err, res.Flatten())
	}
	page, err := d.ListIntelligence(t.Context(), db.IntelligenceFilter{TaskID: task.ID})
	if err != nil || page.Total != 2 || page.Counts["credential"] != 1 || page.Counts["lead"] != 1 {
		t.Fatalf("writebacks missing: %+v %v", page, err)
	}
	for _, item := range page.Items {
		if item.NodeID == nil {
			t.Fatal("lost source node")
		}
	}
}
