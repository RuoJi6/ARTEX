package db

import (
	"encoding/json"
	"testing"
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
	if checked, err := d.MarkNoResultChecked(task.ID, true); err != nil || checked == nil {
		t.Fatalf("first check: %v, %v", checked, err)
	}
	if checked, err := d.MarkNoResultChecked(task.ID, true); err != nil || checked != nil {
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
