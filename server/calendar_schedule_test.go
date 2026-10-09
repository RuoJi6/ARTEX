package server

import (
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestEvaluateScheduleWindowWeeklyCrossMidnight(t *testing.T) {
	s := &db.TaskSchedule{ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{1, 2, 3, 4, 5}, StartTime: "18:00:00", EndTime: "09:00:00"}
	// Tuesday 08:00 is still inside Monday's overnight window.
	w := evaluateScheduleWindow(s, time.Date(2026, 10, 6, 8, 0, 0, 0, time.FixedZone("CST", 8*3600)))
	if !w.active { t.Fatal("expected overnight window to be active") }
	// Saturday 10:00 is outside the work-week window.
	w = evaluateScheduleWindow(s, time.Date(2026, 10, 10, 10, 0, 0, 0, time.FixedZone("CST", 8*3600)))
	if w.active { t.Fatal("expected weekend to be outside") }
}

func TestEvaluateScheduleWindowOnce(t *testing.T) {
	s := &db.TaskSchedule{ScheduleType: "once", TimezoneMode: "beijing", RunDate: "2026-10-09", StartTime: "18:00:00", EndTime: "23:00:00"}
	loc := time.FixedZone("CST", 8*3600)
	if w := evaluateScheduleWindow(s, time.Date(2026, 10, 9, 17, 59, 0, 0, loc)); w.active { t.Fatal("one-shot fired early") }
	if w := evaluateScheduleWindow(s, time.Date(2026, 10, 9, 19, 0, 0, 0, loc)); !w.active { t.Fatal("one-shot should be active") }
	if w := evaluateScheduleWindow(s, time.Date(2026, 10, 10, 0, 0, 0, 0, loc)); !w.complete { t.Fatal("one-shot should be complete") }
}

func TestEvaluateScheduleWindowOpenEnded(t *testing.T) {
	s := &db.TaskSchedule{ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{6}, StartTime: "09:00:00"}
	loc := time.FixedZone("CST", 8*3600)
	if w := evaluateScheduleWindow(s, time.Date(2026, 10, 10, 10, 0, 0, 0, loc)); !w.active { t.Fatal("open-ended weekly schedule should stay active") }
}
