package server

import (
	"context"
	"errors"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

func TestNoResultRemaining(t *testing.T) {
	for _, tc := range []struct {
		name  string
		state taskLifecycleState
		want  time.Duration
	}{
		{"running", taskLifecycleState{Status: "running", ActiveRunSeconds: 20, RunSegmentStartedAt: 100}, 10 * time.Second},
		{"paused", taskLifecycleState{Status: "running", ActiveRunSeconds: 20, RunSegmentStartedAt: 100, Paused: true}, 40 * time.Second},
		{"queued", taskLifecycleState{Status: "running", ActiveRunSeconds: 20, RunSegmentStartedAt: 100, Queued: true}, 40 * time.Second},
		{"schedule closed", taskLifecycleState{Status: "paused", ActiveRunSeconds: 20, RunSegmentStartedAt: 100, PauseReason: "paused_by_schedule"}, 40 * time.Second},
		{"revived", taskLifecycleState{Status: "running", ActiveRunSeconds: 200, NoResultBaseSeconds: 200, RunSegmentStartedAt: 100}, 30 * time.Second},
		{"due", taskLifecycleState{Status: "running", ActiveRunSeconds: 60}, 0},
		{"overdue", taskLifecycleState{Status: "running", ActiveRunSeconds: 1000}, 0},
		{"no segment", taskLifecycleState{Status: "running"}, time.Minute},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := noResultRemaining(60, tc.state, 130); got != tc.want {
				t.Fatalf("remaining=%s, want %s", got, tc.want)
			}
		})
	}
}

func TestNoResultCoordinatorTerminalExitAllowsRevival(t *testing.T) {
	for _, status := range []string{"done", "failed", "timeout"} {
		t.Run(status, func(t *testing.T) {
			task := &Task{ID: "1", Status: status, NoResultSeconds: 60}
			m := &Manager{tasks: map[string]*Task{task.ID: task}}
			e := NewEngine(m)
			ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
			defer cancel()
			e.startDeadlineCoordinator(ctx, task)
			e.runtimeMu.Lock()
			rt := e.runtimes[task.ID]
			e.runtimeMu.Unlock()
			done := make(chan struct{})
			go func() { rt.wg.Wait(); close(done) }()
			select {
			case <-done:
			case <-ctx.Done():
				t.Fatal("terminal coordinator did not exit")
			}
			if _, exists := e.coordStarted.Load(task.ID); exists {
				t.Fatal("terminal exit retained coordinator marker")
			}
			task.updateLifecycle(func(s *taskLifecycleState) { s.Status = "running" })
			e.startDeadlineCoordinator(ctx, task)
			if _, exists := e.coordStarted.Load(task.ID); !exists {
				t.Fatal("revival failed to start coordinator")
			}
			cancel()
			rt.wg.Wait()
		})
	}
}

func TestNoResultCheckpointAndRevival(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	for _, tc := range []struct {
		name, severity string
		wantStop       bool
	}{
		{"no findings", "", true}, {"qualifying", "high", false}, {"below threshold", "low", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task, err := m.CreateTaskWithOptions("checkpoint test", "goal", db.TaskCreateOptions{NoResultSeconds: 60, NoResultMinFindings: 1, NoResultMinSeverity: "high"})
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
			id, _ := strconv.ParseInt(task.ID, 10, 64)
			if err := m.SetTaskStatus(task.ID, "running"); err != nil {
				t.Fatal(err)
			}
			if _, err := m.pg.Exec(`UPDATE tasks SET active_run_seconds=60 WHERE id=$1`, id); err != nil {
				t.Fatal(err)
			}
			if err := m.syncTaskRuntime(task.ID, id); err != nil {
				t.Fatal(err)
			}
			if tc.severity != "" {
				if _, err := m.pg.AddFinding(id, 0, "test", "test", tc.severity, "", "", "test", nil); err != nil {
					t.Fatal(err)
				}
			}
			e := NewEngine(m)
			stop, err := e.checkNoResultCheckpoint(task)
			if err != nil || stop != tc.wantStop {
				t.Fatalf("stop=%v err=%v", stop, err)
			}
			stored, err := m.pg.GetTask(id)
			if err != nil || stored.NoResultCheckedAt == nil {
				t.Fatalf("missing durable check: %+v, %v", stored, err)
			}
			// Reloading a checked task must preserve the one-shot decision.
			reloaded := taskFromPG(stored, task.Store, nil)
			if again, err := e.checkNoResultCheckpoint(reloaded); err != nil || again {
				t.Fatalf("rechecked: %v, %v", again, err)
			}
			if !stop {
				// Losing the qualifying finding later does not start a new check.
				if _, err := m.pg.Exec(`DELETE FROM findings WHERE task_id=$1`, id); err != nil {
					t.Fatal(err)
				}
				e.deadlineCoordinator(t.Context(), task)
				if m.TaskStatus(task.ID) != "running" {
					t.Fatal("passed task stopped")
				}
				return
			}
			// A finding arriving during settling cannot undo the decision.
			if _, err := m.pg.AddFinding(id, 0, "test", "late", "high", "", "", "test", nil); err != nil {
				t.Fatal(err)
			}
			provider := &scriptedLLMProvider{err: errors.New("test final planner unavailable")}
			planner := agent.NewPlanner(provider, "test", t.TempDir(), nil, 0, 1)
			e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) { return planner, &agent.Worker{} })
			e.settleTask(t.Context(), task, db.StopReasonNoResult)
			state := task.lifecycleSnapshot()
			if state.Status != "timeout" || state.StopReason != db.StopReasonNoResult || !e.isSettling(task.ID) {
				t.Fatalf("settled: %+v", state)
			}
			dto := taskDTO(task, "timeout")
			if dto.StopReason != db.StopReasonNoResult || dto.NoResultSeconds != 60 {
				t.Fatalf("DTO: %+v", dto)
			}
			if err := m.applyTaskAdmission(task.ID, "timeout", "running", false, "resume", false, nil); err != nil {
				t.Fatal(err)
			}
			e.resetTimeoutRevival(task.ID)
			state = task.lifecycleSnapshot()
			if state.NoResultCheckedAt != 0 || state.StopReason != "" || state.NoResultBaseSeconds != state.ActiveRunSeconds || noResultRemaining(60, state, time.Now().Unix()) != time.Minute || e.isSettling(task.ID) {
				t.Fatalf("revived: %+v", state)
			}
			stored, err = m.pg.GetTask(id)
			if err != nil || stored.NoResultCheckedAt != nil || stored.StopReason != "" || stored.NoResultBaseSeconds != 60 {
				t.Fatalf("revival not durable: %+v, %v", stored, err)
			}
		})
	}
}

func TestNoResultCoordinatorStopsAndReleasesMarker(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	task, err := m.CreateTaskWithOptions("coordinator stop", "goal", db.TaskCreateOptions{NoResultSeconds: 60})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	id, _ := strconv.ParseInt(task.ID, 10, 64)
	if _, err := m.pg.Exec(`UPDATE tasks SET active_run_seconds=60 WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err := m.syncTaskRuntime(task.ID, id); err != nil {
		t.Fatal(err)
	}
	e := NewEngine(m)
	// Commit a failed checkpoint, then model a process restart before settling.
	if stop, err := e.checkNoResultCheckpoint(task); err != nil || !stop {
		t.Fatalf("initial decision: %v, %v", stop, err)
	}
	if _, err := m.pg.AddFinding(id, 0, "test", "late after decision", "high", "", "", "test", nil); err != nil {
		t.Fatal(err)
	}
	stored, err := m.pg.GetTask(id)
	if err != nil {
		t.Fatal(err)
	}
	task = taskFromPG(stored, task.Store, nil)
	m.mu.Lock()
	m.tasks[task.ID] = task
	m.mu.Unlock()
	e = NewEngine(m)
	provider := &scriptedLLMProvider{err: errors.New("test final planner unavailable")}
	planner := agent.NewPlanner(provider, "test", t.TempDir(), nil, 0, 1)
	e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) { return planner, &agent.Worker{} })
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	e.startDeadlineCoordinator(ctx, task)
	e.runtimeMu.Lock()
	rt := e.runtimes[task.ID]
	e.runtimeMu.Unlock()
	done := make(chan struct{})
	go func() { rt.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatal("coordinator did not finish")
	}
	if m.TaskStatus(task.ID) != "timeout" || task.lifecycleSnapshot().StopReason != db.StopReasonNoResult {
		t.Fatal("coordinator did not stop task")
	}
	if _, exists := e.coordStarted.Load(task.ID); exists {
		t.Fatal("coordinator marker survived exit")
	}
}

func TestCreateTaskRejectsInvalidNoResultSeverity(t *testing.T) {
	s := &Server{}
	w := httptest.NewRecorder()
	s.createTask(w, httptest.NewRequest("POST", "/api/tasks", strings.NewReader(`{"description":"test","goal":"test","no_result_min_severity":"urgent"}`)))
	if w.Code != 400 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
