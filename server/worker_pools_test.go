package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

func TestExpandWorkerSlotsLegacy(t *testing.T) {
	for _, tc := range []struct {
		name  string
		count int
		want  int
	}{
		{"configured", 2, 2},
		{"zero defaults", 0, 3},
		{"negative defaults", -1, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			slots, err := ExpandWorkerSlots(nil, tc.count)
			if err != nil || len(slots) != tc.want {
				t.Fatalf("slots=%v err=%v, want %d", slots, err, tc.want)
			}
			for i, slot := range slots {
				if slot.Name != "work#"+strconv.Itoa(i+1) || slot.ProfileID != 0 {
					t.Fatalf("slot[%d]=%+v", i, slot)
				}
			}
		})
	}
}

func TestExpandWorkerSlotsPoolOrder(t *testing.T) {
	slots, err := ExpandWorkerSlots([]WorkerPool{{ProfileID: 7, Workers: 2}, {ProfileID: 12, Workers: 3}}, 99)
	if err != nil || len(slots) != 5 {
		t.Fatalf("slots=%v err=%v", slots, err)
	}
	for i, slot := range slots {
		want := int64(7)
		if i >= 2 {
			want = 12
		}
		if slot.Name != "work#"+strconv.Itoa(i+1) || slot.ProfileID != want {
			t.Fatalf("slot[%d]=%+v want profile %d", i, slot, want)
		}
	}
}

func TestValidateWorkerPools(t *testing.T) {
	for _, tc := range []struct {
		name  string
		pools []WorkerPool
		valid bool
	}{
		{"empty", nil, true},
		{"bad profile", []WorkerPool{{ProfileID: 0, Workers: 1}}, false},
		{"bad workers", []WorkerPool{{ProfileID: 1, Workers: 0}}, false},
		{"duplicate", []WorkerPool{{ProfileID: 1, Workers: 1}, {ProfileID: 1, Workers: 1}}, false},
		{"too many", []WorkerPool{{ProfileID: 1, Workers: 51}}, false},
		{"valid", []WorkerPool{{ProfileID: 1, Workers: 1}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ValidateWorkerPools(tc.pools) == nil; got != tc.valid {
				t.Fatalf("valid=%v want %v", got, tc.valid)
			}
		})
	}
}

func TestWorkerPoolSettingsRoundTrip(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	pID, err := m.pg.SaveProfile(&db.LLMProfile{Name: "pool-test", Format: "openai", Model: "pool-test", APIKey: "pool-test-key"})
	if err != nil {
		t.Fatal(err)
	}
	defer m.pg.DeleteProfile(pID)
	oldPools, _, _ := m.pg.GetSetting(settingWorkerPools)
	oldWorkers, workersSet, _ := m.pg.GetSetting(settingWorkers)
	defer func() {
		if workersSet {
			_ = m.pg.SetSetting(settingWorkers, oldWorkers)
		} else {
			_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", settingWorkers)
		}
		if oldPools != "" {
			_ = m.pg.SetSetting(settingWorkerPools, oldPools)
		} else {
			_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", settingWorkerPools)
		}
	}()
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: 9223372036854775807, Workers: 1}}); err == nil {
		t.Fatal("nonexistent profile accepted")
	}
	if err := m.SetWorkerPools([]WorkerPool{{ProfileID: pID, Workers: 2}}); err != nil {
		t.Fatal(err)
	}
	got := m.WorkerPools()
	if len(got) != 1 || got[0].ProfileID != pID || got[0].Workers != 2 || m.Workers() != 2 {
		t.Fatalf("round trip pools=%+v workers=%d", got, m.Workers())
	}
	if err := m.SetWorkerPools(nil); err != nil {
		t.Fatal(err)
	}
	if got := m.WorkerPools(); got == nil || len(got) != 0 {
		t.Fatalf("cleared pools=%+v", got)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	if _, err := m.pg.Exec("DELETE FROM settings WHERE key=$1", settingWorkerPools); err != nil {
		t.Fatal(err)
	}
	res := httptest.NewRecorder()
	s.getSettings(res, httptest.NewRequest(http.MethodGet, "/api/settings", nil))
	var unset map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &unset); err != nil {
		t.Fatal(err)
	}
	if pools, ok := unset["worker_pools"].([]any); !ok || pools == nil || len(pools) != 0 {
		t.Fatalf("GET unset worker_pools=%#v, want empty array", unset["worker_pools"])
	}
	put := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"workers":2,"worker_pools":[{"profile_id":"`+strconv.FormatInt(pID, 10)+`","workers":2}]}`))
	putResult := httptest.NewRecorder()
	s.putSettings(putResult, put)
	if putResult.Code != http.StatusOK {
		t.Fatalf("PUT worker pools status=%d body=%s", putResult.Code, putResult.Body.String())
	}
	if m.Workers() != 2 || len(m.WorkerPools()) != 1 {
		t.Fatalf("PUT worker pools did not sync settings: workers=%d pools=%+v", m.Workers(), m.WorkerPools())
	}
	workersOnly := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"workers":9}`))
	workersOnlyResult := httptest.NewRecorder()
	s.putSettings(workersOnlyResult, workersOnly)
	if workersOnlyResult.Code != http.StatusOK || m.Workers() != 2 {
		t.Fatalf("workers-only PUT changed pool total: status=%d workers=%d", workersOnlyResult.Code, m.Workers())
	}
	req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	res = httptest.NewRecorder()
	s.getSettings(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("GET settings status=%d", res.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	pools, ok := payload["worker_pools"].([]any)
	if !ok || len(pools) != 1 || pools[0].(map[string]any)["profile_id"] != strconv.FormatInt(pID, 10) {
		t.Fatalf("GET worker_pools=%#v, want string profile id", payload["worker_pools"])
	}
	clear := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"workers":4,"worker_pools":[]}`))
	clearResult := httptest.NewRecorder()
	s.putSettings(clearResult, clear)
	if clearResult.Code != http.StatusOK || m.Workers() != 4 || len(m.WorkerPools()) != 0 {
		t.Fatalf("PUT legacy clear status=%d body=%s workers=%d pools=%+v", clearResult.Code, clearResult.Body.String(), m.Workers(), m.WorkerPools())
	}
	res = httptest.NewRecorder()
	s.getSettings(res, httptest.NewRequest(http.MethodGet, "/api/settings", nil))
	var cleared map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &cleared); err != nil {
		t.Fatal(err)
	}
	if pools, ok := cleared["worker_pools"].([]any); !ok || pools == nil || len(pools) != 0 {
		t.Fatalf("GET cleared worker_pools=%#v, want empty array", cleared["worker_pools"])
	}
}

func TestPinnedRuntimeMissingProfileDoesNotFallback(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("pinned runtime test", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})
	fallback, err := m.pg.SaveProfile(&db.LLMProfile{Name: "pinned-fallback", Format: "openai", Model: "fallback", APIKey: "fallback-key"})
	if err != nil {
		t.Fatal(err)
	}
	defer m.pg.DeleteProfile(fallback)
	if _, err := m.ReplaceTaskLLMProfiles(task.ID, []int64{fallback}, fallback); err != nil {
		t.Fatal(err)
	}
	missing := int64(9223372036854775807)
	s := &Server{m: m, llmOn: true, llmProv: &scriptedLLMProvider{}}
	runtime := &taskLLMRuntime{s: s, taskID: task.ID, agentKey: "worker", pinProfileID: &missing}
	if _, err := runtime.current(); err == nil {
		t.Fatal("missing pinned profile silently fell back")
	}
	if _, ok := runtime.activeCfg(); ok || runtime.nonStreaming() || runtime.maxTokens() != 0 {
		t.Fatal("missing pinned profile exposed fallback runtime settings")
	}
}

func TestPinnedRuntimeQuotaDoesNotAdvanceTaskFailover(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("pinned quota", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})
	profileID, err := m.pg.SaveProfile(&db.LLMProfile{Name: "pinned-quota", Format: "openai", Model: "pinned", APIKey: "key"})
	if err != nil {
		t.Fatal(err)
	}
	defer m.pg.DeleteProfile(profileID)
	if _, err := m.ReplaceTaskLLMProfiles(task.ID, []int64{profileID}, profileID); err != nil {
		t.Fatal(err)
	}
	before, err := m.pg.GetTask(taskIDInt(t, task.ID))
	if err != nil || before == nil || before.ActiveLLMProfileID == nil {
		t.Fatalf("load task failover state: task=%+v err=%v", before, err)
	}
	provider := &scriptedLLMProvider{err: errors.New("insufficient_quota")}
	s := &Server{m: m, provByProfile: map[int64]*provEntry{profileID: {prov: provider, cfg: agent.Config{}}}}
	id := profileID
	runtime := &taskLLMRuntime{s: s, taskID: task.ID, agentKey: "worker", pinProfileID: &id}
	if _, _, _, err := runtime.Complete(context.Background(), llm.CompletionRequest{}); err == nil {
		t.Fatal("pinned quota error unexpectedly succeeded")
	}
	after, err := m.pg.GetTask(taskIDInt(t, task.ID))
	if err != nil || after == nil || after.LLMChainRevision != before.LLMChainRevision || after.ActiveLLMProfileID == nil || *after.ActiveLLMProfileID != *before.ActiveLLMProfileID {
		t.Fatalf("pinned quota changed task failover state: before=%+v after=%+v err=%v", before, after, err)
	}
}

func taskIDInt(t *testing.T, id string) int64 {
	t.Helper()
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestPinnedWorkerLoopDoesNotConsultTaskRouterAndReportsFailureOnce(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("pinned worker loop", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})

	e := NewEngine(m)
	var routerCalls atomic.Int32
	e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) {
		routerCalls.Add(1)
		return nil, nil
	})
	e.SetWorkerResolver(func(*Task, WorkerSlot) (*agent.Worker, error) {
		return nil, errors.New("profile unavailable")
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		e.workerLoop(ctx, task, WorkerSlot{Name: "work#4", ProfileID: 12})
		close(done)
	}()
	time.Sleep(100 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("worker loop did not stop")
	}
	if routerCalls.Load() != 0 {
		t.Fatalf("pinned worker consulted task router %d times", routerCalls.Load())
	}
	activities, _, err := task.Store.ActivityList(nil, 0, 20)
	if err != nil {
		t.Fatal(err)
	}
	var failures int
	for _, activity := range activities {
		if activity.Worker == "system" && activity.IsError {
			failures++
		}
	}
	if failures != 1 {
		t.Fatalf("pinned failure activities=%d, want one throttled entry: %+v", failures, activities)
	}
}

func TestPinnedWorkerAvailabilityRecoveryUsesSystemSession(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("pinned availability", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})
	e := NewEngine(m)
	slot := WorkerSlot{Name: "work#4", ProfileID: 12}
	e.reportSlotAvailability(task, slot, errors.New("profile unavailable"))
	e.reportSlotAvailability(task, slot, nil)
	activities, _, err := task.Store.ActivityList(nil, 0, 20)
	if err != nil {
		t.Fatal(err)
	}
	var failure, recovery int
	for _, activity := range activities {
		if activity.Worker != "system" {
			continue
		}
		if activity.IsError && strings.Contains(activity.Summary, "work#4") && strings.Contains(activity.Summary, "#12") {
			failure++
		}
		if !activity.IsError && strings.Contains(activity.Summary, "work#4") && strings.Contains(activity.Summary, "#12") {
			recovery++
		}
	}
	if failure != 1 || recovery != 1 {
		t.Fatalf("system availability activities failure=%d recovery=%d: %+v", failure, recovery, activities)
	}
}

func TestDetachedIntentPinnedOwnerUsesPinnedResolver(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("detached pinned owner", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer m.DeleteTask(task.ID, DeleteTaskOptions{})
	intentID, err := task.Store.AddIntent(map[string]any{"text": "continue"}, 0, nil, "test")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := task.Store.ClaimIntent(intentID, "work#4"); err != nil || !ok {
		t.Fatalf("claim intent: ok=%v err=%v", ok, err)
	}
	if changed, err := task.Store.CompareAndSetIntentState(intentID, "running", "paused"); err != nil || !changed {
		t.Fatalf("pause intent: changed=%v err=%v", changed, err)
	}
	e := NewEngine(m)
	e.slotPlans.Store(task.ID, map[string]int64{"work#4": 12})
	var pinnedCalls, snapshotCalls atomic.Int32
	e.SetWorkerResolver(func(_ *Task, slot WorkerSlot) (*agent.Worker, error) {
		pinnedCalls.Add(1)
		if slot.Name != "work#4" || slot.ProfileID != 12 {
			t.Fatalf("unexpected pinned slot: %+v", slot)
		}
		return nil, errors.New("profile unavailable")
	})
	e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) {
		snapshotCalls.Add(1)
		return nil, nil
	})
	err = e.runDetachedIntent(context.Background(), task, intentID, "request", "human", "agent")
	if err == nil || !strings.Contains(err.Error(), "LLM 配置 #12 不可用") {
		t.Fatalf("runDetachedIntent err=%v", err)
	}
	if pinnedCalls.Load() != 1 || snapshotCalls.Load() != 0 {
		t.Fatalf("pinned calls=%d snapshot calls=%d", pinnedCalls.Load(), snapshotCalls.Load())
	}
	node, err := task.Store.GetNode(intentID)
	if err != nil || node == nil || node.State != "paused" {
		t.Fatalf("intent changed after unavailable resolver: node=%+v err=%v", node, err)
	}
}
