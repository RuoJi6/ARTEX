package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestTaskMetadataPatchReturnsRenameAndPin(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()
	task, err := m.CreateTask("metadata patch", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _ = m.pg.DeleteTask(taskID) }()
	s := New(context.Background(), m, t.TempDir(), t.TempDir(), t.TempDir())
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]any{"name": "  renamed task  ", "pinned": true})
	req := httptest.NewRequest(http.MethodPatch, "/api/tasks/"+task.ID, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status=%d body=%s", rec.Code, rec.Body.String())
	}
	var updated struct {
		Name     string `json:"name"`
		Pinned   bool   `json:"pinned"`
		PinnedAt string `json:"pinned_at"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Name != "renamed task" || !updated.Pinned || updated.PinnedAt == "" {
		t.Fatalf("unexpected task patch response: %+v", updated)
	}

	body, _ = json.Marshal(map[string]any{"name": strings.Repeat("任", maxTaskNameRunes+1)})
	req = httptest.NewRequest(http.MethodPatch, "/api/tasks/"+task.ID, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("overlong task name status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestTaskMetadataPatchGlobalAssetSharing(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("sharing patch", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := strconv.ParseInt(task.ID, 10, 64)
	defer m.pg.DeleteTask(id)
	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer func() { cancel(); s.Close() }()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	for _, enabled := range []bool{true, false} {
		body, _ := json.Marshal(map[string]any{"share_global_assets": enabled})
		req := httptest.NewRequest(http.MethodPatch, "/api/tasks/"+task.ID, bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("patch %d: %s", rec.Code, rec.Body.String())
		}
		var result struct {
			Shared *bool `json:"share_global_assets"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		saved, err := m.pg.GetTask(id)
		if err != nil || saved.ShareGlobalAssets != enabled || result.Shared == nil || *result.Shared != enabled || task.lifecycleSnapshot().ShareGlobalAssets != enabled {
			t.Fatalf("sharing not propagated: %s %+v %v", rec.Body.String(), saved, err)
		}
	}
	req := httptest.NewRequest(http.MethodPatch, "/api/tasks/"+task.ID, strings.NewReader(`{"share_global_assets":"true"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("invalid boolean status=%d", rec.Code)
	}
}

func TestConversationBatchDeleteReportsMissing(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()
	s := New(context.Background(), m, t.TempDir(), t.TempDir(), t.TempDir())
	first, err := m.pg.CreateConversation("mainagent", "batch-http-first", nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := m.pg.CreateConversation("mainagent", "batch-http-second", nil)
	if err != nil {
		_ = m.pg.DeleteConversation(first.ID)
		t.Fatal(err)
	}
	defer func() {
		_ = m.pg.DeleteConversation(first.ID)
		_ = m.pg.DeleteConversation(second.ID)
	}()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	missing := int64(1<<62 - 1)
	body, _ := json.Marshal(map[string]any{"ids": []int64{first.ID, missing, second.ID}})
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/delete/batch", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("batch delete status=%d body=%s", rec.Code, rec.Body.String())
	}
	var response struct {
		Items []conversationDeleteItem `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Items) != 3 || !response.Items[0].OK || response.Items[1].OK || !response.Items[2].OK {
		t.Fatalf("batch delete response=%+v", response.Items)
	}
	for _, id := range []int64{first.ID, second.ID} {
		if conversation, err := m.pg.GetConversation(id); err != nil || conversation != nil {
			t.Fatalf("conversation %d still exists: %+v err=%v", id, conversation, err)
		}
	}
	if response.Items[1].Error == "" {
		t.Fatalf("missing conversation %s must include an error", fmt.Sprint(missing))
	}
}

func TestTaskMetadataPatchWorkerCount(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer m.Close()
	task, err := m.CreateTask("worker count patch", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _ = m.pg.DeleteTask(taskID) }()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := &Server{m: m, engine: NewEngine(m), ctx: ctx}
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/tasks/{id}", s.updateTaskMetadata)
	mux.HandleFunc("GET /api/tasks/{id}", s.getTask)
	mux.HandleFunc("GET /api/tasks", s.listTasks)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	assertCounts := func(body []byte, want int) {
		t.Helper()
		var dto struct {
			WorkerCount       int  `json:"worker_count"`
			WorkerActualCount *int `json:"worker_actual_count"`
			WorkerTargetCount *int `json:"worker_target_count"`
		}
		if err := json.Unmarshal(body, &dto); err != nil {
			t.Fatal(err)
		}
		actual, target := s.engine.WorkerCounts(task)
		if dto.WorkerCount != want || dto.WorkerActualCount == nil || dto.WorkerTargetCount == nil {
			t.Fatalf("missing or incorrect worker counts: %s", body)
		}
		if *dto.WorkerActualCount != actual || *dto.WorkerTargetCount != target {
			t.Fatalf("worker counts=%d/%d, engine=%d/%d", *dto.WorkerActualCount, *dto.WorkerTargetCount, actual, target)
		}
		if actual != 0 || (want > 0 && target != want) {
			t.Fatalf("inactive task worker counts=%d/%d, want actual=0 and configured target=%d", actual, target, want)
		}
	}
	for _, count := range []int{1, 50, 0} {
		rec := request(http.MethodPatch, "/api/tasks/"+task.ID, fmt.Sprintf(`{"worker_count":%d}`, count))
		if rec.Code != http.StatusOK {
			t.Fatalf("patch worker_count=%d status=%d body=%s", count, rec.Code, rec.Body.String())
		}
		assertCounts(rec.Body.Bytes(), count)
		if got := task.lifecycleSnapshot().WorkerCount; got != count {
			t.Fatalf("in-memory worker count=%d, want %d", got, count)
		}
		persisted, err := m.pg.GetTask(taskID)
		if err != nil || persisted == nil || persisted.WorkerCount != count {
			t.Fatalf("persisted task=%+v err=%v, want worker_count=%d", persisted, err, count)
		}
		rec = request(http.MethodGet, "/api/tasks/"+task.ID, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("get task status=%d body=%s", rec.Code, rec.Body.String())
		}
		assertCounts(rec.Body.Bytes(), count)
	}
	for _, body := range []string{
		`{"worker_count":-1,"name":"must not commit"}`,
		`{"worker_count":51,"name":"must not commit"}`,
		`{"worker_count":1.5}`,
		`{"worker_count":"2"}`,
		`{"worker_count":null}`,
	} {
		rec := request(http.MethodPatch, "/api/tasks/"+task.ID, body)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("invalid patch %s status=%d body=%s", body, rec.Code, rec.Body.String())
		}
	}
	state := task.lifecycleSnapshot()
	persisted, err := m.pg.GetTask(taskID)
	if err != nil || persisted == nil || persisted.WorkerCount != 0 || persisted.Name != state.Name || state.Name == "must not commit" || state.WorkerCount != 0 {
		t.Fatalf("invalid patch changed state: memory=%+v persisted=%+v err=%v", state, persisted, err)
	}
	rec := request(http.MethodGet, "/api/tasks", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list tasks status=%d body=%s", rec.Code, rec.Body.String())
	}
	var list struct {
		Tasks []json.RawMessage `json:"tasks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	for _, raw := range list.Tasks {
		var dto struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &dto); err != nil {
			t.Fatal(err)
		}
		if dto.ID == task.ID {
			assertCounts(raw, 0)
			return
		}
	}
	t.Fatal("updated task missing from list")
}
