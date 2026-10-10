package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

type scheduleRequest struct {
	Name             string  `json:"name"`
	Enabled          *bool   `json:"enabled,omitempty"`
	TimezoneMode     string  `json:"timezone_mode"`
	ScheduleType     string  `json:"schedule_type"`
	RunDate          string  `json:"run_date"`
	EndDate          string  `json:"end_date"`
	Weekdays         []int   `json:"weekdays"`
	StartTime        string  `json:"start_time"`
	EndTime          string  `json:"end_time"`
	StartImmediately bool    `json:"start_immediately"`
	TaskIDs          []int64 `json:"task_ids"`
}

func (s *Server) scheduleInput(req scheduleRequest, existing *db.TaskSchedule) db.TaskScheduleInput {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	} else if existing != nil {
		enabled = existing.Enabled
	}
	return db.TaskScheduleInput{Name: req.Name, Enabled: enabled, TimezoneMode: req.TimezoneMode, ScheduleType: req.ScheduleType,
		RunDate: req.RunDate, EndDate: req.EndDate, Weekdays: req.Weekdays, StartTime: req.StartTime, EndTime: req.EndTime,
		StartImmediately: req.StartImmediately, TaskIDs: req.TaskIDs}
}

func parseScheduleID(r *http.Request) (int64, error) {
	return strconv.ParseInt(r.PathValue("id"), 10, 64)
}

func (s *Server) scheduleDTO(item *db.TaskSchedule) map[string]any {
	raw, _ := json.Marshal(item)
	var dto map[string]any
	_ = json.Unmarshal(raw, &dto)
	window := evaluateScheduleWindow(item, time.Now())
	if stats, err := s.m.pg.ScheduleRunStats(item.ID); err == nil {
		dto["run_count"] = stats.RunCount
		if stats.LastRunAt != nil {
			dto["last_run_at"] = stats.LastRunAt
		}
	}
	dto["timezone"] = scheduleLocation(item.TimezoneMode).String()
	dto["server_time"] = time.Now()
	if item.Enabled && item.Status != "completed" {
		dto["next_start"] = window.nextStart
		dto["next_end"] = window.nextEnd
	}
	return dto
}
func (s *Server) listSchedules(w http.ResponseWriter, r *http.Request) {
	items, err := s.m.pg.ListTaskSchedules()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	dtos := []map[string]any{}
	for _, item := range items {
		dtos = append(dtos, s.scheduleDTO(item))
	}
	writeJSON(w, 200, map[string]any{"schedules": dtos})
}

func (s *Server) getSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseScheduleID(r)
	if err != nil {
		writeErr(w, 400, "计划编号无效")
		return
	}
	item, err := s.m.pg.GetTaskSchedule(id)
	if err != nil {
		writeErr(w, 404, "计划不存在")
		return
	}
	history, err := s.m.pg.ListScheduleHistory(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	dto := s.scheduleDTO(item)
	dto["history"] = history
	writeJSON(w, 200, dto)
}

func decodeSchedule(r *http.Request) (scheduleRequest, error) {
	var req scheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return req, fmt.Errorf("bad json: %w", err)
	}
	if req.Enabled == nil {
		v := true
		req.Enabled = &v
	}
	return req, nil
}

func (s *Server) createSchedule(w http.ResponseWriter, r *http.Request) {
	req, err := decodeSchedule(r)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	item, err := s.m.pg.CreateTaskSchedule(s.scheduleInput(req, nil))
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.StartImmediately && item.Enabled {
		s.runScheduleTasks(item)
	}
	writeJSON(w, 201, item)
}

func (s *Server) updateSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseScheduleID(r)
	if err != nil {
		writeErr(w, 400, "计划编号无效")
		return
	}
	old, err := s.m.pg.GetTaskSchedule(id)
	if err != nil {
		writeErr(w, 404, "计划不存在")
		return
	}
	req, err := decodeSchedule(r)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	item, err := s.m.pg.UpdateTaskSchedule(id, s.scheduleInput(req, old))
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, item)
}

func (s *Server) deleteSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := parseScheduleID(r)
	if err != nil {
		writeErr(w, 400, "计划编号无效")
		return
	}
	if err := s.m.pg.DeleteTaskSchedule(id); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) setScheduleEnabled(w http.ResponseWriter, r *http.Request, enabled bool) {
	id, err := parseScheduleID(r)
	if err != nil {
		writeErr(w, 400, "计划编号无效")
		return
	}
	if err := s.m.pg.SetTaskScheduleEnabled(id, enabled); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if enabled {
		if item, err := s.m.pg.GetTaskSchedule(id); err == nil {
			if item.StartImmediately {
				s.runScheduleTasks(item)
			}
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true, "enabled": enabled})
}

func (s *Server) pauseSchedule(w http.ResponseWriter, r *http.Request) {
	s.setScheduleEnabled(w, r, false)
}
func (s *Server) resumeSchedule(w http.ResponseWriter, r *http.Request) {
	s.setScheduleEnabled(w, r, true)
}

func (s *Server) runScheduleNow(w http.ResponseWriter, r *http.Request) {
	id, err := parseScheduleID(r)
	if err != nil {
		writeErr(w, 400, "计划编号无效")
		return
	}
	item, err := s.m.pg.GetTaskSchedule(id)
	if err != nil {
		writeErr(w, 404, "计划不存在")
		return
	}
	if err := s.m.pg.MarkTaskScheduleManual(id); err != nil {
		writeErr(w, 500, "无法启动计划任务")
		return
	}
	_ = s.m.pg.RecordScheduleHistory(id, 0, "running", true, "手动立即运行")
	started, errors := s.runScheduleTasksNow(item)
	writeJSON(w, 200, map[string]any{"ok": true, "started": started, "errors": errors})
}

func (s *Server) runScheduleTasks(item *db.TaskSchedule) (int, []string) {
	return s.startScheduleTasks(item, false)
}

func (s *Server) runScheduleTasksNow(item *db.TaskSchedule) (int, []string) {
	return s.startScheduleTasks(item, true)
}

func (s *Server) startScheduleTasks(item *db.TaskSchedule, forceManualPause bool) (int, []string) {
	started := 0
	errors := []string{}
	for _, taskID := range item.TaskIDs {
		t, ok := s.m.Task(strconv.FormatInt(taskID, 10))
		if !ok {
			errors = append(errors, fmt.Sprintf("任务 #%d 未找到", taskID))
			continue
		}
		state := t.lifecycleSnapshot()
		if db.IsTerminal(state.Status) {
			errors = append(errors, fmt.Sprintf("任务 #%d 已结束，无法立即运行", taskID))
			continue
		}
		if !state.Paused {
			started++
			continue
		}
		managed, err := s.m.pg.TaskPausedBySchedule(taskID)
		if err != nil {
			errors = append(errors, fmt.Sprintf("任务 #%d 状态读取失败", taskID))
			_ = s.m.pg.RecordScheduleHistory(item.ID, taskID, "resume", false, "状态读取失败")
			continue
		}
		if !managed && !forceManualPause {
			errors = append(errors, fmt.Sprintf("任务 #%d 由人工暂停，计划不能强制恢复", taskID))
			_ = s.m.pg.RecordScheduleHistory(item.ID, taskID, "resume", false, "人工暂停优先")
			continue
		}
		_, err = s.applyTaskControlWithCause(t, "resume", agent.AbortPausedByOrchestrator)
		if err != nil {
			errors = append(errors, fmt.Sprintf("任务 #%d：%s", taskID, err.Error()))
			_ = s.m.pg.RecordScheduleHistory(item.ID, taskID, "resume", false, err.Error())
			continue
		}
		started++
		_ = s.m.pg.SetSchedulePaused(item.ID, taskID, false)
		message := "立即运行"
		if !managed && forceManualPause {
			message = "立即运行（显式恢复人工暂停）"
		}
		_ = s.m.pg.RecordScheduleHistory(item.ID, taskID, "resume", true, message)
	}
	return started, errors
}

// scheduleRequestFromTask is used by the task creation handler without making
// the public task API depend on database internals.
func scheduleRequestFromTask(raw json.RawMessage) (*scheduleRequest, error) {
	if len(strings.TrimSpace(string(raw))) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var req scheduleRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil, err
	}
	return &req, nil
}
