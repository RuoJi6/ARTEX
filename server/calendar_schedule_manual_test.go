package server

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/Autumn-27/mysterysecurityteam/db"
)

func manualScheduleTestServer(t *testing.T) (*Server, *Scheduler) {
	t.Helper()
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated ARTEX_PG_DSN")
	}
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	t.Cleanup(restoreConcurrencySetting(t, m))
	if err := m.SetConcurrency(false, defaultConcurrencyLimit); err != nil {
		t.Fatal(err)
	}
	s := newAdmissionTestServer(m, nil)
	sc := &Scheduler{s: s, pg: m.pg, startedAt: calendarTestTime("2026-10-19T08:00:00+08:00")}
	return s, sc
}

func manualScheduleTask(t *testing.T, s *Server) *Task {
	t.Helper()
	task, err := s.m.CreateTask("manual schedule test", "test admission", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	// Avoid bootstrapping real agent work; this is an existing paused task.
	task.updateLifecycle(func(state *taskLifecycleState) { state.FirstRunAt = 1 })
	t.Cleanup(func() { _, _ = s.m.DeleteTask(task.ID, DeleteTaskOptions{}) })
	return task
}

func manualSchedulePlan(t *testing.T, s *Server, tasks ...*Task) *db.TaskSchedule {
	t.Helper()
	ids := []int64{}
	for _, task := range tasks {
		id, _ := strconv.ParseInt(task.ID, 10, 64)
		ids = append(ids, id)
	}
	plan, err := s.m.pg.CreateTaskSchedule(db.TaskScheduleInput{Name: "18:00 calendar", Enabled: true, ScheduleType: "weekly", TimezoneMode: "beijing", Weekdays: []int{1, 2, 3, 4, 5}, StartTime: "18:00", EndTime: "23:00", TaskIDs: ids})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.m.pg.DeleteTaskSchedule(plan.ID) })
	return plan
}

// Admission uses the real clock. Verify it wrote a live override, then freeze
// just its deadline so calendar ticks can exercise exact boundaries on any date.
func freezeManualScheduleDeadline(t *testing.T, s *Server, task *Task) {
	t.Helper()
	var until time.Time
	if err := s.m.pg.QueryRow(`SELECT schedule_manual_until FROM tasks WHERE id=$1`, task.ID).Scan(&until); err != nil {
		t.Fatal(err)
	}
	if !until.After(time.Now()) {
		t.Fatalf("manual deadline already expired: %v", until)
	}
	if _, err := s.m.pg.Exec(`UPDATE tasks SET schedule_manual_until=$2 WHERE id=$1`, task.ID, calendarTestTime("2026-10-19T23:00:00+08:00")); err != nil {
		t.Fatal(err)
	}
}

func TestCalendarManualTaskResumeSurvivesTicks(t *testing.T) {
	for _, batch := range []bool{false, true} {
		t.Run(fmt.Sprintf("batch=%v", batch), func(t *testing.T) {
			s, sc := manualScheduleTestServer(t)
			task, other := manualScheduleTask(t, s), manualScheduleTask(t, s)
			manualSchedulePlan(t, s, task, other)
			sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:00+08:00"))
			if !task.lifecycleSnapshot().Paused || !other.lifecycleSnapshot().Paused {
				t.Fatal("outside window must initially pause both tasks")
			}
			body := `{"action":"resume"}`
			if batch {
				body = fmt.Sprintf(`{"action":"resume","task_ids":[%q]}`, task.ID)
			}
			req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(body))
			req.SetPathValue("id", task.ID)
			rec := httptest.NewRecorder()
			if batch {
				s.controlTasksBatch(rec, req)
			} else {
				s.control(rec, req)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("resume: %d %s", rec.Code, rec.Body.String())
			}
			freezeManualScheduleDeadline(t, s, task)
			for _, at := range []string{"2026-10-19T17:00:05+08:00", "2026-10-19T17:00:10+08:00"} {
				sc.fireTaskSchedulesAt(calendarTestTime(at))
				if task.lifecycleSnapshot().Paused {
					t.Fatal("task-page manual resume was paused again by calendar")
				}
				if !other.lifecycleSnapshot().Paused {
					t.Fatal("manual resume started another task in the same plan")
				}
			}
			// A fresh scheduler also reads the committed override.
			sc = &Scheduler{s: s, pg: s.m.pg, startedAt: calendarTestTime("2026-10-19T17:01:00+08:00")}
			sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:01:05+08:00"))
			if task.lifecycleSnapshot().Paused {
				t.Fatal("scheduler restart lost manual resume")
			}
			sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T18:00:05+08:00"))
			if task.lifecycleSnapshot().Paused || other.lifecycleSnapshot().Paused {
				t.Fatal("regular window did not open")
			}
			sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T23:00:00+08:00"))
			if !task.lifecycleSnapshot().Paused || !other.lifecycleSnapshot().Paused {
				t.Fatal("manual override bypassed regular end boundary")
			}
		})
	}
}

func TestCalendarManualResumePreservesFIFO(t *testing.T) {
	s, sc := manualScheduleTestServer(t)
	holder, task := manualScheduleTask(t, s), manualScheduleTask(t, s)
	manualSchedulePlan(t, s, task)
	if err := s.m.SetConcurrency(true, 1); err != nil {
		t.Fatal(err)
	}
	s.engine.started.Store(holder.ID, true)
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:00+08:00"))
	result, err := s.applyTaskControl(task, "resume")
	if err != nil || !result.Queued {
		t.Fatalf("resume should queue: %+v %v", result, err)
	}
	freezeManualScheduleDeadline(t, s, task)
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:05+08:00"))
	state := task.lifecycleSnapshot()
	if state.Paused || !state.Queued {
		t.Fatalf("calendar removed manually resumed task from FIFO: %+v", state)
	}
	// Promotion uses ordinary admission, which must preserve the override.
	if err := s.m.ApplyTaskPause(holder.ID); err != nil {
		t.Fatal(err)
	}
	s.reconcileConcurrency()
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:10+08:00"))
	state = task.lifecycleSnapshot()
	if state.Paused || state.Queued {
		t.Fatalf("promotion lost manual resume: %+v", state)
	}
	if _, err := s.applyTaskControl(task, "pause"); err != nil {
		t.Fatal(err)
	}
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T18:00:05+08:00"))
	if !task.lifecycleSnapshot().Paused {
		t.Fatal("calendar lifted explicit user pause")
	}
}

func TestCalendarManualResumeFailureDoesNotOverride(t *testing.T) {
	s, sc := manualScheduleTestServer(t)
	task := manualScheduleTask(t, s)
	manualSchedulePlan(t, s, task)
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:00+08:00"))
	if _, err := s.m.pg.Exec(`UPDATE tasks SET status='done' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.applyTaskControl(task, "resume"); err == nil {
		t.Fatal("stale resume must fail")
	}
	var manual bool
	if err := s.m.pg.QueryRow(`SELECT schedule_manual_until IS NOT NULL FROM tasks WHERE id=$1`, task.ID).Scan(&manual); err != nil {
		t.Fatal(err)
	}
	if manual {
		t.Fatal("failed resume committed a schedule override")
	}
}

func TestCalendarScheduleRunNowStillWorks(t *testing.T) {
	s, sc := manualScheduleTestServer(t)
	task := manualScheduleTask(t, s)
	plan := manualSchedulePlan(t, s, task)
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:00+08:00"))
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.SetPathValue("id", strconv.FormatInt(plan.ID, 10))
	rec := httptest.NewRecorder()
	s.runScheduleNow(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("run now: %d %s", rec.Code, rec.Body.String())
	}
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:05+08:00"))
	if task.lifecycleSnapshot().Paused {
		t.Fatal("schedule-page run now regressed")
	}
}

func TestCalendarManualDeadlineAcrossRestart(t *testing.T) {
	s, sc := manualScheduleTestServer(t)
	task := manualScheduleTask(t, s)
	manualSchedulePlan(t, s, task)
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T17:00:00+08:00"))
	if _, err := s.applyTaskControl(task, "resume"); err != nil {
		t.Fatal(err)
	}
	freezeManualScheduleDeadline(t, s, task)
	// The process was down across the entire window; no active tick consumed it.
	sc = &Scheduler{s: s, pg: s.m.pg, startedAt: calendarTestTime("2026-10-19T23:05:00+08:00")}
	sc.fireTaskSchedulesAt(calendarTestTime("2026-10-19T23:05:05+08:00"))
	if !task.lifecycleSnapshot().Paused {
		t.Fatal("restart across window retained expired manual override")
	}
}

func TestCalendarManualDeadlineUsesNextEnd(t *testing.T) {
	s, _ := manualScheduleTestServer(t)
	task := manualScheduleTask(t, s)
	plan := manualSchedulePlan(t, s, task)
	for _, tc := range []struct{ at, want string }{
		{"2026-10-19T17:00:00+08:00", "2026-10-19T23:00:00+08:00"},
		{"2026-10-19T19:00:00+08:00", "2026-10-19T23:00:00+08:00"},
		{"2026-10-19T23:01:00+08:00", "2026-10-20T23:00:00+08:00"},
	} {
		until, err := s.taskManualScheduleEnd(task.ID, calendarTestTime(tc.at))
		if err != nil || until == nil || !until.Equal(calendarTestTime(tc.want)) {
			t.Fatalf("at %s: deadline=%v err=%v", tc.at, until, err)
		}
	}
	if err := s.m.pg.SetTaskScheduleEnabled(plan.ID, false); err != nil {
		t.Fatal(err)
	}
	until, err := s.taskManualScheduleEnd(task.ID, calendarTestTime("2026-10-19T17:00:00+08:00"))
	if err != nil || until == nil || until.Year() != 9999 {
		t.Fatalf("disabled calendar deadline=%v err=%v", until, err)
	}
	plain := manualScheduleTask(t, s)
	until, err = s.taskManualScheduleEnd(plain.ID, calendarTestTime("2026-10-19T17:00:00+08:00"))
	if err != nil || until != nil {
		t.Fatalf("unscheduled task deadline=%v err=%v", until, err)
	}
}
