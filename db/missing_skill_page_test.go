package db

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestMissingSkillStatsPageCountsBeyondFirstPage(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	defer d.Close()
	_, beforeTotal, beforeCalls, err := d.MissingSkillStatsPage(20, 1)
	if err != nil {
		t.Fatal(err)
	}
	prefix := fmt.Sprintf("missing-page-%d-", time.Now().UnixNano())
	names := make([]string, 25)
	for i := range names {
		names[i] = fmt.Sprintf("%s%02d", prefix, i)
	}
	defer d.Exec(`DELETE FROM skill_usage WHERE skill = ANY($1::text[])`, names)
	if _, err := d.Exec(`INSERT INTO skill_usage (skill, agent_key, found)
		SELECT skill, 'test', false FROM unnest($1::text[]) AS skill CROSS JOIN generate_series(1, 2)`, names); err != nil {
		t.Fatal(err)
	}
	archived, err := d.CreateTask("missing skill archive test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(archived.ID)
	coldName := prefix + "archived"
	data, err := json.Marshal(taskArchiveAggregate{MissingSkillStats: []SkillStat{
		{Skill: names[0], Calls: 3},
		{Skill: coldName, Calls: 4},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`UPDATE tasks SET archived_at=now() WHERE id=$1`, archived.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO task_archives (task_id, state, aggregate_stats) VALUES ($1, 'ready', $2)`, archived.ID, string(data)); err != nil {
		t.Fatal(err)
	}
	first, total, calls, err := d.MissingSkillStatsPage(20, 1)
	if err != nil || total-beforeTotal != 26 || calls-beforeCalls != 57 {
		t.Fatalf("missing skill totals: total=%d calls=%d before=%d/%d err=%v", total, calls, beforeTotal, beforeCalls, err)
	}
	legacy, err := d.MissingSkillStats(20)
	if err != nil || len(legacy) != len(first) {
		t.Fatalf("legacy page changed: count=%d err=%v", len(legacy), err)
	}
	for i := range first {
		if first[i].Skill != legacy[i].Skill {
			t.Fatalf("legacy order changed at %d", i)
		}
	}
	seen := make(map[string]int, len(names))
	for page := 1; page <= (total-1)/20+1; page++ {
		items, _, _, err := d.MissingSkillStatsPage(20, page)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range items {
			seen[item.Skill] += item.Calls
		}
	}
	for i, name := range names {
		want := 2
		if i == 0 {
			want += 3
		}
		if seen[name] != want {
			t.Fatalf("missing %s across pages: got %d calls, want %d", name, seen[name], want)
		}
	}
	if seen[coldName] != 4 {
		t.Fatalf("archived skill missing from pages: %d", seen[coldName])
	}
	items, afterTotal, afterCalls, err := d.MissingSkillStatsPage(20, int(^uint(0)>>1))
	if err != nil || len(items) != 0 || afterTotal != total || afterCalls != calls {
		t.Fatalf("out-of-range page: total=%d calls=%d items=%d err=%v", afterTotal, afterCalls, len(items), err)
	}
}
