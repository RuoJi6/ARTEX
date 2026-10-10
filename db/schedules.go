package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// TaskSchedule is a persisted calendar window controlling one or more tasks.
// Weekdays is kept as JSON text so the API can expose a stable []int shape.
type TaskSchedule struct {
	ID               int64      `json:"id"`
	Name             string     `json:"name"`
	Enabled          bool       `json:"enabled"`
	TimezoneMode     string     `json:"timezone_mode"`
	ScheduleType     string     `json:"schedule_type"`
	RunDate          string     `json:"run_date,omitempty"`
	EndDate          string     `json:"end_date,omitempty"`
	Weekdays         []int      `json:"weekdays,omitempty"`
	StartTime        string     `json:"start_time"`
	EndTime          string     `json:"end_time,omitempty"`
	StartImmediately bool       `json:"start_immediately"`
	Status           string     `json:"status"`
	LastWindowKey    string     `json:"last_window_key,omitempty"`
	LastTransitionAt *time.Time `json:"last_transition_at,omitempty"`
	LastError        string     `json:"last_error,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	TaskIDs          []int64    `json:"task_ids"`
}

type TaskScheduleInput struct {
	Name             string
	Enabled          bool
	TimezoneMode     string
	ScheduleType     string
	RunDate          string
	EndDate          string
	Weekdays         []int
	StartTime        string
	EndTime          string
	StartImmediately bool
	TaskIDs          []int64
}

const scheduleCols = `id,name,enabled,timezone_mode,schedule_type,
COALESCE(to_char(run_date,'YYYY-MM-DD'),''),weekdays,to_char(start_time,'HH24:MI:SS'),
COALESCE(to_char(end_date,'YYYY-MM-DD'),''),
COALESCE(to_char(end_time,'HH24:MI:SS'),''),start_immediately,status,last_window_key,
last_transition_at,last_error,created_at,updated_at`

func marshalWeekdays(days []int) string {
	if len(days) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(days)
	return string(b)
}

func scanSchedule(sc interface{ Scan(...any) error }) (*TaskSchedule, error) {
	var s TaskSchedule
	var rawDays string
	if err := sc.Scan(&s.ID, &s.Name, &s.Enabled, &s.TimezoneMode, &s.ScheduleType,
		&s.RunDate, &rawDays, &s.StartTime, &s.EndDate, &s.EndTime, &s.StartImmediately,
		&s.Status, &s.LastWindowKey, &s.LastTransitionAt, &s.LastError,
		&s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(rawDays), &s.Weekdays)
	if s.Weekdays == nil {
		s.Weekdays = []int{}
	}
	return &s, nil
}

func normalizeScheduleInput(in TaskScheduleInput) (TaskScheduleInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return in, fmt.Errorf("计划名称不能为空")
	}
	if in.TimezoneMode == "" {
		in.TimezoneMode = "beijing"
	}
	if in.TimezoneMode != "beijing" && in.TimezoneMode != "system" {
		return in, fmt.Errorf("时区必须选择北京时间或系统当前时区")
	}
	if in.ScheduleType != "once" && in.ScheduleType != "weekly" {
		return in, fmt.Errorf("规则必须选择一次性或按周")
	}
	if _, err := time.Parse("15:04", in.StartTime); err != nil {
		return in, fmt.Errorf("开始时间格式不正确，请使用 HH:MM")
	}
	if in.EndTime != "" && in.EndTime != "24:00" {
		if _, err := time.Parse("15:04", in.EndTime); err != nil {
			return in, fmt.Errorf("结束时间格式不正确，请使用 HH:MM")
		}
	}
	if in.ScheduleType == "once" {
		if _, err := time.Parse("2006-01-02", in.RunDate); err != nil {
			return in, fmt.Errorf("开始日期格式不正确")
		}
		if in.EndDate != "" {
			startDate, _ := time.Parse("2006-01-02", in.RunDate)
			endDate, err := time.Parse("2006-01-02", in.EndDate)
			if err != nil {
				return in, fmt.Errorf("截止日期格式不正确")
			}
			if endDate.Before(startDate) {
				return in, fmt.Errorf("截止日期不能早于开始日期")
			}
			if endDate.Equal(startDate) && in.EndTime != "" && in.EndTime != "24:00" {
				if in.EndTime <= in.StartTime {
					return in, fmt.Errorf("同一天的结束时间必须晚于开始时间")
				}
			}
		}
		in.Weekdays = nil
	} else {
		seen := map[int]bool{}
		for _, day := range in.Weekdays {
			if day < 1 || day > 7 || seen[day] {
				return in, fmt.Errorf("星期选择必须为周一至周日且不能重复")
			}
			seen[day] = true
		}
		if len(in.Weekdays) == 0 {
			return in, fmt.Errorf("按周计划至少选择一天")
		}
		sort.Ints(in.Weekdays)
		in.RunDate = ""
		in.EndDate = ""
	}
	seenTasks := map[int64]bool{}
	for _, id := range in.TaskIDs {
		if id <= 0 || seenTasks[id] {
			return in, fmt.Errorf("绑定任务编号无效或重复")
		}
		seenTasks[id] = true
	}
	if len(in.TaskIDs) > 100 {
		return in, fmt.Errorf("最多选择100个任务")
	}
	return in, nil
}

func (d *DB) CreateTaskSchedule(in TaskScheduleInput) (*TaskSchedule, error) {
	var err error
	if in, err = normalizeScheduleInput(in); err != nil {
		return nil, err
	}
	tx, err := d.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	return createTaskScheduleTxCommit(tx, in)
}

func createTaskScheduleTxCommit(tx *sql.Tx, in TaskScheduleInput) (*TaskSchedule, error) {
	s, err := insertTaskSchedule(tx, in)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return s, nil
}

func insertTaskSchedule(tx *sql.Tx, in TaskScheduleInput) (*TaskSchedule, error) {
	row := tx.QueryRow(`INSERT INTO task_schedules(name,enabled,timezone_mode,schedule_type,run_date,end_date,weekdays,start_time,end_time,start_immediately)
VALUES ($1,$2,$3,$4,NULLIF($5,'')::date,NULLIF($6,'')::date,$7,$8::time,NULLIF($9,'')::time,$10) RETURNING `+scheduleCols,
		in.Name, in.Enabled, in.TimezoneMode, in.ScheduleType, in.RunDate, in.EndDate, marshalWeekdays(in.Weekdays), in.StartTime, in.EndTime, in.StartImmediately)
	s, err := scanSchedule(row)
	if err != nil {
		return nil, err
	}
	for _, taskID := range in.TaskIDs {
		if taskID <= 0 {
			return nil, fmt.Errorf("task_id 无效")
		}
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM tasks WHERE id=$1 AND deleted_at IS NULL)`, taskID).Scan(&exists); err != nil || !exists {
			if err != nil {
				return nil, err
			}
			return nil, fmt.Errorf("任务 #%d 不存在", taskID)
		}
		if _, err := tx.Exec(`INSERT INTO task_schedule_tasks(schedule_id,task_id) VALUES($1,$2)`, s.ID, taskID); err != nil {
			return nil, err
		}
	}
	s.TaskIDs = append([]int64(nil), in.TaskIDs...)
	return s, nil
}

func (d *DB) UpdateTaskSchedule(id int64, in TaskScheduleInput) (*TaskSchedule, error) {
	var err error
	if in, err = normalizeScheduleInput(in); err != nil {
		return nil, err
	}
	tx, err := d.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	row := tx.QueryRow(`UPDATE task_schedules SET name=$2,enabled=$3,timezone_mode=$4,schedule_type=$5,run_date=NULLIF($6,'')::date,end_date=NULLIF($7,'')::date,weekdays=$8,start_time=$9::time,end_time=NULLIF($10,'')::time,start_immediately=$11,status=CASE WHEN $3 THEN CASE WHEN status='completed' THEN 'waiting' ELSE status END ELSE 'paused' END,last_error='',last_window_key='' WHERE id=$1 RETURNING `+scheduleCols,
		id, in.Name, in.Enabled, in.TimezoneMode, in.ScheduleType, in.RunDate, in.EndDate, marshalWeekdays(in.Weekdays), in.StartTime, in.EndTime, in.StartImmediately)
	s, err := scanSchedule(row)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM task_schedule_tasks WHERE schedule_id=$1`, id); err != nil {
		return nil, err
	}
	for _, taskID := range in.TaskIDs {
		if _, err := tx.Exec(`INSERT INTO task_schedule_tasks(schedule_id,task_id) VALUES($1,$2)`, id, taskID); err != nil {
			return nil, err
		}
	}
	s.TaskIDs = append([]int64(nil), in.TaskIDs...)
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s, nil
}

func (d *DB) DeleteTaskSchedule(id int64) error {
	_, err := d.Exec(`DELETE FROM task_schedules WHERE id=$1`, id)
	return err
}

func (d *DB) SetTaskScheduleEnabled(id int64, enabled bool) error {
	_, err := d.Exec(`UPDATE task_schedules SET enabled=$2,status=CASE WHEN $2 THEN 'waiting' ELSE 'paused' END,last_error='' WHERE id=$1`, id, enabled)
	return err
}

func (d *DB) GetTaskSchedule(id int64) (*TaskSchedule, error) {
	s, err := scanSchedule(d.QueryRow(`SELECT `+scheduleCols+` FROM task_schedules WHERE id=$1`, id))
	if err != nil {
		return nil, err
	}
	s.TaskIDs, err = d.scheduleTaskIDs(id)
	return s, err
}

func (d *DB) ListTaskSchedules() ([]*TaskSchedule, error) {
	rows, err := d.Query(`SELECT ` + scheduleCols + ` FROM task_schedules ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*TaskSchedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		s.TaskIDs, err = d.scheduleTaskIDs(s.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) ListEnabledTaskSchedules() ([]*TaskSchedule, error) {
	rows, err := d.Query(`SELECT ` + scheduleCols + ` FROM task_schedules WHERE enabled ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*TaskSchedule{}
	for rows.Next() {
		s, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		s.TaskIDs, err = d.scheduleTaskIDs(s.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) scheduleTaskIDs(id int64) ([]int64, error) {
	rows, err := d.Query(`SELECT task_id FROM task_schedule_tasks WHERE schedule_id=$1 ORDER BY task_id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (d *DB) TouchTaskSchedule(id int64, status, windowKey, lastError string) error {
	_, err := d.Exec(`UPDATE task_schedules SET status=$2,last_window_key=$3,last_transition_at=now(),last_error=$4 WHERE id=$1`, id, status, windowKey, lastError)
	return err
}

func (d *DB) MarkTaskScheduleManual(id int64) error {
	_, err := d.Exec(`UPDATE task_schedules SET status='running',last_window_key='manual',last_transition_at=now(),last_error='' WHERE id=$1`, id)
	return err
}

// ScheduleRunStats summarizes completed schedule window entries for list views.
// The scheduler records one "running" history entry whenever a new window opens.
type ScheduleRunStats struct {
	RunCount  int        `json:"run_count"`
	LastRunAt *time.Time `json:"last_run_at,omitempty"`
}

func (d *DB) ScheduleRunStats(id int64) (ScheduleRunStats, error) {
	var stats ScheduleRunStats
	var lastRunAt sql.NullTime
	err := d.QueryRow(`
		SELECT COUNT(*) FILTER (WHERE task_id IS NULL AND action='running'),
		       MAX(created_at) FILTER (WHERE task_id IS NULL AND action='running')
		FROM task_schedule_history WHERE schedule_id=$1`, id).Scan(&stats.RunCount, &lastRunAt)
	if lastRunAt.Valid {
		stats.LastRunAt = &lastRunAt.Time
	}
	return stats, err
}

// TaskScheduleTasks returns all schedule IDs that reference a task.
func (d *DB) TaskScheduleTasks(taskID int64) ([]int64, error) {
	rows, err := d.Query(`SELECT schedule_id FROM task_schedule_tasks WHERE task_id=$1 ORDER BY schedule_id`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (d *DB) SetSchedulePaused(scheduleID, taskID int64, paused bool) error {
	_, err := d.Exec(`UPDATE task_schedule_tasks SET paused_by_schedule=$3 WHERE schedule_id=$1 AND task_id=$2`, scheduleID, taskID, paused)
	return err
}

// TaskPausedBySchedule reads the authoritative task-level pause origin. The
// scheduler writes this flag when it pauses a task, so callers must use it to
// distinguish a scheduled pause from a manual pause.
func (d *DB) TaskPausedBySchedule(taskID int64) (bool, error) {
	var paused bool
	err := d.QueryRow(`SELECT schedule_paused FROM tasks WHERE id=$1 AND deleted_at IS NULL`, taskID).Scan(&paused)
	return paused, err
}

// ValidateTaskScheduleInput shares validation between task creation and schedules.
func ValidateTaskScheduleInput(in TaskScheduleInput) error {
	_, err := normalizeScheduleInput(in)
	return err
}

type ScheduleHistory struct {
	ID        int64     `json:"id"`
	TaskID    *int64    `json:"task_id,omitempty"`
	Action    string    `json:"action"`
	Success   bool      `json:"success"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

func (d *DB) RecordScheduleHistory(id, taskID int64, action string, success bool, message string) error {
	_, err := d.Exec(`INSERT INTO task_schedule_history(schedule_id,task_id,action,success,message) VALUES($1,NULLIF($2,0),$3,$4,$5)`, id, taskID, action, success, message)
	return err
}
func (d *DB) ListScheduleHistory(id int64) ([]ScheduleHistory, error) {
	rows, err := d.Query(`SELECT id,task_id,action,success,message,created_at FROM task_schedule_history WHERE schedule_id=$1 ORDER BY id DESC LIMIT 100`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ScheduleHistory{}
	for rows.Next() {
		var item ScheduleHistory
		if err := rows.Scan(&item.ID, &item.TaskID, &item.Action, &item.Success, &item.Message, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
