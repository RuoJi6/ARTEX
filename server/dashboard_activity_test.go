package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestDashboardActivityUsesLatestPage(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()
	task, err := m.CreateTask("dashboard activity", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})

	ids := make([]int64, 0, 36)
	for i := 0; i < 35; i++ {
		id, err := task.Store.AppendActivity(db.Activity{Worker: "worker", Kind: "text", Summary: fmt.Sprint(i)})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}

	s := &Server{m: m}
	fetch := func(query string) (int, struct {
		Items []struct {
			Seq int64 `json:"seq"`
		} `json:"items"`
		Cursor int64 `json:"cursor"`
	}) {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, "/api/exploration/activity?task="+task.ID+query, nil)
		recorder := httptest.NewRecorder()
		s.activity(recorder, request)
		var response struct {
			Items []struct {
				Seq int64 `json:"seq"`
			} `json:"items"`
			Cursor int64 `json:"cursor"`
		}
		if recorder.Code == http.StatusOK {
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
		}
		return recorder.Code, response
	}

	status, recent := fetch("&limit=30&latest=1")
	if status != http.StatusOK || len(recent.Items) != 30 || recent.Items[0].Seq != ids[5] ||
		recent.Items[29].Seq != ids[34] || recent.Cursor != ids[34] {
		t.Fatalf("latest page: status=%d response=%+v", status, recent)
	}
	status, incremental := fetch("&limit=30")
	if status != http.StatusOK || len(incremental.Items) != 30 || incremental.Items[0].Seq != ids[0] ||
		incremental.Items[29].Seq != ids[29] || incremental.Cursor != ids[29] {
		t.Fatalf("incremental page changed: status=%d response=%+v", status, incremental)
	}
	newID, err := task.Store.AppendActivity(db.Activity{Worker: "worker", Kind: "result", Summary: "new"})
	if err != nil {
		t.Fatal(err)
	}
	status, recent = fetch("&limit=30&latest=1")
	if status != http.StatusOK || len(recent.Items) != 30 || recent.Items[29].Seq != newID {
		t.Fatalf("latest page did not advance: status=%d response=%+v", status, recent)
	}
	if status, _ := fetch("&latest=1&since=1"); status != http.StatusBadRequest {
		t.Fatalf("latest with since: got status=%d, want 400", status)
	}
	if status, _ := fetch("&latest=1&intent=1"); status != http.StatusBadRequest {
		t.Fatalf("latest with intent: got status=%d, want 400", status)
	}
}

func TestSummaryAndReportBeyondListLimits(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()
	task, err := m.CreateTask("large summary", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})

	for _, seed := range []struct {
		kind, state string
		count       int
	}{
		{db.KindFinding, "confirmed", 1001},
		{db.KindIntent, "open", 1001},
		{db.KindIntent, "running", 100001},
		{db.KindGoal, "met", 10001},
	} {
		_, err := m.pg.Exec(`INSERT INTO exploration_nodes (exploration_id, kind, state, payload)
			SELECT $1, $2, $3, jsonb_build_object('summary', 'case-' || n::text, 'severity', 'high')
			FROM generate_series(1, $4::int) AS n`, task.ExpID, seed.kind, seed.state, seed.count)
		if err != nil {
			t.Fatal(err)
		}
	}
	s := &Server{m: m, engine: NewEngine(m)}
	if got := s.fallbackChat(task, "summary"); !strings.Contains(got, "待领意图 1001，确认发现 1001") {
		t.Fatalf("fallback summary truncated: %s", got)
	}

	report := httptest.NewRecorder()
	s.getReport(report, httptest.NewRequest(http.MethodGet, "/api/report?task="+task.ID, nil))
	if report.Code != http.StatusOK || !strings.Contains(report.Body.String(), "确认发现：**1001**") ||
		!strings.Contains(report.Body.String(), "case-1\n") || !strings.Contains(report.Body.String(), "case-1001\n") {
		t.Fatalf("report truncated: status=%d", report.Code)
	}

	recorder := httptest.NewRecorder()
	s.stats(recorder, httptest.NewRequest(http.MethodGet, "/api/stats?task="+task.ID, nil))
	var response struct {
		ActiveTask struct {
			InFlight   int `json:"in_flight"`
			GoalsTotal int `json:"goals_total"`
			GoalsMet   int `json:"goals_met"`
		} `json:"active_task"`
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("stats status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.ActiveTask.InFlight != 100001 || response.ActiveTask.GoalsTotal != 10001 || response.ActiveTask.GoalsMet != 10001 {
		t.Fatalf("stats truncated: %+v", response.ActiveTask)
	}
	goalRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/"+task.ID+"/goals?page=501&limit=20", nil)
	goalRequest.SetPathValue("id", task.ID)
	goalRecorder := httptest.NewRecorder()
	s.listGoals(goalRecorder, goalRequest)
	var goalPage struct {
		Goals []GoalDTO `json:"goals"`
		Total int       `json:"total"`
	}
	if goalRecorder.Code != http.StatusOK || json.Unmarshal(goalRecorder.Body.Bytes(), &goalPage) != nil ||
		goalPage.Total != 10001 || len(goalPage.Goals) != 1 {
		t.Fatalf("goals page: status=%d total=%d count=%d", goalRecorder.Code, goalPage.Total, len(goalPage.Goals))
	}
	legacyRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/"+task.ID+"/goals", nil)
	legacyRequest.SetPathValue("id", task.ID)
	legacyRecorder := httptest.NewRecorder()
	s.listGoals(legacyRecorder, legacyRequest)
	goalPage = struct {
		Goals []GoalDTO `json:"goals"`
		Total int       `json:"total"`
	}{}
	if legacyRecorder.Code != http.StatusOK || json.Unmarshal(legacyRecorder.Body.Bytes(), &goalPage) != nil ||
		len(goalPage.Goals) != 10000 {
		t.Fatalf("legacy goals: status=%d count=%d", legacyRecorder.Code, len(goalPage.Goals))
	}
}

func TestFindingStatsBeyondLegacyListLimit(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()
	task, err := m.CreateTask("large finding summary", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{DeleteFindings: true})
	s := &Server{m: m}
	readStats := func() db.FindingStats {
		t.Helper()
		recorder := httptest.NewRecorder()
		s.findingStats(recorder, httptest.NewRequest(http.MethodGet, "/api/exploration/findings/stats", nil))
		var stats db.FindingStats
		if recorder.Code != http.StatusOK || json.Unmarshal(recorder.Body.Bytes(), &stats) != nil {
			t.Fatalf("finding stats: status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		return stats
	}
	baseline := readStats()
	_, err = m.pg.Exec(`INSERT INTO findings (task_id, vulnclass, severity, summary)
		SELECT $1, 'dashboard-test',
		CASE n % 4 WHEN 0 THEN 'critical' WHEN 1 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END,
		'finding-' || n::text FROM generate_series(1, 520) AS n`, mustTaskID(t, task.ID))
	if err != nil {
		t.Fatal(err)
	}
	stats := readStats()
	if stats.Total-baseline.Total != 520 || stats.Critical-baseline.Critical != 130 ||
		stats.High-baseline.High != 130 || stats.Medium-baseline.Medium != 130 || stats.Low-baseline.Low != 130 {
		t.Fatalf("finding stats truncated: before=%+v after=%+v", baseline, stats)
	}
	recorder := httptest.NewRecorder()
	s.findings(recorder, httptest.NewRequest(http.MethodGet, "/api/exploration/findings?page=1&limit=8", nil))
	var page struct {
		Items []FindingDTO `json:"items"`
		Total int          `json:"total"`
	}
	if recorder.Code != http.StatusOK || json.Unmarshal(recorder.Body.Bytes(), &page) != nil ||
		len(page.Items) != 8 || page.Total < 520 {
		t.Fatalf("recent findings page: status=%d total=%d items=%d", recorder.Code, page.Total, len(page.Items))
	}
}

func TestMissingSkillAPIReportsWholeLedger(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()
	s := &Server{m: m}
	type result struct {
		Missing    []db.SkillStat `json:"missing"`
		Total      int            `json:"total"`
		TotalCalls int            `json:"total_calls"`
	}
	fetch := func(query string) result {
		t.Helper()
		recorder := httptest.NewRecorder()
		s.fsMissingSkills(recorder, httptest.NewRequest(http.MethodGet, "/api/skills/missing"+query, nil))
		var body result
		if recorder.Code != http.StatusOK || json.Unmarshal(recorder.Body.Bytes(), &body) != nil {
			t.Fatalf("missing skills: status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		return body
	}
	baseline := fetch("?page=1&limit=20")
	prefix := fmt.Sprintf("api-missing-%d-", time.Now().UnixNano())
	names := make([]string, 25)
	for i := range names {
		names[i] = fmt.Sprintf("%s%02d", prefix, i)
	}
	defer m.pg.Exec(`DELETE FROM skill_usage WHERE skill = ANY($1::text[])`, names)
	if _, err := m.pg.Exec(`INSERT INTO skill_usage (skill, agent_key, found)
		SELECT skill, 'test', false FROM unnest($1::text[]) AS skill`, names); err != nil {
		t.Fatal(err)
	}
	first := fetch("?page=1&limit=20")
	second := fetch("?page=2&limit=20")
	if first.Total-baseline.Total != 25 || first.TotalCalls-baseline.TotalCalls != 25 ||
		len(first.Missing) != 20 || len(second.Missing) == 0 || second.Total != first.Total || second.TotalCalls != first.TotalCalls {
		t.Fatalf("missing skills truncated: before=%+v first=%+v second=%+v", baseline, first, second)
	}
}
