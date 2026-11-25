package db

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
)

func TestFindingCaseReviewConcurrentReservation(t *testing.T) {
	d, task, ids := caseTestDB(t)
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := d.CreateFindingCaseReviews(context.Background(), map[int64][]int64{task.ID: ids[:2]})
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrFindingCaseReviewBusy) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("created %d reviews instead of one", success)
	}
	rows, err := d.Query(`SELECT conversation_id FROM finding_case_review_runs WHERE task_id=$1`, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	var convs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		convs = append(convs, id)
	}
	rows.Close()
	t.Cleanup(func() {
		for _, id := range convs {
			d.Exec(`DELETE FROM conversations WHERE id=$1`, id)
		}
	})
	if _, err := d.Exec(`UPDATE finding_case_review_runs SET state='done' WHERE task_id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	next, err := d.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task.ID: ids[2:]})
	if err != nil {
		t.Fatal(err)
	}
	convs = append(convs, next[0].ConversationID)
}

func TestFindingCaseReviewMixedRequestRollsBack(t *testing.T) {
	d, task, ids := caseTestDB(t)
	other, err := d.CreateTask("other review", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM findings WHERE task_id=$1`, other.ID); d.DeleteTask(other.ID) })
	fid, err := d.AddFinding(other.ID, 0, "IDOR", "other", "low", "other", "proof", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	current, err := d.CreateFindingCaseReviews(t.Context(), map[int64][]int64{other.ID: {fid}})
	if err != nil {
		t.Fatal(err)
	}
	defer d.Exec(`DELETE FROM conversations WHERE id=$1`, current[0].ConversationID)
	if _, err := d.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task.ID: ids, other.ID: {fid}}); !errors.Is(err, ErrFindingCaseReviewBusy) {
		t.Fatal(err)
	}
	var count int
	if err := d.QueryRow(`SELECT count(*) FROM finding_case_review_runs WHERE task_id=$1`, task.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial enqueue: %d %v", count, err)
	}
}

func TestListFindingIDsByTaskAndCreateAutoReviews(t *testing.T) {
	d, task, ids := caseTestDB(t)
	other, err := d.CreateTask("other auto review", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM findings WHERE task_id=$1`, other.ID); d.DeleteTask(other.ID) })
	f1, err := d.AddFinding(other.ID, 0, "XSS", "reflected", "high", "s1", "p1", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	f2, err := d.AddFinding(other.ID, 0, "XSS", "reflected 2", "medium", "s2", "p2", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}

	byTask, err := d.ListFindingIDsByTask(FindingFilter{TaskID: strconv.FormatInt(other.ID, 10)}, 200)
	if err != nil {
		t.Fatal(err)
	}
	if len(byTask[other.ID]) != 2 || len(byTask) != 1 {
		t.Fatalf("unexpected task filter result: %+v", byTask)
	}
	capped, err := d.ListFindingIDsByTask(FindingFilter{TaskID: strconv.FormatInt(task.ID, 10)}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(capped[task.ID]) != 2 {
		t.Fatalf("expected maxPerTask cap 2, got %d", len(capped[task.ID]))
	}

	// Reserve task as busy first; auto-merge across both tasks must skip busy task and enqueue idle other task.
	busyRun, err := d.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task.ID: ids[:2]})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM conversations WHERE id=$1`, busyRun[0].ConversationID) })

	runs, skipped, err := d.CreateAutoFindingCaseReviews(t.Context(), map[int64][]int64{
		task.ID:  ids,
		other.ID: {f1, f2},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, r := range runs {
			d.Exec(`DELETE FROM conversations WHERE id=$1`, r.ConversationID)
		}
	})
	if skipped != 1 || len(runs) != 1 || runs[0].TaskID != other.ID || len(runs[0].FindingIDs) != 2 {
		t.Fatalf("unexpected auto reservations: runs=%+v skipped=%d", runs, skipped)
	}

	// When all requested tasks are busy, ErrFindingCaseReviewBusy must be returned.
	if _, _, err := d.CreateAutoFindingCaseReviews(t.Context(), map[int64][]int64{
		task.ID:  ids,
		other.ID: {f1, f2},
	}); !errors.Is(err, ErrFindingCaseReviewBusy) {
		t.Fatalf("expected ErrFindingCaseReviewBusy, got %v", err)
	}
}
