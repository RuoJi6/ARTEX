package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/mysterysecurityteam/db"
)

func TestRemarksRoundTripPreservesExecutionState(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("remark test description", "original goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _ = m.pg.DeleteTask(taskID) }()
	scheduleInput := db.TaskScheduleInput{Name: "remark schedule", Enabled: false, ScheduleType: "once", RunDate: "2099-01-01", StartTime: "09:00", TaskIDs: []int64{taskID}}
	schedule, err := m.pg.CreateTaskSchedule(scheduleInput)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = m.pg.DeleteTaskSchedule(schedule.ID) }()
	if _, err := m.pg.Exec(`UPDATE task_schedules SET status='completed',last_window_key='preserve-window',last_error='preserve-error',last_transition_at=now() WHERE id=$1`, schedule.ID); err != nil {
		t.Fatal(err)
	}
	original, err := m.pg.GetTaskSchedule(schedule.ID)
	if err != nil {
		t.Fatal(err)
	}
	originalLifecycle := task.lifecycleSnapshot()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	handler := s.Handler()
	request := func(path, body string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, path, strings.NewReader(body))
		if authenticated {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	taskPath := "/api/tasks/" + task.ID
	schedulePath := fmt.Sprintf("/api/schedules/%d/remark", schedule.ID)
	for _, path := range []string{taskPath, schedulePath} {
		t.Run(path, func(t *testing.T) {
			for _, remark := range []string{"  中文备注 📝\n第二行 <script>alert(1)</script>  ", strings.Repeat("📝", maxRemarkRunes), ""} {
				body, _ := json.Marshal(map[string]string{"remark": remark})
				rec := request(path, string(body), true)
				if rec.Code != http.StatusOK {
					t.Fatalf("save: %d %s", rec.Code, rec.Body.String())
				}
				var response struct {
					Remark string `json:"remark"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				expected := strings.TrimSpace(remark)
				if response.Remark != expected {
					t.Fatal("response remark mismatch")
				}
				if path == taskPath {
					persisted, err := m.pg.GetTask(taskID)
					if err != nil || persisted.Remark != expected {
						t.Fatalf("persisted task: %+v %v", persisted, err)
					}
					listed, err := m.pg.ListTasks()
					if err != nil {
						t.Fatal(err)
					}
					found := false
					for _, item := range listed {
						if item.ID == taskID {
							found = item.Remark == expected
						}
					}
					if !found {
						t.Fatal("task list lost remark")
					}
					dto := taskDTO(task, s.resolvedTaskStatus(task))
					if dto.Remark != expected || dto.Goal != "original goal" || dto.Description != "remark test description" {
						t.Fatal("task DTO lost remark or changed goal")
					}
					state := task.lifecycleSnapshot()
					if state.Status != originalLifecycle.Status || state.Paused != originalLifecycle.Paused || state.Queued != originalLifecycle.Queued {
						t.Fatal("remark changed task lifecycle")
					}
				} else {
					persisted, err := m.pg.GetTaskSchedule(schedule.ID)
					if err != nil || persisted.Remark != expected {
						t.Fatalf("persisted schedule: %+v %v", persisted, err)
					}
					if persisted.Status != original.Status || persisted.Enabled != original.Enabled || persisted.LastWindowKey != original.LastWindowKey || persisted.LastError != original.LastError || !persisted.LastTransitionAt.Equal(*original.LastTransitionAt) || len(persisted.TaskIDs) != 1 || persisted.TaskIDs[0] != taskID {
						t.Fatal("remark changed calendar state or bindings")
					}
					listed, err := m.pg.ListTaskSchedules()
					if err != nil {
						t.Fatal(err)
					}
					found := false
					for _, item := range listed {
						if item.ID == schedule.ID {
							found = item.Remark == expected
						}
					}
					if !found {
						t.Fatal("schedule list lost remark")
					}
				}
			}
			cases := []struct {
				body          string
				authenticated bool
				status        int
			}{
				{`{}`, true, 400}, {`{"remark":null}`, true, 400}, {`{"remark":123}`, true, 400}, {`{`, true, 400},
				{`{"remark":"` + strings.Repeat("文", maxRemarkRunes+1) + `"}`, true, 400},
				{`{"remark":"` + strings.Repeat("x", maxTaskMetadataRequestSize) + `"}`, true, 413},
				{`{"remark":"denied"}`, false, 401},
			}
			for _, tc := range cases {
				rec := request(path, tc.body, tc.authenticated)
				if rec.Code != tc.status {
					t.Fatalf("validation status=%d want=%d body=%s", rec.Code, tc.status, rec.Body.String())
				}
			}
		})
	}
	// A normal rename/pin patch must preserve a previously saved remark.
	note := "保留的任务备注"
	if _, err := m.UpdateTaskMetadata(task.ID, db.TaskPatch{Remark: &note}); err != nil {
		t.Fatal(err)
	}
	rec := request(taskPath, `{"name":"新名称","pinned":true}`, true)
	if rec.Code != 200 || !bytes.Contains(rec.Body.Bytes(), []byte(note)) {
		t.Fatalf("rename lost remark: %s", rec.Body.String())
	}
	note = "保留的计划备注"
	if _, err := m.pg.UpdateTaskScheduleRemark(schedule.ID, note); err != nil {
		t.Fatal(err)
	}
	metadataPath := fmt.Sprintf("/api/schedules/%d/metadata", schedule.ID)
	rec = request(metadataPath, `{"name":"  行内改名  "}`, true)
	if rec.Code != 200 {
		t.Fatalf("schedule rename: %d %s", rec.Code, rec.Body.String())
	}
	renamed, err := m.pg.GetTaskSchedule(schedule.ID)
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Name != "行内改名" || renamed.Remark != note || renamed.Status != original.Status || renamed.Enabled != original.Enabled || renamed.LastWindowKey != original.LastWindowKey || renamed.LastError != original.LastError || !renamed.LastTransitionAt.Equal(*original.LastTransitionAt) || len(renamed.TaskIDs) != 1 || renamed.TaskIDs[0] != taskID {
		t.Fatalf("rename changed calendar state or metadata: %+v", renamed)
	}
	for _, body := range []string{`{}`, `{"name":null}`, `{"name":" "}`, `{"name":123}`, `{"name":"` + strings.Repeat("文", maxTaskNameRunes+1) + `"}`, `{"name":"must not apply","remark":"` + strings.Repeat("文", maxRemarkRunes+1) + `"}`} {
		if rec := request(metadataPath, body, true); rec.Code != 400 {
			t.Fatalf("invalid rename: %d %s", rec.Code, rec.Body.String())
		}
	}
	unchanged, err := m.pg.GetTaskSchedule(schedule.ID)
	if err != nil || unchanged.Name != "行内改名" || unchanged.Remark != note {
		t.Fatalf("invalid patch partially changed metadata: %+v %v", unchanged, err)
	}
	if rec := request(metadataPath, `{"name":"denied"}`, false); rec.Code != 401 {
		t.Fatalf("rename auth: %d", rec.Code)
	}
	scheduleInput.Name = "新计划名称"
	updated, err := m.pg.UpdateTaskSchedule(schedule.ID, scheduleInput)
	if err != nil || updated.Remark != note {
		t.Fatalf("schedule edit lost remark: %+v %v", updated, err)
	}
	for _, path := range []string{"/api/tasks/9223372036854775807", "/api/schedules/9223372036854775807/remark"} {
		if rec := request(path, `{"remark":"missing"}`, true); rec.Code != 404 {
			t.Fatalf("missing record: %d %s", rec.Code, rec.Body.String())
		}
	}
}
