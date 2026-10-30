package server

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
)

// generateFindingReport requeues the existing reporter workflow for a finding.
// This is intentionally separate from report_finding: a restart can leave a
// finding persisted while the one-shot trigger conversation is gone.
func (s *Server) generateFindingReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, http.StatusBadRequest, "bad finding id")
		return
	}
	f, err := s.m.pg.GetFinding(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if f == nil {
		writeErr(w, http.StatusNotFound, "finding not found")
		return
	}
	if f.NodeID == nil || *f.NodeID <= 0 {
		writeErr(w, http.StatusConflict, "漏洞没有可用的探索节点，无法生成复现步骤")
		return
	}
	reporter, err := s.m.pg.GetAgentByKey("reporter")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if reporter == nil || !reporter.Enabled {
		writeErr(w, http.StatusConflict, "报告 Agent 未启用，请在 Agent 管理中启用 reporter")
		return
	}
	if s.resolveChatAgent(&db.Conversation{AgentKey: reporter.Key}) == nil {
		writeErr(w, http.StatusServiceUnavailable, s.chatUnavailableReason())
		return
	}
	if s.ctx.Err() != nil {
		writeErr(w, http.StatusServiceUnavailable, "服务正在停止")
		return
	}

	var taskID int64
	var taskDesc, taskGoal string
	if f.TaskID != nil {
		taskID = *f.TaskID
		if task := s.m.ResolveTask(strconv.FormatInt(taskID, 10)); task != nil {
			taskDesc, taskGoal = task.Description, task.Goal
		}
	}
	message := manualFindingReportMessage(f, taskID)
	s.StartTriggeredRun(
		"reporter",
		fmt.Sprintf("人工生成步骤与报告 · finding#%d", f.ID),
		message,
		taskID,
		false,
		taskDesc,
		taskGoal,
	)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"queued":          true,
		"agent_key":       "reporter",
		"finding_id":      f.ID,
		"finding_node_id": *f.NodeID,
	})
}

func manualFindingReportMessage(f *db.DBFinding, taskID int64) string {
	var b strings.Builder
	b.WriteString("【人工重新生成步骤与报告】这是一个已经登记的漏洞，请补生成该漏洞的结构化复现步骤和完整详细报告；不要创建新的漏洞记录，也不要修改或删除原始证据。\n")
	fmt.Fprintf(&b, "独立漏洞记录 ID（finding_id）=%d；探索节点 ID（finding_node_id）=%d。\n", f.ID, *f.NodeID)
	if taskID > 0 {
		fmt.Fprintf(&b, "来源任务 ID=%d。\n", taskID)
	}
	b.WriteString("先读取 get_finding_traffic(finding_id) 的当前证据清单及 version，再读取节点详情和任务执行记录；只使用实际保存的请求、响应和执行证据，不臆造步骤或数据包。\n")
	b.WriteString("报告必须包含“概述”“影响与危害”“受影响范围”“复现步骤”“根因分析”“修复建议”，并在复现步骤中按“步骤 1、步骤 2 …”完整展开。数据包只能引用该漏洞已绑定的真实流量。\n")
	b.WriteString("最后调用 update_finding_report：finding_id 使用探索节点 ID，evidence_version 使用刚读取的证据版本；报告正文保存为 Markdown。")
	return b.String()
}
