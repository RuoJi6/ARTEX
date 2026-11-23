package server

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// Issue #141: saving a different pool profile must replace a running task's
// pinned worker even when the slot name and pool size do not change.
func TestWorkerPoolProfileHotReload(t *testing.T) {
	for _, unavailable := range []bool{true, false} {
		t.Run(fmt.Sprintf("old_profile_unavailable=%t", unavailable), func(t *testing.T) {
			m, err := NewManager(t.TempDir(), "")
			if err != nil {
				t.Skipf("postgres unavailable: %v", err)
			}
			defer m.Close()
			oldPools, poolsSet, err := m.pg.GetSetting(settingWorkerPools)
			if err != nil {
				t.Fatal(err)
			}
			oldWorkers, workersSet, err := m.pg.GetSetting(settingWorkers)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				for key, value := range map[string]struct {
					text string
					set  bool
				}{settingWorkerPools: {oldPools, poolsSet}, settingWorkers: {oldWorkers, workersSet}} {
					if value.set {
						_ = m.pg.SetSetting(key, value.text)
					} else {
						_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", key)
					}
				}
			}()
			oldID, err := m.pg.SaveProfile(&db.LLMProfile{Name: "old-worker", Format: "openai", Model: "old-model"})
			if err != nil {
				t.Fatal(err)
			}
			defer m.pg.DeleteProfile(oldID)
			newID, err := m.pg.SaveProfile(&db.LLMProfile{Name: "new-worker", Format: "openai", Model: "new-model"})
			if err != nil {
				t.Fatal(err)
			}
			defer m.pg.DeleteProfile(newID)
			if err := m.SetWorkerPools([]WorkerPool{{ProfileID: oldID, Workers: 1}}); err != nil {
				t.Fatal(err)
			}
			task, err := m.CreateTask("worker profile switch", "fixture", nil, 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			defer m.DeleteTask(task.ID, DeleteTaskOptions{})
			intentID, err := task.Store.AddIntent(map[string]any{"text": "first intent"}, 0, nil, "test")
			if err != nil {
				t.Fatal(err)
			}
			e := NewEngine(m)
			defer e.StopTask(task.ID)
			oldProvider := &resizingProvider{calls: make(chan resizingCall, 4)}
			newProvider := &resizingProvider{calls: make(chan resizingCall, 4)}
			s := &Server{
				m: m, engine: e,
				provByProfile: map[int64]*provEntry{
					newID: {prov: newProvider, cfg: agent.Config{Model: "new-model", Retry: agent.RetryConfig{StreamAttempts: -1}}},
				},
				taskAgents: map[string]*taskAgentBundle{task.ID: {pinnedWorkers: map[int64]*agent.Worker{}}},
			}
			// The unavailable fixture has no usable credentials and no cached
			// provider; workerForTaskSlot must reject it without claiming work.
			if !unavailable {
				s.provByProfile[oldID] = &provEntry{prov: oldProvider, cfg: agent.Config{Model: "old-model"}}
			}
			e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) { return nil, nil })
			oldResolved := make(chan struct{})
			var once sync.Once
			e.SetWorkerResolver(func(task *Task, slot WorkerSlot) (*agent.Worker, error) {
				worker, err := s.workerForTaskSlot(task, slot)
				if slot.ProfileID == oldID {
					once.Do(func() { close(oldResolved) })
				}
				return worker, err
			})
			e.Run(t.Context(), task)
			select {
			case <-oldResolved:
			case <-time.After(5 * time.Second):
				t.Fatal("old slot was never resolved")
			}
			getCall := func(provider *resizingProvider) resizingCall {
				t.Helper()
				select {
				case call := <-provider.calls:
					return call
				case <-time.After(5 * time.Second):
					t.Fatal("worker did not call the expected provider")
					return resizingCall{}
				}
			}
			var oldCall resizingCall
			if !unavailable {
				oldCall = getCall(oldProvider)
				intentID, err = task.Store.AddIntent(map[string]any{"text": "next intent"}, 0, nil, "test")
				if err != nil {
					t.Fatal(err)
				}
			} else {
				node, err := task.Store.GetNode(intentID)
				if err != nil || node == nil || node.State != "open" {
					t.Fatalf("unavailable profile claimed intent: node=%+v err=%v", node, err)
				}
			}
			// Same count, different profile. Repeated saves must be harmless.
			for range 2 {
				if err := m.SetWorkerPools([]WorkerPool{{ProfileID: newID, Workers: 1}}); err != nil {
					t.Fatal(err)
				}
			}
			if !unavailable {
				if oldCall.ctx.Err() != nil {
					t.Fatal("profile switch cancelled the in-flight intent")
				}
				select {
				case <-newProvider.calls:
					t.Fatal("replacement started before the old slot settled")
				default:
				}
				close(oldCall.release)
			}
			newCall := getCall(newProvider)
			node, err := task.Store.GetNode(intentID)
			if err != nil || node == nil || node.State != "running" || node.Owner != "work#1" {
				t.Fatalf("replacement did not claim intent: node=%+v err=%v", node, err)
			}
			close(newCall.release)
			waitWorkerCondition(t, func() bool {
				node, _ := task.Store.GetNode(intentID)
				return node != nil && node.State == "done" && e.inflightCount(task.ID) == 0
			})
			select {
			case <-oldProvider.calls:
				t.Fatal("retired slot called the old provider again")
			default:
			}
			if actual, target := e.WorkerCounts(task); actual != 1 || target != 1 {
				t.Fatalf("replacement loop counts=%d/%d, want 1/1", actual, target)
			}
			// StopTask must include the dynamically replaced slot in its wait.
			e.StopTask(task.ID)
			if e.Started(task.ID) {
				t.Fatal("replacement survived StopTask")
			}
		})
	}
}
