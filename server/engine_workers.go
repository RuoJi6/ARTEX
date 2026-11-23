package server

import (
	"context"
	"log"
	"sync"
)

// taskWorkerPool owns the desired plan and all live loops, including retirees.
// A slot name is never reused until its previous loop has fully settled its work.
type taskWorkerPool struct {
	mu      sync.Mutex
	runtime *taskRuntime
	task    *Task
	loops   map[string]*workerSlotRuntime
	desired map[string]WorkerSlot
}

type workerSlotRuntime struct {
	pool    *taskWorkerPool
	slot    WorkerSlot
	idleCtx context.Context
	retire  context.CancelFunc // stops claiming/sleeping, never cancels Execute
}

func (e *Engine) desiredWorkerSlots(t *Task) []WorkerSlot {
	slots, err := workerSlotsForTask(t, e.m.WorkerPools(), e.m.Workers())
	if err != nil {
		log.Printf("[engine] task %s worker pool invalid, using legacy workers: %v", t.ID, err)
		slots, _ = ExpandWorkerSlots(nil, workerCountForTask(t, e.m.Workers()))
	}
	return slots
}

// ReconcileWorkers applies the latest persisted settings without restarting a task.
// Claims and retirement share the pool lock, so no retired slot takes new work.
func (e *Engine) ReconcileWorkers(t *Task) {
	e.deleteMu.RLock()
	defer e.deleteMu.RUnlock()
	if e.IsDeleting(t.ID) {
		return
	}
	value, ok := e.workerPools.Load(t.ID)
	if !ok {
		return // queued/not started: Run will read the latest configuration
	}
	pool := value.(*taskWorkerPool)
	pool.mu.Lock()
	defer pool.mu.Unlock()
	if pool.runtime.ctx.Err() != nil {
		return
	}
	slots := e.desiredWorkerSlots(t)
	pool.desired = make(map[string]WorkerSlot, len(slots))
	for _, slot := range slots {
		pool.desired[slot.Name] = slot
	}
	for name, loop := range pool.loops {
		if slot, keep := pool.desired[name]; !keep || slot != loop.slot {
			loop.retire()
		}
	}
	for _, slot := range slots {
		if pool.loops[slot.Name] == nil {
			e.startWorkerSlotLocked(pool, slot)
		}
	}
}

// ReconcileDefaultWorkers is called after a global workers/pool save. Explicit
// task overrides keep both their concurrency and legacy task-router profiles.
func (e *Engine) ReconcileDefaultWorkers() {
	e.workerPools.Range(func(_, value any) bool {
		t := value.(*taskWorkerPool).task
		if t.lifecycleSnapshot().WorkerCount == 0 {
			e.ReconcileWorkers(t)
		}
		return true
	})
}

// WorkerCounts distinguishes live pool loops (including draining workers) from
// the effective configured target. Neither count is the number of busy intents.
func (e *Engine) WorkerCounts(t *Task) (actual, target int) {
	if value, ok := e.workerPools.Load(t.ID); ok {
		pool := value.(*taskWorkerPool)
		pool.mu.Lock()
		defer pool.mu.Unlock()
		return len(pool.loops), len(pool.desired)
	}
	return 0, len(e.desiredWorkerSlots(t))
}

// Caller holds deleteMu.RLock and pool.mu. The delete barrier protects wg.Add
// from StopTask.Wait, including replacements started as a retiree exits.
func (e *Engine) startWorkerSlotLocked(pool *taskWorkerPool, slot WorkerSlot) {
	idleCtx, retire := context.WithCancel(pool.runtime.ctx)
	loop := &workerSlotRuntime{pool: pool, slot: slot, idleCtx: idleCtx, retire: retire}
	pool.loops[slot.Name] = loop
	// Publish a fresh immutable routing snapshot. Retired slot routes remain
	// available for human continuation of paused intents until the name is reused.
	plan := make(map[string]int64)
	if old, ok := e.slotPlans.Load(pool.task.ID); ok {
		for name, profile := range old.(map[string]int64) {
			plan[name] = profile
		}
	}
	plan[slot.Name] = slot.ProfileID
	e.slotPlans.Store(pool.task.ID, plan)
	pool.runtime.wg.Add(1)
	runTaskRoutine(pool.runtime, func(ctx context.Context) {
		defer e.finishWorkerSlot(loop)
		e.workerLoop(ctx, pool.task, slot, loop)
	})
}

func (e *Engine) finishWorkerSlot(loop *workerSlotRuntime) {
	loop.retire()
	e.deleteMu.RLock()
	defer e.deleteMu.RUnlock()
	pool := loop.pool
	pool.mu.Lock()
	defer pool.mu.Unlock()
	delete(pool.loops, loop.slot.Name)
	e.slotState.Delete(pool.task.ID + "/" + loop.slot.Name)
	if !e.IsDeleting(pool.task.ID) && pool.runtime.ctx.Err() == nil {
		if slot, needed := pool.desired[loop.slot.Name]; needed {
			e.startWorkerSlotLocked(pool, slot)
		}
	}
}
