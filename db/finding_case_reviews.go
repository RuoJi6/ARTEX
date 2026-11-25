package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

var ErrFindingCaseReviewBusy = errors.New("该任务已有排队或运行中的漏洞整理，请等待完成或停止后重试")

type FindingCaseReviewReservation struct {
	TaskID         int64
	ConversationID int64
	FindingIDs     []int64
}

// Reserve all source tasks atomically, so a concurrent click cannot start a
// second review and a mixed-task request cannot partially enqueue its work.
func (d *DB) CreateFindingCaseReviews(ctx context.Context, batches map[int64][]int64) ([]FindingCaseReviewReservation, error) {
	tasks := make([]int64, 0, len(batches))
	for task := range batches {
		tasks = append(tasks, task)
	}
	sort.Slice(tasks, func(i, j int) bool { return tasks[i] < tasks[j] })
	out := []FindingCaseReviewReservation{}
	err := d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		for _, task := range tasks {
			if err := lockCaseTask(tx, task); err != nil {
				return err
			}
			var busy bool
			if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM finding_case_review_runs WHERE task_id=$1 AND state IN ('queued','running'))`, task).Scan(&busy); err != nil {
				return err
			}
			if busy {
				return fmt.Errorf("%w（任务 #%d）", ErrFindingCaseReviewBusy, task)
			}
		}
		for _, task := range tasks {
			ids := []int64{}
			seen := map[int64]bool{}
			for _, id := range batches[task] {
				if seen[id] {
					continue
				}
				seen[id] = true
				var source int64
				if err := tx.QueryRow(`SELECT task_id FROM findings WHERE id=$1`, id).Scan(&source); err != nil {
					return err
				}
				if source != task {
					return errors.New("所选漏洞不属于来源任务")
				}
				ids = append(ids, id)
			}
			if len(ids) == 0 {
				return errors.New("请选择原始上报")
			}
			raw, err := json.Marshal(ids)
			if err != nil {
				return err
			}
			var conv int64
			if err := tx.QueryRow(`INSERT INTO conversations(agent_key,title) VALUES('reporter',$1) RETURNING id`, fmt.Sprintf("漏洞整理 · task#%d", task)).Scan(&conv); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO finding_case_review_runs(conversation_id,task_id,finding_ids) VALUES($1,$2,$3)`, conv, task, string(raw)); err != nil {
				return err
			}
			out = append(out, FindingCaseReviewReservation{TaskID: task, ConversationID: conv, FindingIDs: ids})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ListFindingIDsByTask resolves findings matching f that belong to an existing
// task, grouped by task_id (newest first within each task) and capped at
// maxPerTask per task when maxPerTask > 0.
func (d *DB) ListFindingIDsByTask(f FindingFilter, maxPerTask int) (map[int64][]int64, error) {
	scoped, err := d.applyAssetScope(f)
	if err != nil {
		return nil, err
	}
	where, args := scoped.where()
	if where == "" {
		where = " WHERE f.task_id IS NOT NULL AND t.id IS NOT NULL"
	} else {
		where += " AND f.task_id IS NOT NULL AND t.id IS NOT NULL"
	}
	rows, err := d.Query(`SELECT f.task_id, f.id FROM findings f LEFT JOIN tasks t ON f.task_id = t.id`+where+` ORDER BY f.task_id ASC, f.created_at DESC, f.id DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]int64{}
	for rows.Next() {
		var taskID, findingID int64
		if err := rows.Scan(&taskID, &findingID); err != nil {
			return nil, err
		}
		if maxPerTask > 0 && len(out[taskID]) >= maxPerTask {
			continue
		}
		out[taskID] = append(out[taskID], findingID)
	}
	return out, rows.Err()
}

// CreateAutoFindingCaseReviews reserves per-task AI auto-merge runs atomically.
// Unlike CreateFindingCaseReviews, tasks that already have a queued or running
// review are skipped (counted in skippedBusy) so other idle tasks can proceed.
// If every requested task is busy, ErrFindingCaseReviewBusy is returned.
func (d *DB) CreateAutoFindingCaseReviews(ctx context.Context, batches map[int64][]int64) ([]FindingCaseReviewReservation, int, error) {
	tasks := make([]int64, 0, len(batches))
	for task := range batches {
		tasks = append(tasks, task)
	}
	sort.Slice(tasks, func(i, j int) bool { return tasks[i] < tasks[j] })
	out := []FindingCaseReviewReservation{}
	skippedBusy := 0
	err := d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		out = out[:0]
		skippedBusy = 0
		idleTasks := make([]int64, 0, len(tasks))
		for _, task := range tasks {
			if err := lockCaseTask(tx, task); err != nil {
				return err
			}
			var busy bool
			if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM finding_case_review_runs WHERE task_id=$1 AND state IN ('queued','running'))`, task).Scan(&busy); err != nil {
				return err
			}
			if busy {
				skippedBusy++
				continue
			}
			idleTasks = append(idleTasks, task)
		}
		if len(idleTasks) == 0 {
			if skippedBusy > 0 {
				return ErrFindingCaseReviewBusy
			}
			return nil
		}
		for _, task := range idleTasks {
			ids := []int64{}
			seen := map[int64]bool{}
			for _, id := range batches[task] {
				if seen[id] {
					continue
				}
				seen[id] = true
				var source sql.NullInt64
				if err := tx.QueryRow(`SELECT task_id FROM findings WHERE id=$1`, id).Scan(&source); err != nil {
					if errors.Is(err, sql.ErrNoRows) {
						continue
					}
					return err
				}
				if !source.Valid || source.Int64 != task {
					continue
				}
				ids = append(ids, id)
			}
			if len(ids) < 2 {
				continue
			}
			raw, err := json.Marshal(ids)
			if err != nil {
				return err
			}
			var conv int64
			if err := tx.QueryRow(`INSERT INTO conversations(agent_key,title) VALUES('reporter',$1) RETURNING id`, fmt.Sprintf("AI 漏洞合并 · task#%d", task)).Scan(&conv); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO finding_case_review_runs(conversation_id,task_id,finding_ids) VALUES($1,$2,$3)`, conv, task, string(raw)); err != nil {
				return err
			}
			out = append(out, FindingCaseReviewReservation{TaskID: task, ConversationID: conv, FindingIDs: ids})
		}
		return nil
	})
	if err != nil {
		return nil, skippedBusy, err
	}
	return out, skippedBusy, nil
}
