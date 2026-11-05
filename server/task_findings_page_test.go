package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestTaskFindingsPageIncludesAllNodesAndProtectsSources(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()
	source, err := m.CreateTask("finding source", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(source.ID, DeleteTaskOptions{})
	current, err := m.CreateTaskWithOptions("finding current", "goal", db.TaskCreateOptions{
		SourceTaskIDs: []int64{mustTaskID(t, source.ID)},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(current.ID, DeleteTaskOptions{})
	unrelated, err := m.CreateTask("unrelated", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(unrelated.ID, DeleteTaskOptions{})

	oldest, err := source.Store.AddNode(db.KindFinding, map[string]any{"summary": "oldest", "severity": "high"}, 0, "confirmed", "test", nil)
	if err != nil {
		t.Fatal(err)
	}
	findingID, err := m.pg.AddFinding(mustTaskID(t, source.ID), oldest, "test", "oldest", "high", "oldest", "", "test", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.pg.DeleteFinding(findingID)
	for _, task := range []*Task{source, current} {
		_, err := m.pg.Exec(`INSERT INTO exploration_nodes (exploration_id, kind, state, payload)
			SELECT $1, 'finding', 'confirmed', jsonb_build_object('summary', 'entry-' || n::text, 'severity', 'low')
			FROM generate_series(1, 205) AS n`, task.ExpID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := unrelated.Store.AddNode(db.KindFinding, map[string]any{"summary": "unrelated-only"}, 0, "confirmed", "test", nil); err != nil {
		t.Fatal(err)
	}

	s := &Server{m: m}
	fetch := func(query string) (int, []byte) {
		t.Helper()
		recorder := httptest.NewRecorder()
		s.findings(recorder, httptest.NewRequest(http.MethodGet, "/api/exploration/findings?task="+current.ID+query, nil))
		return recorder.Code, recorder.Body.Bytes()
	}
	type findingPage struct {
		Items []FindingDTO `json:"items"`
		Total int          `json:"total"`
	}
	status, body := fetch("&page=3&limit=200")
	var page findingPage
	if status != http.StatusOK || json.Unmarshal(body, &page) != nil || page.Total != 411 || len(page.Items) != 11 {
		t.Fatalf("combined page: status=%d body=%s", status, body)
	}
	for _, finding := range page.Items {
		if finding.Inherited && (finding.TaskID != source.ID || finding.SourceTaskID != source.ID) {
			t.Fatalf("unexpected inherited provenance: %+v", finding)
		}
		if !finding.Inherited && finding.TaskID != current.ID {
			t.Fatalf("unexpected own provenance: %+v", finding)
		}
	}

	status, body = fetch("&page=1&limit=1&order=asc")
	var inherited findingPage
	if status != http.StatusOK || json.Unmarshal(body, &inherited) != nil || inherited.Total != 411 || len(inherited.Items) != 1 {
		t.Fatalf("source page: status=%d body=%s", status, body)
	}
	if f := inherited.Items[0]; f.ID != fmt.Sprint(oldest) || f.FindingID != fmt.Sprint(findingID) ||
		!f.Inherited || f.SourceTaskID != source.ID || f.TaskID != source.ID {
		t.Fatalf("source provenance or metadata missing: %+v", f)
	}
	for _, query := range []string{"&severity=high", "&q=oldest", "&sort=severity"} {
		status, body = fetch("&page=1&limit=1" + query)
		var filtered findingPage
		if status != http.StatusOK || json.Unmarshal(body, &filtered) != nil || len(filtered.Items) != 1 || filtered.Items[0].ID != fmt.Sprint(oldest) {
			t.Fatalf("filtered page %s: status=%d body=%s", query, status, body)
		}
		if query != "&sort=severity" && filtered.Total != 1 {
			t.Fatalf("filtered total %s: %+v", query, filtered)
		}
	}
	for _, query := range []string{"unrelated-only", "%25"} {
		status, body = fetch("&page=1&limit=20&q=" + query)
		var filtered findingPage
		if status != http.StatusOK || json.Unmarshal(body, &filtered) != nil || filtered.Total != 0 {
			t.Fatalf("unexpected match %s: status=%d body=%s", query, status, body)
		}
	}
	status, body = fetch("&page=1&limit=20&severity=unknown")
	if status != http.StatusBadRequest {
		t.Fatalf("invalid severity: status=%d body=%s", status, body)
	}
	status, body = fetch("&page=9223372036854775807&limit=200")
	if status != http.StatusBadRequest {
		t.Fatalf("overflow page: status=%d body=%s", status, body)
	}
	status, body = fetch("")
	var legacy []FindingDTO
	if status != http.StatusOK || json.Unmarshal(body, &legacy) != nil || len(legacy) != 400 {
		t.Fatalf("legacy response changed: status=%d count=%d", status, len(legacy))
	}
}
