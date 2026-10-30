package db

import (
	"database/sql"
	"testing"
)

func TestTaskRunSegmentLifecycle(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	task, err := d.CreateTask("runtime lifecycle", "runtime lifecycle test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })

	active, started, err := d.StartTaskRunSegment(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if started == nil {
		t.Fatal("StartTaskRunSegment did not open a segment")
	}
	if active != 0 {
		t.Fatalf("new task active seconds=%d, want 0", active)
	}
	if _, err := d.Exec(`UPDATE tasks SET run_segment_started_at=now()-interval '3 seconds' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}

	active, started, err = d.FinalizeTaskRunSegment(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if active <= 0 || started != nil {
		t.Fatalf("first finalize active=%d started=%v, want positive and NULL", active, started)
	}
	firstActive := active

	// Pause folds the open segment exactly once and closes it. Repeated
	// finalization after wall-clock advancement remains a no-op.
	if _, _, err := d.StartTaskRunSegment(task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE tasks SET run_segment_started_at=now()-interval '3 seconds' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	active, started, err = d.SetPausedRuntime(task.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if active <= firstActive || started != nil {
		t.Fatalf("pause active=%d started=%v, want increase and NULL", active, started)
	}
	pausedActive := active
	if active, started, err = d.FinalizeTaskRunSegment(task.ID); err != nil {
		t.Fatal(err)
	} else if active != pausedActive || started != nil {
		t.Fatalf("repeated finalize after pause active=%d started=%v, want %d and NULL", active, started, pausedActive)
	}

	// Resuming opens a fresh segment, whose elapsed time is added on top of the
	// paused total rather than replacing it.
	if _, _, err := d.SetPausedRuntime(task.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, started, err = d.StartTaskRunSegment(task.ID); err != nil {
		t.Fatal(err)
	} else if started == nil {
		t.Fatal("resume did not open a segment")
	}
	if _, err := d.Exec(`UPDATE tasks SET run_segment_started_at=now()-interval '3 seconds' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	active, started, err = d.FinalizeTaskRunSegment(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if active <= pausedActive || started != nil {
		t.Fatalf("resume finalize active=%d started=%v, want increase and NULL", active, started)
	}

	// Both terminal status paths fold an open segment and leave no live clock.
	if _, started, err = d.StartTaskRunSegment(task.ID); err != nil {
		t.Fatal(err)
	} else if started == nil {
		t.Fatal("terminal status setup did not open a segment")
	}
	if _, err := d.Exec(`UPDATE tasks SET run_segment_started_at=now()-interval '3 seconds' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	beforeTerminal := active
	active, started, err = d.SetStatusRuntime(task.ID, "done")
	if err != nil {
		t.Fatal(err)
	}
	if active <= beforeTerminal || started != nil {
		t.Fatalf("SetStatusRuntime terminal active=%d started=%v, want increase and NULL", active, started)
	}

	if _, _, err = d.SetStatusRuntime(task.ID, "running"); err != nil {
		t.Fatal(err)
	}
	if _, started, err = d.StartTaskRunSegment(task.ID); err != nil {
		t.Fatal(err)
	} else if started == nil {
		t.Fatal("guarded terminal setup did not open a segment")
	}
	if _, err := d.Exec(`UPDATE tasks SET run_segment_started_at=now()-interval '3 seconds' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	beforeGuarded := active
	active, started, won, err := d.SetTerminalStatusGuardedRuntime(task.ID, "failed")
	if err != nil || !won {
		t.Fatalf("SetTerminalStatusGuardedRuntime: active=%d started=%v won=%v err=%v", active, started, won, err)
	}
	if active <= beforeGuarded || started != nil {
		t.Fatalf("guarded terminal active=%d started=%v, want increase and NULL", active, started)
	}
	finalActive := active
	active, started, won, err = d.SetTerminalStatusGuardedRuntime(task.ID, "timeout")
	if err != nil || won {
		t.Fatalf("second guarded terminal: active=%d started=%v won=%v err=%v", active, started, won, err)
	}
	if active != finalActive || started != nil {
		t.Fatalf("second guarded terminal returned active=%d started=%v, want unchanged active=%d and NULL segment", active, started, finalActive)
	}
	got, err := d.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.ActiveRunSeconds != finalActive || got.RunSegmentStartedAt != nil {
		t.Fatalf("persisted terminal runtime=%+v, want active=%d and NULL segment", got, finalActive)
	}
}

func TestClearOpenTaskRunSegmentsPreservesAccumulatedRuntime(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	task, err := d.CreateTask("runtime restart clear", "runtime restart clear test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	if _, err := d.Exec(`UPDATE tasks SET active_run_seconds=17, run_segment_started_at=now()-interval '1 hour' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}

	cleared, err := d.ClearOpenTaskRunSegments()
	if err != nil {
		t.Fatal(err)
	}
	if cleared < 1 {
		t.Fatalf("ClearOpenTaskRunSegments cleared %d rows, want at least 1", cleared)
	}
	var active int64
	var started sql.NullTime
	if err := d.QueryRow(`SELECT active_run_seconds, run_segment_started_at FROM tasks WHERE id=$1`, task.ID).Scan(&active, &started); err != nil {
		t.Fatal(err)
	}
	if active != 17 || started.Valid {
		t.Fatalf("restart clear changed runtime: active=%d started=%v, want 17 and NULL", active, started)
	}
}
