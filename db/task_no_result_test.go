package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"
)

func TestNormalizeNoResultOptions(t *testing.T) {
	for _, tc := range []struct{ seconds, count, wantSeconds, wantCount int }{
		{0, 0, 0, 1}, {-1, -1, 0, 1}, {1, 0, 60, 1}, {59, 2, 60, 2}, {60, 1, 60, 1}, {7200, 3, 7200, 3},
	} {
		opts := TaskCreateOptions{NoResultSeconds: tc.seconds, NoResultMinFindings: tc.count}
		if err := NormalizeNoResultOptions(&opts); err != nil || opts.NoResultSeconds != tc.wantSeconds || opts.NoResultMinFindings != tc.wantCount {
			t.Fatalf("normalize %+v = %+v, %v", tc, opts, err)
		}
	}
	if err := NormalizeNoResultOptions(&TaskCreateOptions{NoResultMinSeverity: "unknown"}); err == nil {
		t.Fatal("invalid severity accepted")
	}
}

func TestCountQualifyingFindings(t *testing.T) {
	d, task, ids := caseTestDB(t)
	caseID, err := d.MergeFindingCase(t.Context(), task.ID, ids[:3], "same defect", "same cause", "test")
	if err != nil {
		t.Fatal(err)
	}
	// The case's severity overrides the high/medium/low original reports.
	if _, err := d.Exec(`UPDATE finding_cases SET severity='medium' WHERE id=$1`, caseID); err != nil {
		t.Fatal(err)
	}
	for _, severity := range []string{"", "critical", "low"} {
		id, err := d.AddFinding(task.ID, 0, "test", "test", severity, "", "", "test", nil)
		if err != nil {
			t.Fatal(err)
		}
		if severity == "critical" {
			if _, err := d.Exec(`UPDATE findings SET status='false_positive' WHERE id=$1`, id); err != nil {
				t.Fatal(err)
			}
		}
	}
	child, err := d.CreateTaskWithOptions("child", "inherits only", TaskCreateOptions{SourceTaskIDs: []int64{task.ID}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(child.ID) })
	for severity, want := range map[string]int{"": 4, "low": 3, "medium": 2, "high": 1, "critical": 0} {
		got, err := d.CountQualifyingFindings(task.ID, severity)
		if err != nil || got != want {
			t.Errorf("severity %q: count=%d, err=%v, want %d", severity, got, err, want)
		}
		if got, err := d.CountQualifyingFindings(child.ID, severity); err != nil || got != 0 {
			t.Errorf("inherited findings counted: %d, %v", got, err)
		}
	}
	// A case with only false-positive observations contributes nothing.
	if _, err := d.Exec(`UPDATE findings SET status='false_positive' WHERE id=ANY($1)`, ids[:3]); err != nil {
		t.Fatal(err)
	}
	if got, err := d.CountQualifyingFindings(task.ID, ""); err != nil || got != 3 {
		t.Fatalf("false-positive case: count=%d err=%v", got, err)
	}
}

func TestNoResultPersistenceGuardAndLegacyArchive(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	task, err := d.CreateTaskWithOptions("checkpoint", "goal", TaskCreateOptions{
		NoResultSeconds: 1, NoResultMinFindings: 0, NoResultMinSeverity: "high",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	if stored, err := d.GetTask(task.ID); err != nil || stored.NoResultSeconds != 60 || stored.NoResultMinFindings != 1 || stored.NoResultMinSeverity != "high" {
		t.Fatalf("creation round trip: %+v, %v", stored, err)
	}
	if _, _, checked, err := d.CheckNoResultCheckpoint(t.Context(), task.ID, 1, "high"); err != nil || checked == nil {
		t.Fatalf("first check: %v, %v", checked, err)
	}
	if _, _, checked, err := d.CheckNoResultCheckpoint(t.Context(), task.ID, 1, "high"); err != nil || checked != nil {
		t.Fatalf("second check: %v, %v", checked, err)
	}
	if _, _, won, err := d.SetTerminalStatusGuardedReasonRuntime(task.ID, "timeout", StopReasonNoResult); err != nil || !won {
		t.Fatalf("stop: won=%v err=%v", won, err)
	}
	if _, _, won, err := d.SetTerminalStatusGuardedReasonRuntime(task.ID, "done", ""); err != nil || won {
		t.Fatalf("terminal guard: won=%v err=%v", won, err)
	}
	stored, err := d.GetTask(task.ID)
	if err != nil || stored.StopReason != StopReasonNoResult || stored.NoResultCheckedAt == nil {
		t.Fatalf("persisted decision: %+v, %v", stored, err)
	}
	if err := d.SetStatus(task.ID, "running"); err != nil {
		t.Fatal(err)
	}
	if stored, err := d.GetTask(task.ID); err != nil || stored.StopReason != "" {
		t.Fatalf("nonterminal reason not cleared: %+v, %v", stored, err)
	}
	if _, _, won, err := d.SetTerminalStatusGuardedReasonRuntime(task.ID, "done", StopReasonNoResult); err != nil || !won {
		t.Fatalf("completed stop: won=%v err=%v", won, err)
	}
	if stored, err := d.GetTask(task.ID); err != nil || stored.StopReason != "" {
		t.Fatalf("done must have no stop reason: %+v, %v", stored, err)
	}
	var raw []byte
	if err := d.QueryRow(`SELECT to_jsonb(t) FROM tasks t WHERE id=$1`, task.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var row map[string]any
	if err := json.Unmarshal(raw, &row); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"no_result_seconds", "no_result_min_findings", "no_result_min_severity", "no_result_base_seconds", "no_result_checked_at", "stop_reason"} {
		delete(row, key)
	}
	tx, err := d.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := restoreTaskStub(tx, row, task.ID, 0); err != nil {
		t.Fatalf("restore old archive without checkpoint fields: %v", err)
	}
	var seconds, minimum int
	var severity, reason string
	if err := tx.QueryRow(`SELECT no_result_seconds,no_result_min_findings,no_result_min_severity,stop_reason FROM tasks WHERE id=$1`, task.ID).Scan(&seconds, &minimum, &severity, &reason); err != nil || seconds != 0 || minimum != 1 || severity != "" || reason != "" {
		t.Fatalf("legacy defaults: %d %d %q %q, %v", seconds, minimum, severity, reason, err)
	}
}

// Register close first so all test data (including non-cascading notification
// events) is removed before the database connection is closed.
func noResultTestDB(t *testing.T) (*DB, *Task) {
	t.Helper()
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTaskWithOptions("checkpoint concurrency", "goal", TaskCreateOptions{NoResultSeconds: 60})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, query := range []string{
			`DELETE FROM notification_events WHERE finding_id IN (SELECT id FROM findings WHERE task_id=$1)`,
			`DELETE FROM findings WHERE task_id=$1`,
		} {
			if _, err := d.Exec(query, task.ID); err != nil {
				t.Error(err)
			}
		}
		if err := d.DeleteTask(task.ID); err != nil {
			t.Error(err)
		}
	})
	return d, task
}

// Observe an actual PostgreSQL lock wait before starting the 500ms assertion,
// rather than assuming the goroutine has been scheduled by then.
func waitForNoResultLockWait(t *testing.T, d *DB, blockerPID int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for {
		var blocked bool
		if err := d.QueryRowContext(ctx, `SELECT EXISTS (
 SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))
 AND query LIKE '%tasks%')`, blockerPID).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("operation never waited for the task row lock")
		case <-tick.C:
		}
	}
}

func TestNoResultCheckpointWaitsForFindingCommit(t *testing.T) {
	d, task := noResultTestDB(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	ready := make(chan int, 1)
	release := make(chan struct{})
	writerDone := make(chan struct{})
	writerErr := make(chan error, 1)
	go func() {
		defer close(writerDone)
		writerErr <- d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
			if _, err := RecordFindingTx(ctx, tx, RecordFindingInput{
				TaskID: task.ID, ExplorationID: task.ExplorationID, Severity: "high", Worker: "test",
			}, nil); err != nil {
				return err
			}
			var pid int
			if err := tx.QueryRow(`SELECT pg_backend_pid()`).Scan(&pid); err != nil {
				return err
			}
			ready <- pid
			select {
			case <-release:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()
	defer func() { cancel(); <-writerDone }()
	var pid int
	select {
	case pid = <-ready:
	case err := <-writerErr:
		t.Fatalf("record finding: %v", err)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	type decision struct {
		count   int
		stop    bool
		checked *time.Time
		err     error
	}
	result := make(chan decision, 1)
	checkerDone := make(chan struct{})
	go func() {
		defer close(checkerDone)
		count, stop, checked, err := d.CheckNoResultCheckpoint(ctx, task.ID, 1, "high")
		result <- decision{count, stop, checked, err}
	}()
	defer func() { cancel(); <-checkerDone }()
	waitForNoResultLockWait(t, d, pid)
	select {
	case got := <-result:
		t.Fatalf("checkpoint returned before finding commit: %+v", got)
	case <-time.After(500 * time.Millisecond):
	}
	close(release)
	if err := <-writerErr; err != nil {
		t.Fatal(err)
	}
	got := <-result
	if got.err != nil || got.count != 1 || got.stop || got.checked == nil {
		t.Fatalf("checkpoint after finding commit: %+v", got)
	}
	stored, err := d.GetTask(task.ID)
	if err != nil || stored.StopReason != "" || stored.NoResultCheckedAt == nil || !stored.NoResultCheckedAt.Equal(*got.checked) {
		t.Fatalf("persisted checkpoint: %+v, %v", stored, err)
	}
}

func TestNoResultCheckpointBlocksLaterFinding(t *testing.T) {
	d, task := noResultTestDB(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	count, stop, checked, err := d.CheckNoResultCheckpoint(ctx, task.ID, 1, "high")
	if err != nil || count != 0 || !stop || checked == nil {
		t.Fatalf("initial checkpoint: %d %v %v %v", count, stop, checked, err)
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := LockTaskEvidenceTx(tx, task.ID); err != nil {
		t.Fatal(err)
	}
	var pid int
	if err := tx.QueryRow(`SELECT pg_backend_pid()`).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	writerErr := make(chan error, 1)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		writerErr <- d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
			_, err := RecordFindingTx(ctx, tx, RecordFindingInput{
				TaskID: task.ID, ExplorationID: task.ExplorationID, Severity: "high", Worker: "test",
			}, nil)
			return err
		})
	}()
	defer func() { cancel(); <-writerDone }()
	waitForNoResultLockWait(t, d, pid)
	select {
	case err := <-writerErr:
		t.Fatalf("finding bypassed task lock: %v", err)
	case <-time.After(500 * time.Millisecond):
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-writerErr; err != nil {
		t.Fatal(err)
	}
	stored, err := d.GetTask(task.ID)
	if err != nil || stored.StopReason != StopReasonNoResult || stored.NoResultCheckedAt == nil || !stored.NoResultCheckedAt.Equal(*checked) {
		t.Fatalf("later finding changed checkpoint: %+v, %v", stored, err)
	}
	if count, err := d.CountQualifyingFindings(task.ID, "high"); err != nil || count != 1 {
		t.Fatalf("later finding not committed: %d, %v", count, err)
	}
	if _, _, again, err := d.CheckNoResultCheckpoint(ctx, task.ID, 1, "high"); err != nil || again != nil {
		t.Fatalf("checkpoint claimed again: %v, %v", again, err)
	}
}

func TestNoResultCheckpointSkipsUnavailableTasks(t *testing.T) {
	for _, status := range []string{"done", "failed", "timeout", "deleted", "missing"} {
		t.Run(status, func(t *testing.T) {
			d, task := noResultTestDB(t)
			id := task.ID
			switch status {
			case "deleted":
				_, err := d.Exec(`UPDATE tasks SET deleted_at=clock_timestamp() WHERE id=$1`, id)
				if err != nil {
					t.Fatal(err)
				}
			case "missing":
				id = -1
			default:
				if err := d.SetStatus(id, status); err != nil {
					t.Fatal(err)
				}
			}
			if count, stop, checked, err := d.CheckNoResultCheckpoint(t.Context(), id, 1, ""); err != nil || count != 0 || stop || checked != nil {
				t.Fatalf("unavailable task claimed: %d %v %v %v", count, stop, checked, err)
			}
		})
	}
}
