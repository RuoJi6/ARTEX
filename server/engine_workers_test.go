package server

import (
	"context"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

type resizingCall struct {
	ctx     context.Context
	release chan struct{}
}

type resizingProvider struct{ calls chan resizingCall }

func (p *resizingProvider) Complete(ctx context.Context, _ llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	call := resizingCall{ctx: ctx, release: make(chan struct{})}
	select {
	case p.calls <- call:
	case <-ctx.Done():
		return llm.Message{}, "", llm.Usage{}, ctx.Err()
	}
	select {
	case <-call.release:
		return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("fixture completed")}}, "end_turn", llm.Usage{}, nil
	case <-ctx.Done():
		return llm.Message{}, "", llm.Usage{}, ctx.Err()
	}
}

func (*resizingProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	panic("resizing fixture uses non-streaming calls")
}

func waitWorkerCondition(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for worker state")
}

// Exercises the real worker claim/Execute/settlement path. Both slots remain
// blocked in provider calls while shrinking; only the retained slot may claim
// another intent, and re-expansion must reuse a name without overlapping loops.
func TestWorkerHotResizeDrainsBeforeReusingSlot(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("resize workers", "fixture", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})
	count := 2
	if _, err := m.UpdateTaskMetadata(task.ID, db.TaskPatch{WorkerCount: &count}); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := task.Store.AddIntent(map[string]any{"text": "fixture"}, 0, nil, "test"); err != nil {
			t.Fatal(err)
		}
	}
	e := NewEngine(m)
	defer e.StopTask(task.ID)
	var mu sync.Mutex
	providers := make(map[string]*resizingProvider)
	e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) { return nil, nil })
	// Use a pinned pool so each slot's blocked call can be released independently.
	profileID, err := m.pg.SaveProfile(&db.LLMProfile{Name: "resize-fixture", Format: "openai", Model: "fixture"})
	if err != nil {
		t.Fatal(err)
	}
	defer m.pg.DeleteProfile(profileID)
	oldPools, _, _ := m.pg.GetSetting(settingWorkerPools)
	oldWorkers, _, _ := m.pg.GetSetting(settingWorkers)
	defer m.pg.SetSetting(settingWorkerPools, oldPools)
	defer m.pg.SetSetting(settingWorkers, oldWorkers)
	count = 0
	if _, err := m.UpdateTaskMetadata(task.ID, db.TaskPatch{WorkerCount: &count}); err != nil {
		t.Fatal(err)
	}
	workDir := t.TempDir()
	e.SetWorkerResolver(func(_ *Task, slot WorkerSlot) (*agent.Worker, error) {
		mu.Lock()
		defer mu.Unlock()
		p := providers[slot.Name]
		if p == nil {
			p = &resizingProvider{calls: make(chan resizingCall, 4)}
			providers[slot.Name] = p
		}
		w := agent.NewWorker(p, "fixture", workDir, nil, 0, 0)
		w.SetNonStreaming(func() bool { return true })
		return w, nil
	})
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: profileID, Workers: 2}}); err != nil {
		t.Fatal(err)
	}
	e.Run(t.Context(), task)
	getCall := func(name string) resizingCall {
		t.Helper()
		var p *resizingProvider
		waitWorkerCondition(t, func() bool {
			mu.Lock()
			defer mu.Unlock()
			p = providers[name]
			return p != nil
		})
		select {
		case call := <-p.calls:
			return call
		case <-time.After(5 * time.Second):
			t.Fatalf("%s did not execute an intent", name)
			return resizingCall{}
		}
	}
	first, second := getCall("work#1"), getCall("work#2")
	thirdID, err := task.Store.AddIntent(map[string]any{"text": "next"}, 0, nil, "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: profileID, Workers: 1}}); err != nil {
		t.Fatal(err)
	}
	if actual, target := e.WorkerCounts(task); actual != 2 || target != 1 {
		t.Fatalf("draining counts=%d/%d, want 2/1", actual, target)
	}
	if second.ctx.Err() != nil || first.ctx.Err() != nil {
		t.Fatal("resize cancelled an executing intent")
	}
	close(second.release)
	waitWorkerCondition(t, func() bool { actual, target := e.WorkerCounts(task); return actual == 1 && target == 1 })
	third, err := task.Store.GetNode(thirdID)
	if err != nil || third.State != "open" {
		t.Fatalf("retired slot claimed queued intent: node=%+v err=%v", third, err)
	}
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: profileID, Workers: 2}}); err != nil {
		t.Fatal(err)
	}
	thirdCall := getCall("work#2")
	third, err = task.Store.GetNode(thirdID)
	if err != nil || third.State != "running" || third.Owner != "work#2" {
		t.Fatalf("expanded slot did not claim queued intent: node=%+v err=%v", third, err)
	}
	// A rapid shrink/grow must not start a duplicate work#2 while it drains.
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: profileID, Workers: 1}}); err != nil {
		t.Fatal(err)
	}
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: profileID, Workers: 2}}); err != nil {
		t.Fatal(err)
	}
	if actual, target := e.WorkerCounts(task); actual != 2 || target != 2 || thirdCall.ctx.Err() != nil {
		t.Fatalf("rapid resize interrupted work or duplicated slot: %d/%d err=%v", actual, target, thirdCall.ctx.Err())
	}
	close(thirdCall.release)
	close(first.release)
	waitWorkerCondition(t, func() bool {
		node, _ := task.Store.GetNode(thirdID)
		return node != nil && node.State != "running" && e.inflightCount(task.ID) == 0
	})
}

func TestWorkerHotResizeTaskOverrideAndGlobalDefault(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	oldPools, _, _ := m.pg.GetSetting(settingWorkerPools)
	oldWorkers, _, _ := m.pg.GetSetting(settingWorkers)
	defer m.pg.SetSetting(settingWorkerPools, oldPools)
	defer m.pg.SetSetting(settingWorkers, oldWorkers)
	if err := m.SetWorkerPools(nil, 2); err != nil {
		t.Fatal(err)
	}
	e := NewEngine(m)
	global, err := m.CreateTask("global resize fixture", "fixture", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(global.ID, DeleteTaskOptions{})
	defer e.StopTask(global.ID)
	override, err := m.CreateTask("explicit resize fixture", "fixture", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(override.ID, DeleteTaskOptions{})
	defer e.StopTask(override.ID)
	count := 3
	if _, err := m.UpdateTaskMetadata(override.ID, db.TaskPatch{WorkerCount: &count}); err != nil {
		t.Fatal(err)
	}
	e.Run(t.Context(), global)
	e.Run(t.Context(), override)
	if err := m.SetWorkers(4); err != nil {
		t.Fatal(err)
	}
	if actual, target := e.WorkerCounts(global); actual != 4 || target != 4 {
		t.Fatalf("global default did not expand: %d/%d", actual, target)
	}
	if actual, target := e.WorkerCounts(override); actual != 3 || target != 3 {
		t.Fatalf("global setting changed explicit override: %d/%d", actual, target)
	}
	if err := m.SetWorkers(1); err != nil {
		t.Fatal(err)
	}
	waitWorkerCondition(t, func() bool { actual, target := e.WorkerCounts(global); return actual == 1 && target == 1 })
	if actual, target := e.WorkerCounts(override); actual != 3 || target != 3 {
		t.Fatalf("global shrink changed explicit override: %d/%d", actual, target)
	}
	// Exercise the live PATCH path, then restore global inheritance through PATCH.
	s := &Server{m: m, engine: e, ctx: t.Context()}
	patch := func(count int) {
		t.Helper()
		req := httptest.NewRequest(http.MethodPatch, "/api/tasks/"+override.ID, strings.NewReader(fmt.Sprintf(`{"worker_count":%d}`, count)))
		req.SetPathValue("id", override.ID)
		rec := httptest.NewRecorder()
		s.updateTaskMetadata(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("live patch=%d: %s", rec.Code, rec.Body.String())
		}
	}
	patch(5)
	if actual, target := e.WorkerCounts(override); actual != 5 || target != 5 {
		t.Fatalf("task PATCH did not expand: %d/%d", actual, target)
	}
	patch(0)
	waitWorkerCondition(t, func() bool { actual, target := e.WorkerCounts(override); return actual == 1 && target == 1 })
	persisted, err := m.pg.GetTask(taskIDInt(t, override.ID))
	if err != nil || persisted.WorkerCount != 0 {
		t.Fatalf("inheritance not persisted: task=%+v err=%v", persisted, err)
	}
	// Reconstructing a task after restart must use the persisted override policy.
	restored := taskFromPG(persisted, override.Store, m.interceptor)
	if slots, err := workerSlotsForTask(restored, m.WorkerPools(), m.Workers()); err != nil || len(slots) != 1 {
		t.Fatalf("restored task lost concurrency policy: slots=%v err=%v", slots, err)
	}
}
