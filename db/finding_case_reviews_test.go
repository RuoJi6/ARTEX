package db

import (
	"context"
	"errors"
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
