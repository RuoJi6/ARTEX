package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

func toolResultText(res actool.Result) string {
	var parts []string
	for _, b := range res.Content {
		if b.Text != "" {
			parts = append(parts, b.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func TestResumeTaskToolReopensDoneTaskWithOpenIntents(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	task, err := m.CreateTask("reopen done task", "finish open intents", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()

	goalID, err := task.Store.AddGoal(map[string]any{"text": "initial goal"}, "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := task.Store.SetNodeState(goalID, "met"); err != nil {
		t.Fatal(err)
	}
	intentID, err := task.Store.AddIntent(map[string]any{"summary": "test /admin endpoint"}, 8, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task.ID, "done"); err != nil {
		t.Fatal(err)
	}

	s := newAdmissionTestServer(m, nil)
	in, _ := json.Marshal(map[string]any{"task_id": task.ID})
	res, err := s.toolResumeTask().Call(context.Background(), in, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("resume_task failed: %s", toolResultText(res))
	}
	var out struct {
		TaskID string `json:"task_id"`
		Status string `json:"status"`
		Queued bool   `json:"queued"`
	}
	if err := json.Unmarshal([]byte(toolResultText(res)), &out); err != nil {
		t.Fatalf("unmarshal result %q: %v", toolResultText(res), err)
	}
	if out.TaskID != task.ID || out.Status != "running" || out.Queued {
		t.Fatalf("resume_task result = %+v, want task_id=%s status=running queued=false", out, task.ID)
	}
	if got := m.TaskStatus(task.ID); got != "running" {
		t.Fatalf("in-memory task status = %q, want running", got)
	}
	stored, err := m.pg.GetTask(mustTaskID(t, task.ID))
	if err != nil || stored == nil {
		t.Fatalf("GetTask: %v", err)
	}
	if stored.Status != "running" || stored.Paused || stored.CompletedAt != nil {
		t.Fatalf("stored task = %+v, want status=running paused=false completed_at=nil", stored)
	}
	// Existing open intent must still be present in place.
	node, err := task.Store.GetNode(intentID)
	if err != nil || node == nil || node.State != "open" {
		t.Fatalf("open intent after reopen = %+v err=%v, want state=open", node, err)
	}
}

func TestResumeTaskToolRefusesDoneTaskWithNoOpenWork(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	task, err := m.CreateTask("done no work", "all goals met", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()

	goalID, err := task.Store.AddGoal(map[string]any{"text": "finished goal"}, "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := task.Store.SetNodeState(goalID, "met"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task.ID, "done"); err != nil {
		t.Fatal(err)
	}

	s := newAdmissionTestServer(m, nil)
	in, _ := json.Marshal(map[string]any{"task_id": task.ID})
	res, err := s.toolResumeTask().Call(context.Background(), in, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Fatalf("expected error for done task with no open goals/intents, got: %s", toolResultText(res))
	}
	if got := m.TaskStatus(task.ID); got != "done" {
		t.Fatalf("status changed to %q on refused reopen, want done", got)
	}
}

func TestResumeTaskToolInMainAgentContextDefaultsAndScopesTaskID(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	task1, err := m.CreateTask("task1", "goal1", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task1.ID, DeleteTaskOptions{}) }()
	task2, err := m.CreateTask("task2", "goal2", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task2.ID, DeleteTaskOptions{}) }()

	if _, err := task1.Store.AddIntent(map[string]any{"summary": "open work 1"}, 5, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	if _, err := task2.Store.AddIntent(map[string]any{"summary": "open work 2"}, 5, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task1.ID, "done"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task2.ID, "done"); err != nil {
		t.Fatal(err)
	}

	s := newAdmissionTestServer(m, nil)
	ctx := agent.WithRunInfo(context.Background(), agent.RunInfo{TaskID: mustTaskID(t, task1.ID)})

	// Cross-task call from task1 context must be refused.
	crossIn, _ := json.Marshal(map[string]any{"task_id": task2.ID})
	crossRes, err := s.toolResumeTask().Call(ctx, crossIn, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !crossRes.IsError {
		t.Fatalf("expected cross-task resume refusal, got: %s", toolResultText(crossRes))
	}
	if m.TaskStatus(task2.ID) != "done" {
		t.Fatalf("task2 status = %q, want done", m.TaskStatus(task2.ID))
	}

	// Empty task_id in task1 context defaults to task1 and reopens it.
	selfRes, err := s.toolResumeTask().Call(ctx, json.RawMessage(`{}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if selfRes.IsError {
		t.Fatalf("in-task resume_task failed: %s", toolResultText(selfRes))
	}
	if m.TaskStatus(task1.ID) != "running" {
		t.Fatalf("task1 status = %q, want running", m.TaskStatus(task1.ID))
	}
}

func TestSetTaskGoalsAndAddTaskIntentReviveDoneAndPausedTasks(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	s := newAdmissionTestServer(m, nil)

	// 1. set_task_goals on a done task (no open goals/intents) writes an open goal and revives it.
	doneTask, err := m.CreateTask("done for set_task_goals", "old goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(doneTask.ID, DeleteTaskOptions{}) }()
	gID, err := doneTask.Store.AddGoal(map[string]any{"text": "old goal"}, "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := doneTask.Store.SetNodeState(gID, "met"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(doneTask.ID, "done"); err != nil {
		t.Fatal(err)
	}

	inGoals, _ := json.Marshal(map[string]any{
		"task_id": doneTask.ID,
		"text":    "verify SSRF on /api/fetch",
	})
	res, err := s.toolSetTaskGoals().Call(context.Background(), inGoals, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("set_task_goals failed: %s", toolResultText(res))
	}
	if got := m.TaskStatus(doneTask.ID); got != "running" {
		t.Fatalf("doneTask status after set_task_goals = %q, want running", got)
	}
	hasOpenGoal, err := doneTask.Store.HasOpenGoal()
	if err != nil || !hasOpenGoal {
		t.Fatalf("doneTask HasOpenGoal = %v err=%v, want true", hasOpenGoal, err)
	}

	// 2. set_task_goals on a paused task clears pause and revives it.
	if _, err := s.applyTaskControl(doneTask, "pause"); err != nil {
		t.Fatal(err)
	}
	if !doneTask.lifecycleSnapshot().Paused {
		t.Fatal("expected task to be paused")
	}
	inGoals2, _ := json.Marshal(map[string]any{
		"task_id": doneTask.ID,
		"goals":   []map[string]any{{"text": "check IDOR on /api/users/{id}", "vulnclass": "IDOR"}},
	})
	res, err = s.toolSetTaskGoals().Call(context.Background(), inGoals2, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("set_task_goals on paused task failed: %s", toolResultText(res))
	}
	if doneTask.lifecycleSnapshot().Paused || s.engine.IsPaused(doneTask.ID) {
		t.Fatalf("task still paused after set_task_goals: lifecycle=%+v enginePaused=%v", doneTask.lifecycleSnapshot(), s.engine.IsPaused(doneTask.ID))
	}

	// 3. add_task_intent on a done task creates an open intent and revives it.
	intentTask, err := m.CreateTask("done for add_task_intent", "old goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(intentTask.ID, DeleteTaskOptions{}) }()
	gID2, err := intentTask.Store.AddGoal(map[string]any{"text": "old goal"}, "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := intentTask.Store.SetNodeState(gID2, "met"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(intentTask.ID, "done"); err != nil {
		t.Fatal(err)
	}

	inIntent, _ := json.Marshal(map[string]any{
		"task_id":  intentTask.ID,
		"summary":  "probe /internal/metrics directly",
		"priority": 9,
	})
	res, err = s.toolAddTaskIntent().Call(context.Background(), inIntent, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("add_task_intent failed: %s", toolResultText(res))
	}
	if got := m.TaskStatus(intentTask.ID); got != "running" {
		t.Fatalf("intentTask status after add_task_intent = %q, want running", got)
	}
	hasActive, err := intentTask.Store.HasActiveIntent()
	if err != nil || !hasActive {
		t.Fatalf("intentTask HasActiveIntent = %v err=%v, want true", hasActive, err)
	}
}

func TestHTTPResumeTaskEndpoint(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	td := t.TempDir()
	s := New(ctx, m, td, td, td)
	planner, worker := new(agent.Planner), new(agent.Worker)
	s.engine.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) {
		return planner, worker
	})
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}

	postResume := func(id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/tasks/"+id+"/resume", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Missing task → 404.
	if rec := postResume("999999999"); rec.Code != http.StatusNotFound {
		t.Fatalf("missing task status = %d body=%s, want 404", rec.Code, rec.Body.String())
	}

	task, err := m.CreateTask("http resume", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	goalID, err := task.Store.AddGoal(map[string]any{"text": "g"}, "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := task.Store.SetNodeState(goalID, "met"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task.ID, "done"); err != nil {
		t.Fatal(err)
	}

	// Done task with no open goals/intents → 409.
	if rec := postResume(task.ID); rec.Code != http.StatusConflict {
		t.Fatalf("done task with no work status = %d body=%s, want 409", rec.Code, rec.Body.String())
	}

	// Add an open intent → POST /api/tasks/{id}/resume reopens to 200 running.
	if _, err := task.Store.AddIntent(map[string]any{"summary": "continue open work"}, 7, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	rec := postResume(task.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("reopen done task status = %d body=%s, want 200", rec.Code, rec.Body.String())
	}
	var body taskControlResult
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ID != task.ID || body.Status != "running" || body.Paused {
		t.Fatalf("resume body = %+v, want id=%s status=running paused=false", body, task.ID)
	}

	// Already running → 409.
	if rec := postResume(task.ID); rec.Code != http.StatusConflict {
		t.Fatalf("already running status = %d body=%s, want 409", rec.Code, rec.Body.String())
	}

	// Pause then resume → 200 running.
	if _, err := s.applyTaskControl(task, "pause"); err != nil {
		t.Fatal(err)
	}
	if rec := postResume(task.ID); rec.Code != http.StatusOK {
		t.Fatalf("resume paused task status = %d body=%s, want 200", rec.Code, rec.Body.String())
	}
}

func TestAutoAndMainAgentToolResolutionIncludesReopenTools(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer m.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	td := t.TempDir()
	s := New(ctx, m, td, td, td)
	t.Cleanup(func() { agent.ToolResolve = nil })

	// Verify auto gets resume_task, set_task_goals, add_task_intent via ToolResolve.
	hostTools, _ := s.hostTools()
	autoTools := names(agent.ToolResolve(context.Background(), "auto", append(actool.DefaultTools(), hostTools...)))
	for _, want := range []string{"resume_task", "set_task_goals", "add_task_intent", "pause_task", "add_task_hint"} {
		if _, ok := autoTools[want]; !ok {
			t.Errorf("auto missing bound tool %q", want)
		}
	}

	// Verify mainagent gets resume_task alongside set_goals and add_intent.
	ts := agent.NewToolSet(nil, "human")
	mainBase := append(ts.MainAgentTools(), hostTools...)
	mainTools := names(agent.ToolResolve(context.Background(), "mainagent", mainBase))
	for _, want := range []string{"resume_task", "set_goals", "add_intent", "add_hint"} {
		if _, ok := mainTools[want]; !ok {
			t.Errorf("mainagent missing bound tool %q", want)
		}
	}
	// Verify cross-task-only tools are NOT leaked into mainagent.
	for _, unwanted := range []string{"set_task_goals", "add_task_intent"} {
		if _, ok := mainTools[unwanted]; ok {
			t.Errorf("mainagent should not receive cross-task tool %q", unwanted)
		}
	}

	// Verify MCP resume_task can also reopen a done task with open intents.
	task, err := m.CreateTask("mcp reopen", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	if _, err := task.Store.AddIntent(map[string]any{"summary": "remaining intent"}, 6, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task.ID, "done"); err != nil {
		t.Fatal(err)
	}
	tok := &db.APIToken{ID: 1, Name: "test", Scopes: []string{db.APIScopeTaskControl}}
	mcpIn, _ := json.Marshal(map[string]any{"task_id": task.ID})
	mcpRes, err := s.mcpControlTask(tok, mcpIn, "resume")
	if err != nil {
		t.Fatal(err)
	}
	if mcpRes.IsError || !strings.Contains(toolResultText(mcpRes), `"running"`) {
		t.Fatalf("mcp resume_task on done task = %+v, want running", mcpRes)
	}
}
