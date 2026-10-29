package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlannerCompactOverviewSettingsRoundTrip(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	old, existed, err := m.pg.GetSetting(settingPlannerCompactOverview)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if existed {
			_ = m.pg.SetSetting(settingPlannerCompactOverview, old)
		} else {
			_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", settingPlannerCompactOverview)
		}
	})
	if _, err := m.pg.Exec("DELETE FROM settings WHERE key=$1", settingPlannerCompactOverview); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())

	get := func() map[string]any {
		t.Helper()
		res := httptest.NewRecorder()
		s.getSettings(res, httptest.NewRequest(http.MethodGet, "/api/settings", nil))
		if res.Code != http.StatusOK {
			t.Fatalf("GET settings status=%d body=%s", res.Code, res.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		return payload
	}
	put := func(body string) map[string]any {
		t.Helper()
		res := httptest.NewRecorder()
		s.putSettings(res, httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body)))
		if res.Code != http.StatusOK {
			t.Fatalf("PUT settings status=%d body=%s", res.Code, res.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		return payload
	}

	if got := get()[settingPlannerCompactOverview]; got != true {
		t.Fatalf("default planner_compact_overview=%v, want true", got)
	}
	if got := put(`{"planner_compact_overview":false}`)[settingPlannerCompactOverview]; got != false {
		t.Fatalf("disabled planner_compact_overview=%v, want false", got)
	}
	if m.PlannerCompactOverviewEnabled() || get()[settingPlannerCompactOverview] != false {
		t.Fatal("disabled value was not persisted")
	}
	if got := put(`{"planner_compact_overview":true}`)[settingPlannerCompactOverview]; got != true {
		t.Fatalf("enabled planner_compact_overview=%v, want true", got)
	}
	if !m.PlannerCompactOverviewEnabled() {
		t.Fatal("enabled value was not persisted")
	}
}

func TestPlannerOverviewPreview(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("preview fixture", "inspect the current graph", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/api/tasks/"+task.ID+"/planner-overview-preview", nil)
	req.SetPathValue("id", task.ID)
	res := httptest.NewRecorder()
	s.plannerOverviewPreview(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("preview status=%d body=%s", res.Code, res.Body.String())
	}
	var payload struct {
		TaskID       string  `json:"task_id"`
		Compact      string  `json:"compact"`
		Full         string  `json:"full"`
		CompactBytes int     `json:"compact_bytes"`
		FullBytes    int     `json:"full_bytes"`
		Reduction    float64 `json:"reduction_pct"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.TaskID != task.ID || !strings.Contains(payload.Compact, "【Task】") || !strings.Contains(payload.Compact, "inspect the current graph") {
		t.Fatalf("bad compact preview: %+v", payload)
	}
	if !strings.Contains(payload.Full, `"task"`) || !strings.Contains(payload.Full, "preview fixture") {
		t.Fatalf("bad full preview: %s", payload.Full)
	}
	if payload.CompactBytes != len(payload.Compact) || payload.FullBytes != len(payload.Full) || payload.FullBytes == 0 {
		t.Fatalf("bad byte counts: compact=%d full=%d", payload.CompactBytes, payload.FullBytes)
	}
	if payload.Reduction > 100 {
		t.Fatalf("invalid reduction: %f", payload.Reduction)
	}
}
