package server

import (
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func calendarTestTime(s string) time.Time {
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return v
}

func TestRuntimeScheduleStartupBoundaries(t *testing.T) {
	old := calendarTestTime("2026-10-15T12:11:17+08:00")
	for _, tc := range []struct {
		name, now, boot string
		change          func(*db.TaskSchedule)
		active, missed  bool
	}{
		{"future weekday after restart", "2026-10-16T18:00:06+08:00", "2026-10-15T19:36:05+08:00", nil, true, false},
		{"window starts exactly with service", "2026-10-16T18:00:05+08:00", "2026-10-16T18:00:00+08:00", nil, true, false},
		{"already open before restart", "2026-10-16T18:10:05+08:00", "2026-10-16T18:10:00+08:00", nil, false, true},
		{"new plan inside current window", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) { s.CreatedAt = calendarTestTime("2026-10-16T18:11:00+08:00") }, true, false},
		{"explicit edit inside current window", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) { s.UpdatedAt = calendarTestTime("2026-10-16T18:11:00+08:00") }, true, false},
		{"recorded window survives restart", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) { s.LastWindowKey = "active:2026-10-16T18:00" }, true, false},
		{"same missed window remains blocked", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) {
			s.LastWindowKey = "missed:active:2026-10-16T18:00"
			s.UpdatedAt = calendarTestTime("2026-10-16T18:11:00+08:00")
		}, false, true},
		{"previous missed window does not block next", "2026-10-19T18:00:05+08:00", "2026-10-15T19:36:05+08:00", func(s *db.TaskSchedule) { s.LastWindowKey = "missed:active:2026-10-16T18:00" }, true, false},
		{"disabled plan does not acquire missed state", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) { s.Enabled = false }, false, false},
		{"manual run outside window", "2026-10-16T17:00:00+08:00", "2026-10-15T19:36:05+08:00", func(s *db.TaskSchedule) { s.LastWindowKey = "manual" }, true, false},
		{"once future boundary", "2026-10-16T18:00:05+08:00", "2026-10-15T19:36:05+08:00", func(s *db.TaskSchedule) { s.ScheduleType = "once"; s.RunDate = "2026-10-16" }, true, false},
		{"once missed boundary", "2026-10-16T18:12:00+08:00", "2026-10-16T18:10:00+08:00", func(s *db.TaskSchedule) { s.ScheduleType = "once"; s.RunDate = "2026-10-16" }, false, true},
		{"completed plan remains stopped", "2026-10-16T18:12:00+08:00", "2026-10-15T19:36:05+08:00", func(s *db.TaskSchedule) { s.Status = "completed" }, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &db.TaskSchedule{Enabled: true, ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{1, 2, 3, 4, 5}, StartTime: "18:00:00", EndTime: "00:00:00", CreatedAt: old, UpdatedAt: old}
			if tc.change != nil {
				tc.change(s)
			}
			w := evaluateRuntimeScheduleWindow(s, calendarTestTime(tc.now), calendarTestTime(tc.boot))
			if w.active != tc.active || strings.HasPrefix(w.key, "missed:") != tc.missed {
				t.Fatalf("active=%v key=%q, want active=%v missed=%v", w.active, w.key, tc.active, tc.missed)
			}
		})
	}
}

func TestRuntimeScheduleWeekendAndAdjacentWindows(t *testing.T) {
	old := calendarTestTime("2026-10-15T12:11:37+08:00")
	boot := calendarTestTime("2026-10-16T18:20:00+08:00")
	weekend := &db.TaskSchedule{Enabled: true, ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{6, 7}, StartTime: "00:00:00", EndTime: "00:00:00", CreatedAt: old, UpdatedAt: old}
	for _, at := range []string{"2026-10-17T00:00:00+08:00", "2026-10-18T00:00:00+08:00", "2026-10-18T23:59:59+08:00"} {
		w := evaluateRuntimeScheduleWindow(weekend, calendarTestTime(at), boot)
		if !w.active {
			t.Fatalf("weekend unexpectedly inactive at %s: %+v", at, w)
		}
	}
	weekday := &db.TaskSchedule{Enabled: true, ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{1, 2, 3, 4, 5}, StartTime: "00:00:00", EndTime: "09:00:00", CreatedAt: old, UpdatedAt: old}
	at := calendarTestTime("2026-10-19T00:00:00+08:00")
	if evaluateRuntimeScheduleWindow(weekend, at, boot).active || !evaluateRuntimeScheduleWindow(weekday, at, boot).active {
		t.Fatal("weekend-to-weekday boundary must keep the shared task union open")
	}
}

func TestRuntimeScheduleUsesBeijingWindowAcrossTimezones(t *testing.T) {
	s := &db.TaskSchedule{Enabled: true, ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{5}, StartTime: "18:00:00", EndTime: "00:00:00", CreatedAt: calendarTestTime("2026-10-15T12:00:00+08:00")}
	w := evaluateRuntimeScheduleWindow(s, calendarTestTime("2026-10-16T06:00:05-04:00"), calendarTestTime("2026-10-15T07:36:05-04:00"))
	if !w.active || w.key != "active:2026-10-16T18:00" {
		t.Fatalf("unexpected timezone result: %+v", w)
	}
}
