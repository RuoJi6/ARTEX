package db

import (
	"context"
	"fmt"
	"slices"
	"testing"
)

func TestFilteredFindingStatsMatchesList(t *testing.T) {
	d, task, ids := timeSortFixture(t)
	if _, err := d.MergeFindingCase(context.Background(), task.ID, ids[:3], "same defect", "verified shared root cause", "test"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.SetFindingStatus(ids[0], FindingResolved); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE findings SET name='needle' WHERE id=$1`, ids[1]); err != nil {
		t.Fatal(err)
	}
	asset := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": "issue125.example", "root_domain": "issue125.example"})
	t.Cleanup(func() { d.Exec(`DELETE FROM assets WHERE id=$1`, asset) })
	if _, err := d.Exec(`UPDATE findings SET asset_ids=$2::jsonb WHERE id=$1`, ids[1], fmt.Sprintf("[%d]", asset)); err != nil {
		t.Fatal(err)
	}
	base := FindingFilter{TaskID: fmt.Sprint(task.ID)}
	for _, tc := range []struct {
		name                                  string
		filter                                FindingFilter
		reports, defects, critical, high, low int
	}{
		{"task", base, 4, 2, 1, 2, 1},
		{"severity", FindingFilter{TaskID: base.TaskID, Severity: "high"}, 2, 2, 0, 2, 0},
		{"status", FindingFilter{TaskID: base.TaskID, Status: FindingResolved}, 1, 1, 1, 0, 0},
		{"query", FindingFilter{TaskID: base.TaskID, Query: "needle"}, 1, 1, 0, 1, 0},
		{"class", FindingFilter{TaskID: base.TaskID, VulnClass: "IDOR"}, 4, 2, 1, 2, 1},
		{"dates", FindingFilter{TaskID: base.TaskID, From: "2026-10-26T00:00:00Z", To: "2026-10-27T23:59:59Z"}, 2, 1, 0, 1, 1},
		{"combined", FindingFilter{TaskID: base.TaskID, Severity: "high", Status: FindingPending, Query: "needle", VulnClass: "IDOR", From: "2026-10-26T00:00:00Z"}, 1, 1, 0, 1, 0},
		{"asset", FindingFilter{TaskID: base.TaskID, AssetScope: fmt.Sprintf("a:%d", asset)}, 1, 1, 0, 1, 0},
		{"unassigned asset", FindingFilter{TaskID: base.TaskID, AssetScope: FindingUnassignedAsset}, 3, 2, 1, 1, 1},
		{"empty", FindingFilter{TaskID: base.TaskID, Query: "no matching finding"}, 0, 0, 0, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st, err := d.FilteredFindingStats(tc.filter)
			if err != nil {
				t.Fatal(err)
			}
			if st.Total != tc.reports || st.Distinct.Total != tc.defects || st.Critical != tc.critical || st.High != tc.high || st.Low != tc.low {
				t.Fatalf("stats=%+v distinct=%+v", st, st.Distinct)
			}
			_, total, err := d.ListFindingCases(tc.filter, 1, 1)
			if err != nil || total != st.Distinct.Total {
				t.Fatalf("list total=%d stats=%d err=%v", total, st.Distinct.Total, err)
			}
			_, reports, err := d.ListFindingsPage(tc.filter, 1, 1)
			if err != nil || reports != st.Total {
				t.Fatalf("reports=%d stats=%d err=%v", reports, st.Total, err)
			}
			if !slices.Contains(st.VulnClasses, "IDOR") || !slices.ContainsFunc(st.Tasks, func(option FindingTaskOption) bool { return option.ID == task.ID && option.Count == 4 }) {
				t.Fatal("filtered counts removed global options")
			}
		})
	}
	// Deleted-task records remain selectable through the unassigned sentinel.
	orphan, err := d.AddFinding(0, 0, "__issue125_orphan__", "orphan", "medium", "", "", "test", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.DeleteFinding(orphan) })
	st, err := d.FilteredFindingStats(FindingFilter{TaskID: FindingUnassignedTask, VulnClass: "__issue125_orphan__"})
	if err != nil || st.Total != 1 || st.Medium != 1 || st.Distinct.Total != 1 {
		t.Fatalf("orphan stats=%+v err=%v", st, err)
	}
}
