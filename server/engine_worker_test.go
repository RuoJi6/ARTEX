package server

import (
	"fmt"
	"testing"

	"github.com/Autumn-27/mysterysecurityteam/db"
)

func TestWorkerCountForTaskUsesOverrideOrGlobalDefault(t *testing.T) {
	if got := workerCountForTask(&Task{WorkerCount: 5}, 3); got != 5 {
		t.Fatalf("override = %d, want 5", got)
	}
	if got := workerCountForTask(&Task{WorkerCount: 0}, 3); got != 3 {
		t.Fatalf("zero override = %d, want global 3", got)
	}
	if got := workerCountForTask(&Task{WorkerCount: -1}, 3); got != 3 {
		t.Fatalf("negative override = %d, want global 3", got)
	}
	if got := workerCountForTask(&Task{WorkerCount: db.MaxTaskWorkerCount + 1}, 3); got != db.MaxTaskWorkerCount {
		t.Fatalf("oversized override = %d, want capped %d", got, db.MaxTaskWorkerCount)
	}
}

func TestWorkerSlotsForTaskCombinesOverridesAndModelPools(t *testing.T) {
	pools := []WorkerPool{{ProfileID: 7, Workers: 2}, {ProfileID: 12, Workers: 1}}
	for _, tc := range []struct {
		name     string
		task     *Task
		pools    []WorkerPool
		global   int
		profiles []int64
	}{
		{"task inherits model pools", &Task{}, pools, 9, []int64{7, 7, 12}},
		{"task override replaces global pools", &Task{WorkerCount: 2}, pools, 9, []int64{0, 0}},
		{"task inherits legacy count", &Task{}, nil, 4, []int64{0, 0, 0, 0}},
		{"task override without pools", &Task{WorkerCount: 1}, nil, 4, []int64{0}},
		{"invalid task value uses pools", &Task{WorkerCount: -1}, pools, 9, []int64{7, 7, 12}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			slots, err := workerSlotsForTask(tc.task, tc.pools, tc.global)
			if err != nil || len(slots) != len(tc.profiles) {
				t.Fatalf("slots=%+v err=%v, want profiles %v", slots, err, tc.profiles)
			}
			for i, profile := range tc.profiles {
				if slots[i].ProfileID != profile || slots[i].Name != fmt.Sprintf("work#%d", i+1) {
					t.Fatalf("slot[%d]=%+v, want profile %d", i, slots[i], profile)
				}
			}
		})
	}
	slots, err := workerSlotsForTask(&Task{WorkerCount: db.MaxTaskWorkerCount + 1}, pools, 3)
	if err != nil || len(slots) != db.MaxTaskWorkerCount {
		t.Fatalf("oversized task override: slots=%d err=%v", len(slots), err)
	}
	if _, err := workerSlotsForTask(&Task{}, []WorkerPool{{ProfileID: 0, Workers: 1}}, 3); err == nil {
		t.Fatal("invalid inherited pool accepted")
	}
}
