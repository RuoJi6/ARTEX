package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Autumn-27/mysterysecurityteam/db"
	"github.com/Autumn-27/mysterysecurityteam/intercept"
)

func TestInterceptSearchFilterParams(t *testing.T) {
	filter, err := interceptFilterParams(url.Values{"q": []string{"  https://example.test/a?x=1  "}})
	if err != nil || filter.Search != "https://example.test/a?x=1" {
		t.Fatalf("search=%q err=%v", filter.Search, err)
	}
	if _, err := interceptFilterParams(url.Values{"q": []string{"#0"}}); err == nil {
		t.Fatal("zero approval id accepted")
	}
	if _, err := interceptFilterParams(url.Values{"q": []string{"#abc"}}); err == nil {
		t.Fatal("non-numeric approval id accepted")
	}
	if _, err := interceptFilterParams(url.Values{"q": []string{strings.Repeat("x", 201)}}); err == nil {
		t.Fatal("overlong search accepted")
	}
	filter, err = interceptFilterParams(url.Values{"from": []string{"2026-10-01"}, "to": []string{"2026-10-12"}})
	if err != nil || filter.CreatedFrom != "2026-10-01" || filter.CreatedTo != "2026-10-12" {
		t.Fatalf("date filter=%+v err=%v", filter, err)
	}
	if filter, err := interceptFilterParams(url.Values{"decision_source": []string{"manual"}}); err != nil || filter.DecisionSource != "manual" {
		t.Fatalf("manual decision source rejected: %+v %v", filter, err)
	}
	for _, values := range []url.Values{
		{"from": []string{"2026-10-1"}},
		{"to": []string{"not-a-date"}},
		{"from": []string{"2026-10-13"}, "to": []string{"2026-10-12"}},
	} {
		if _, err := interceptFilterParams(values); err == nil {
			t.Fatalf("invalid date filter accepted: %v", values)
		}
	}
}

func TestInterceptFilterHTTP(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("no test database configured")
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	m := &Manager{pg: d, interceptor: intercept.New(d)}
	s := &Server{m: m, jwtKey: []byte("approval-filter-test-key")}
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	scope := "approval-http-filter"
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id IN ($1,$2)`, scope, scope+"-other") })
	_, baseline, err := d.ListAllInterceptsPage(1, 20, db.InterceptApprovalFilter{Status: "denied", DecisionSource: "model"})
	if err != nil {
		t.Fatal(err)
	}
	for _, state := range []string{"pending", "allowed", "denied", "timeout"} {
		if _, err := d.CreateDecidedIntercept(0, 0, scope, "test", "Bash", []byte(`{}`), state, "[模型] fixture"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.CreateDecidedIntercept(0, 0, scope+"-other", "test", "Bash", []byte(`{}`), "denied", "[模型] fixture"); err != nil {
		t.Fatal(err)
	}
	do := func(path string, auth bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if auth {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	for _, base := range []string{"/api/intercept/history", "/api/intercept/task/" + scope} {
		if rec := do(base+"?status=denied&decision_source=model", false); rec.Code != 401 {
			t.Fatalf("unprotected list: %d", rec.Code)
		}
		for _, query := range []string{
			"?status=invalid",
			"?decision_source=invalid",
			"?page=1&status=denied%27+OR+1%3D1--",
			"?size=20&decision_source=MODEL",
			"?q=%23abc",
			"?from=2026-10-13&to=2026-10-12",
		} {
			if rec := do(base+query, true); rec.Code != 400 {
				t.Fatalf("invalid filter %s: %d %s", query, rec.Code, rec.Body.String())
			}
		}
		// Filtering without explicit page parameters must still apply the filters.
		rec := do(base+"?status=denied&decision_source=model", true)
		var body struct {
			Items []db.InterceptApprovalRow `json:"items"`
			Total int                       `json:"total"`
			Page  int                       `json:"page"`
		}
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &body) != nil {
			t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
		}
		want := baseline + 2
		if base != "/api/intercept/history" {
			want = 1
		}
		if body.Total != want || body.Page != 1 {
			t.Fatalf("filter total=%d want=%d page=%d", body.Total, want, body.Page)
		}
		for _, r := range body.Items {
			if r.Status != "denied" || r.DecisionSource != "model" {
				t.Fatalf("nonmatching item: %+v", r)
			}
		}
	}
	for _, tc := range []struct {
		query             string
		total, rows, page int
	}{
		{"", 4, 4, 0},
		{"?page=2&size=2&decision_source=model", 4, 2, 2},
		{"?page=2&size=1&status=denied&decision_source=model", 1, 0, 2},
		{"?status=denied&decision_source=unknown", 0, 0, 1},
		{"?page=0&size=0&status=pending", 1, 1, 1},
	} {
		rec := do("/api/intercept/task/"+scope+tc.query, true)
		var body struct {
			Items []db.InterceptApprovalRow `json:"items"`
			Total int                       `json:"total"`
			Page  int                       `json:"page"`
		}
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &body) != nil || body.Total != tc.total || len(body.Items) != tc.rows || body.Page != tc.page {
			t.Fatalf("%s: %d %s", tc.query, rec.Code, rec.Body.String())
		}
	}
}
