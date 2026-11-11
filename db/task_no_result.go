package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const StopReasonNoResult = "no_result"

// NormalizeNoResultOptions is shared by task creation and API validation.
func NormalizeNoResultOptions(opts *TaskCreateOptions) error {
	if opts.NoResultSeconds < 0 {
		opts.NoResultSeconds = 0
	} else if opts.NoResultSeconds > 0 && opts.NoResultSeconds < 60 {
		opts.NoResultSeconds = 60
	}
	if opts.NoResultMinFindings < 1 {
		opts.NoResultMinFindings = 1
	}
	switch opts.NoResultMinSeverity {
	case "", "low", "medium", "high", "critical":
		return nil
	default:
		return fmt.Errorf("invalid no_result_min_severity: %q", opts.NoResultMinSeverity)
	}
}

const countQualifyingFindingsSQL = `WITH observations AS (
 SELECT CASE WHEN m.case_id IS NULL THEN 'f:'||f.id ELSE 'c:'||m.case_id END entity,
        CASE WHEN m.case_id IS NULL THEN f.severity ELSE c.severity END severity
 FROM findings f
 LEFT JOIN finding_case_members m ON m.finding_id=f.id
 LEFT JOIN finding_cases c ON c.id=m.case_id
 WHERE f.task_id=$1 AND f.status<>'false_positive'
)
SELECT count(DISTINCT entity) FROM observations
WHERE $2='' OR array_position(ARRAY['low','medium','high','critical'],severity)
 >= array_position(ARRAY['low','medium','high','critical'],$2)`

// CountQualifyingFindings counts task-local independent findings, using the case
// severity for grouped observations. False positives never count; unassessed
// findings count only when the caller sets no severity threshold.
func (d *DB) CountQualifyingFindings(taskID int64, minSeverity string) (int, error) {
	if err := NormalizeNoResultOptions(&TaskCreateOptions{NoResultMinSeverity: minSeverity}); err != nil {
		return 0, err
	}
	var count int
	err := d.QueryRow(countQualifyingFindingsSQL, taskID, minSeverity).Scan(&count)
	return count, err
}

// CheckNoResultCheckpoint serializes the count and decision with finding writes
// using their task row lock. A nil checked timestamp means the checkpoint was
// not claimed. Findings committed before the lock is acquired count; later
// writes cannot reverse a persisted stop, even during restart/settling.
func (d *DB) CheckNoResultCheckpoint(ctx context.Context, taskID int64, minFindings int, minSeverity string) (count int, stop bool, checked *time.Time, err error) {
	if err = NormalizeNoResultOptions(&TaskCreateOptions{NoResultMinSeverity: minSeverity}); err != nil {
		return
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, nil, err
	}
	defer tx.Rollback()
	var status string
	var previous sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT status, no_result_checked_at FROM tasks
 WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, taskID).Scan(&status, &previous)
	if err == sql.ErrNoRows {
		return 0, false, nil, nil
	}
	if err != nil {
		return 0, false, nil, err
	}
	if previous.Valid || status == "done" || status == "failed" || status == "timeout" {
		return 0, false, nil, nil
	}
	// READ COMMITTED takes a fresh snapshot for this separate statement, after
	// any finding transaction that held the task lock has committed. Combining
	// this with the locking SELECT would retain the snapshot from before waiting.
	if err = tx.QueryRowContext(ctx, countQualifyingFindingsSQL, taskID, minSeverity).Scan(&count); err != nil {
		return 0, false, nil, err
	}
	stop = count < max(1, minFindings)
	var at time.Time
	if err = tx.QueryRowContext(ctx, `UPDATE tasks SET no_result_checked_at=clock_timestamp(),
 stop_reason=CASE WHEN $2 THEN 'no_result' ELSE '' END WHERE id=$1
 RETURNING no_result_checked_at`, taskID, stop).Scan(&at); err != nil {
		return 0, false, nil, err
	}
	if err = tx.Commit(); err != nil {
		return 0, false, nil, err
	}
	return count, stop, &at, nil
}
