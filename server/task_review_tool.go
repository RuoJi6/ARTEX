package server

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

const taskReviewPageSize = 20

type taskReviewItem struct {
	NodeID int64  `json:"node_id"`
	State  string `json:"state"`
	Text   string `json:"text,omitempty"`
}

type taskReviewGroup struct {
	Items []taskReviewItem `json:"items"`
	Total int              `json:"total"`
}

type taskReview struct {
	TaskID   string          `json:"task_id"`
	Status   string          `json:"status"`
	ReadOnly bool            `json:"read_only"`
	Page     int             `json:"page"`
	PageSize int             `json:"page_size"`
	Goals    taskReviewGroup `json:"unfinished_goals"`
	Intents  taskReviewGroup `json:"unfinished_intents"`
	Findings taskReviewGroup `json:"recorded_findings"`
}

// toolGetTaskReview only reads the selected task's own graph. It never invokes
// task controls or forwards raw intent/finding payloads (which can contain commands,
// evidence, or detailed reproduction steps).
func (s *Server) toolGetTaskReview() actool.CoreTool {
	return roTool("get_task_review", "只读复盘指定任务：分页列出未完成目标、待处理或暂停的意图编号及已记录发现标题；不包含继承数据，不变更任务或恢复执行。用户想重开已结束的任务时，先用本工具复盘原任务，不要为复盘创建新任务。每组独立按同一个 page 分页。",
		objSchema(map[string]any{
			"task_id": strParam("原任务 id"),
			"page":    map[string]any{"type": "integer", "minimum": 1, "maximum": 100000, "description": "从 1 开始，默认 1；每组每页最多 20 条"},
		}, "task_id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				TaskID string `json:"task_id"`
				Page   *int   `json:"page"`
			}
			if err := json.Unmarshal(in, &a); err != nil {
				return actool.Errorf("无效的任务复盘参数"), nil
			}
			a.TaskID = strings.TrimSpace(a.TaskID)
			if a.TaskID == "" {
				return actool.Errorf("task_id 为必填"), nil
			}
			page := 1
			if a.Page != nil {
				page = *a.Page
				if page < 1 || page > 100000 {
					return actool.Errorf("page 必须在 1 至 100000 之间"), nil
				}
			}
			t, ok := s.m.Task(a.TaskID)
			if !ok || t.Store == nil {
				return actool.Errorf("找不到可复盘的任务: " + a.TaskID), nil
			}
			state := t.lifecycleSnapshot()
			status := state.Status
			if !isTerminalStatus(status) {
				switch {
				case state.Paused:
					status = "paused"
				case state.Queued:
					status = "queued"
				}
			}
			out := taskReview{TaskID: t.ID, Status: status, ReadOnly: true, Page: page, PageSize: taskReviewPageSize}
			for _, group := range []struct {
				out    *taskReviewGroup
				kind   string
				states []string
			}{
				{&out.Goals, db.KindGoal, []string{"open"}},
				{&out.Intents, db.KindIntent, []string{"open", "running", "paused"}},
				{&out.Findings, db.KindFinding, []string{"confirmed"}},
			} {
				nodes, total, err := t.Store.NodesPage(db.NodeFilter{Kinds: []string{group.kind}, States: group.states}, page, taskReviewPageSize)
				if err != nil {
					return actool.Errorf("读取任务复盘时出错: " + err.Error()), nil
				}
				group.out.Total = total
				group.out.Items = make([]taskReviewItem, 0, len(nodes))
				for _, n := range nodes {
					group.out.Items = append(group.out.Items, taskReviewItem{NodeID: n.ID, State: n.State, Text: taskReviewText(n)})
				}
			}
			return jsonResult(out)
		})
}

func taskReviewText(n *db.Node) string {
	var p struct {
		Text string `json:"text"`
		Name string `json:"name"`
	}
	if n.Kind == db.KindIntent || json.Unmarshal(n.Payload, &p) != nil {
		return ""
	}
	text := p.Text
	if n.Kind == db.KindFinding {
		text = p.Name
	}
	chars := []rune(strings.TrimSpace(text))
	if len(chars) > 160 {
		return string(chars[:160]) + "…"
	}
	return string(chars)
}
