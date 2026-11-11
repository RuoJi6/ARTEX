package db

import (
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

// CountQualifyingFindings counts task-local independent findings, using the case
// severity for grouped observations. False positives never count; unassessed
// findings count only when the caller sets no severity threshold.
func (d *DB) CountQualifyingFindings(taskID int64, minSeverity string) (int, error) {
	if err := NormalizeNoResultOptions(&TaskCreateOptions{NoResultMinSeverity: minSeverity}); err != nil {
		return 0, err
	}
	var count int
	err := d.QueryRow(`WITH observations AS (
 SELECT CASE WHEN m.case_id IS NULL THEN 'f:'||f.id ELSE 'c:'||m.case_id END entity,
        CASE WHEN m.case_id IS NULL THEN f.severity ELSE c.severity END severity
 FROM findings f
 LEFT JOIN finding_case_members m ON m.finding_id=f.id
 LEFT JOIN finding_cases c ON c.id=m.case_id
 WHERE f.task_id=$1 AND f.status<>'false_positive'
)
SELECT count(DISTINCT entity) FROM observations
WHERE $2='' OR array_position(ARRAY['low','medium','high','critical'],severity)
 >= array_position(ARRAY['low','medium','high','critical'],$2)`, taskID, minSeverity).Scan(&count)
	return count, err
}

// MarkNoResultChecked durably claims the single checkpoint. A terminal task or
// an already checked checkpoint returns nil, so concurrent callers cannot stop
// a task twice. A failed decision also persists its reason so restart can finish
// settling without recounting findings that arrived during the drain.
func (d *DB) MarkNoResultChecked(taskID int64, stop bool) (*time.Time, error) {
	var checked time.Time
	err := d.QueryRow(`UPDATE tasks SET no_result_checked_at=now(), stop_reason=CASE WHEN $2 THEN 'no_result' ELSE '' END
 WHERE id=$1 AND deleted_at IS NULL AND no_result_checked_at IS NULL
 AND status NOT IN ('done','failed','timeout')
 RETURNING no_result_checked_at`, taskID, stop).Scan(&checked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &checked, nil
}
