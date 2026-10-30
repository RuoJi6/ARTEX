package db

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"
)

func TestFindingGroupTimeSort(t *testing.T) {
	d, task, ids := timeSortFixture(t)
	other, err := d.CreateTask("newer low severity task", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM findings WHERE task_id=$1`, other.ID); _ = d.DeleteTask(other.ID) })
	marker := fmt.Sprintf("time-sort-%d", time.Now().UnixNano())
	if _, err := d.Exec(`UPDATE findings SET vulnclass=$2 WHERE task_id=$1`, task.ID, marker); err != nil {
		t.Fatal(err)
	}
	latest, err := d.AddFinding(other.ID, 0, marker, "latest low", "low", "summary", "evidence", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE findings SET created_at='2026-10-28T12:00:00Z' WHERE id=$1`, latest); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		field, direction string
		want             int64
	}{
		{"time", "desc", other.ID},
		{"time", "asc", task.ID},
		{"severity", "desc", task.ID},
		{"severity", "asc", task.ID},
	} {
		groups, total, reports, err := d.ListFindingGroups(FindingFilter{VulnClass: marker, Sort: tc.field, TimeDirection: tc.direction}, 1, 1)
		if err != nil || total != 2 || reports != len(ids)+1 || len(groups) != 1 || groups[0].TaskID == nil || *groups[0].TaskID != tc.want {
			t.Fatalf("%s/%s groups=%+v total=%d reports=%d err=%v", tc.field, tc.direction, groups, total, reports, err)
		}
	}
}

func TestFindingTimeDirectionAllowlist(t *testing.T) {
	for _, raw := range []string{"", "desc", "invalid", "ASC", "asc; SELECT 1"} {
		if got := (FindingFilter{TimeDirection: raw}).timeOrder(); got != "DESC" {
			t.Fatalf("timeOrder(%q)=%q, want DESC", raw, got)
		}
	}
	if got := (FindingFilter{TimeDirection: "asc"}).timeOrder(); got != "ASC" {
		t.Fatalf("timeOrder(asc)=%q", got)
	}
}

// A newer low-severity record and an older high-severity record make time
// ordering observably different from severity ordering in both directions.
func timeSortFixture(t *testing.T) (*DB, *Task, []int64) {
	t.Helper()
	d, task, ids := caseTestDB(t)
	for i, day := range []int{25, 26, 27, 24} {
		if _, err := d.Exec(`UPDATE findings SET created_at=$2::timestamptz WHERE id=$1`, ids[i], fmt.Sprintf("2026-10-%dT12:00:00Z", day)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.Exec(`UPDATE findings SET severity='critical' WHERE id=$1`, ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE findings SET severity='high' WHERE id=$1`, ids[1]); err != nil {
		t.Fatal(err)
	}
	return d, task, ids
}

func TestFindingTimeSortPages(t *testing.T) {
	d, task, ids := timeSortFixture(t)
	for _, tc := range []struct {
		name, field, direction string
		want                   []int64
	}{
		{"default newest first", "", "", []int64{ids[2], ids[1], ids[0], ids[3]}},
		{"time descending", "time", "desc", []int64{ids[2], ids[1], ids[0], ids[3]}},
		{"time ascending", "time", "asc", []int64{ids[3], ids[0], ids[1], ids[2]}},
		{"severity descending time", "severity", "desc", []int64{ids[0], ids[1], ids[3], ids[2]}},
		{"severity ascending time", "severity", "asc", []int64{ids[0], ids[3], ids[1], ids[2]}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			filter := FindingFilter{TaskID: fmt.Sprint(task.ID), Sort: tc.field, TimeDirection: tc.direction}
			var got []int64
			for page := 1; page <= 2; page++ {
				rows, total, err := d.ListFindingsPage(filter, page, 2)
				if err != nil || total != 4 || len(rows) != 2 {
					t.Fatalf("page %d: rows=%d total=%d err=%v", page, len(rows), total, err)
				}
				for _, row := range rows {
					got = append(got, row.ID)
				}
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("paged order=%v, want %v", got, tc.want)
			}
		})
	}
	if _, err := d.Exec(`UPDATE findings SET created_at='2026-10-27T12:00:00Z' WHERE task_id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	for _, direction := range []string{"asc", "desc"} {
		rows, _, err := d.ListFindingsPage(FindingFilter{TaskID: fmt.Sprint(task.ID), Sort: "time", TimeDirection: direction}, 1, 4)
		if err != nil {
			t.Fatal(err)
		}
		for i, row := range rows {
			if row.ID != ids[len(ids)-1-i] {
				t.Fatalf("unstable timestamp tie: %+v", rows)
			}
		}
	}
}

func TestFindingCaseTimeSortPages(t *testing.T) {
	d, task, ids := timeSortFixture(t)
	caseID, err := d.MergeFindingCase(context.Background(), task.ID, []int64{ids[0], ids[2]}, "same defect", "shared handler", "human")
	if err != nil {
		t.Fatal(err)
	}
	latest, err := d.AddFinding(task.ID, 0, "other", "latest low", "low", "summary", "evidence", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE findings SET created_at='2026-10-28T12:00:00Z' WHERE id=$1`, latest); err != nil {
		t.Fatal(err)
	}
	f := func(id int64) string { return fmt.Sprintf("f:%d", id) }
	c := fmt.Sprintf("c:%d", caseID)
	for _, tc := range []struct {
		name, field, direction string
		want                   []string
	}{
		{"default newest first", "", "", []string{f(latest), c, f(ids[1]), f(ids[3])}},
		{"time descending", "time", "desc", []string{f(latest), c, f(ids[1]), f(ids[3])}},
		{"time ascending", "time", "asc", []string{f(ids[3]), f(ids[1]), c, f(latest)}},
		{"severity descending time", "severity", "desc", []string{c, f(ids[1]), f(ids[3]), f(latest)}},
		{"severity ascending time", "severity", "asc", []string{c, f(ids[3]), f(ids[1]), f(latest)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			filter := FindingFilter{TaskID: fmt.Sprint(task.ID), Sort: tc.field, TimeDirection: tc.direction}
			var got []string
			for page := 1; page <= 2; page++ {
				rows, total, err := d.ListFindingCases(filter, page, 2)
				if err != nil || total != 4 || len(rows) != 2 {
					t.Fatalf("page %d: rows=%d total=%d err=%v", page, len(rows), total, err)
				}
				for _, row := range rows {
					if row.Case != nil {
						got = append(got, fmt.Sprintf("c:%d", row.Case.ID))
					} else {
						got = append(got, f(row.FindingID))
					}
				}
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("paged order=%v, want %v", got, tc.want)
			}
		})
	}
	// Filtering a folder uses its matching members' timestamps, not merge time.
	rows, total, err := d.ListFindingCases(FindingFilter{TaskID: fmt.Sprint(task.ID), Severity: "low", Sort: "time", TimeDirection: "asc"}, 1, 10)
	if err != nil || total != 2 || len(rows) != 2 || rows[0].Case == nil || rows[0].Case.ID != caseID || rows[1].FindingID != latest {
		t.Fatalf("filtered case order=%+v total=%d err=%v", rows, total, err)
	}
}
