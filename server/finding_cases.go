package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	actool "github.com/Autumn-27/norma/tool"
)

type findingCaseRequest struct {
	TaskID         json.RawMessage   `json:"task_id"`
	FindingID      json.RawMessage   `json:"finding_id"`
	IDs            []json.RawMessage `json:"finding_ids"`
	CaseID         json.RawMessage   `json:"case_id"`
	Version        int64             `json:"version"`
	Title          string            `json:"title"`
	Reason         string            `json:"reason"`
	Report         string            `json:"report"`
	Severity       string            `json:"severity"`
	SeverityReason string            `json:"severity_reason"`
	Page           int               `json:"page"`
}

func (a findingCaseRequest) ids() []int64 {
	out := []int64{}
	for _, raw := range a.IDs {
		out = append(out, parseProfileID(raw))
	}
	return out
}
func caseHTTPError(w http.ResponseWriter, err error) {
	code := 400
	if errors.Is(err, db.ErrFindingCaseConflict) || errors.Is(err, db.ErrFindingCaseReviewBusy) {
		code = 409
	}
	writeErr(w, code, err.Error())
}
func decodeCaseRequest(w http.ResponseWriter, r *http.Request, a any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(a); err != nil {
		writeErr(w, 400, "无效请求正文")
		return false
	}
	return true
}
func (s *Server) caseFindingDTO(f *db.DBFinding) FindingDTO {
	return findingFromDB(f, s.resolveAssetIDs(f.AssetIDs))
}
func (s *Server) listFindingCases(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := findingPaginationParam(q.Get("page"), 1, 0)
	size := findingPaginationParam(q.Get("limit"), 20, 100)
	rows, total, err := s.m.pg.ListFindingCases(findingFilterFromQuery(q), page, size)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	caseIDs := []int64{}
	for _, row := range rows {
		if row.Case != nil {
			caseIDs = append(caseIDs, row.Case.ID)
		}
	}
	contexts, err := s.m.pg.FindingCaseListContexts(caseIDs)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	assetIDs := []int64{}
	for _, c := range contexts {
		assetIDs = append(assetIDs, c.AssetIDs...)
	}
	assets := s.resolveAssetIDs(assetIDs)
	items := []map[string]any{}
	for _, row := range rows {
		v := map[string]any{"case": row.Case, "matched_ids": row.MatchedIDs}
		if row.Case != nil {
			c := contexts[row.Case.ID]
			v["task_name"], v["task_description"], v["last_found_at"], v["asset_count"] = c.TaskName, c.TaskDescription, c.LastFoundAt, c.AssetCount
			v["assets"] = append([]FindingAssetDTO{}, findingFromDB(&db.DBFinding{AssetIDs: c.AssetIDs}, assets).Assets...)
		}
		if row.FindingID > 0 {
			f, err := s.m.pg.FindingCaseSummary(row.FindingID, q.Get("original_rows") == "1")
			if err != nil {
				caseHTTPError(w, err)
				return
			}
			if f == nil {
				continue
			}
			f.Report = ""
			v["finding"] = s.caseFindingDTO(f)
		}
		items = append(items, v)
	}
	stats, err := s.m.pg.DistinctFindingStats(q.Get("task_id"))
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	matchingReports, err := s.m.pg.MatchingFindingReportCount(findingFilterFromQuery(q))
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "matching_reports": matchingReports, "page": page, "page_size": size, "stats": stats})
}
func (s *Server) findingCaseAccess(w http.ResponseWriter, r *http.Request, mutation bool) (*db.FindingCase, bool) {
	id := int64(atoiDefault(r.PathValue("id"), 0))
	c, err := s.m.pg.GetFindingCase(id)
	if err != nil {
		caseHTTPError(w, err)
		return nil, false
	}
	if c == nil {
		writeErr(w, 404, "漏洞组不存在")
		return nil, false
	}
	if ctx := r.URL.Query().Get("context_task"); ctx != "" {
		t := s.m.ResolveTask(ctx)
		_, inherited, allowed := findingProvenanceInTask(t, c.TaskID)
		if !allowed {
			writeErr(w, 404, "任务中没有该漏洞组")
			return nil, false
		}
		if mutation && inherited {
			writeErr(w, 403, "继承漏洞组只读")
			return nil, false
		}
	}
	return c, true
}
func (s *Server) getFindingCase(w http.ResponseWriter, r *http.Request) {
	c, ok := s.findingCaseAccess(w, r, false)
	if !ok {
		return
	}
	events, err := s.m.pg.FindingCaseEvents(c.ID)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"case": c, "events": events})
}
func (s *Server) getFindingCaseMembers(w http.ResponseWriter, r *http.Request) {
	c, ok := s.findingCaseAccess(w, r, false)
	if !ok {
		return
	}
	page := findingPaginationParam(r.URL.Query().Get("page"), 1, 0)
	size := findingPaginationParam(r.URL.Query().Get("limit"), 20, 100)
	fs, total, err := s.m.pg.FindingCaseMembers(c.ID, page, size)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	assets := s.resolveFindingAssets(fs)
	items := []FindingDTO{}
	for _, f := range fs {
		dto := findingFromDB(f, assets)
		if ctx := r.URL.Query().Get("context_task"); ctx != "" {
			dto.SourceTaskID, dto.Inherited, _ = findingProvenanceInTask(s.m.ResolveTask(ctx), f.TaskID)
		}
		items = append(items, dto)
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "page_size": size})
}
func (s *Server) removeFindingCaseMember(w http.ResponseWriter, r *http.Request) {
	c, ok := s.findingCaseAccess(w, r, true)
	if !ok {
		return
	}
	fid := int64(atoiDefault(r.PathValue("fid"), 0))
	var body struct {
		Reason string `json:"reason"`
	}
	if !decodeCaseRequest(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		body.Reason = "人工移出归并组"
	}
	if err := s.m.pg.RemoveFindingCaseMember(r.Context(), c.ID, fid, body.Reason); err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) caseSuggestions(w http.ResponseWriter, r *http.Request) {
	items, err := s.m.pg.FindingCaseSuggestions(int64(atoiDefault(r.URL.Query().Get("task_id"), 0)))
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, items)
}
func (s *Server) resolveCaseSuggestion(w http.ResponseWriter, r *http.Request) {
	var a struct {
		Accept bool `json:"accept"`
	}
	if !decodeCaseRequest(w, r, &a) {
		return
	}
	id, err := s.m.pg.ResolveFindingCaseSuggestion(r.Context(), int64(atoiDefault(r.PathValue("id"), 0)), a.Accept)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"case_id": i64s(id)})
}
func (s *Server) mergeFindingCase(w http.ResponseWriter, r *http.Request) {
	var a findingCaseRequest
	if !decodeCaseRequest(w, r, &a) {
		return
	}
	id, err := s.m.pg.MergeFindingCase(r.Context(), parseProfileID(a.TaskID), a.ids(), a.Title, a.Reason, "human")
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"case_id": i64s(id)})
}
func (s *Server) updateCaseReport(w http.ResponseWriter, r *http.Request) {
	c, ok := s.findingCaseAccess(w, r, true)
	if !ok {
		return
	}
	var a findingCaseRequest
	if !decodeCaseRequest(w, r, &a) {
		return
	}
	if err := validateUnifiedFindingReport(a.Report); err != nil {
		caseHTTPError(w, err)
		return
	}
	if err := s.m.pg.UpdateFindingCaseReport(r.Context(), c.ID, a.Version, a.Title, a.Report, a.Severity, a.SeverityReason); err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) findingCaseTools() []actool.CoreTool {
	props := map[string]any{"finding_id": idParam("独立 findings 记录 ID，不是探索节点 ID"), "finding_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "独立漏洞记录 ID 列表"}, "task_id": idParam("同一来源任务 ID"), "case_id": idParam("归并组 ID"), "version": idParam("get_finding_case 实际读取的 version"), "page": idParam("分页，从1开始，每页20条"), "title": strParam("同一实际缺陷的名称"), "reason": strParam("具体证据与归并理由，不能仅类型相同"), "report": strParam("全部成员证据的完整统一 Markdown 报告"), "severity": strParam("critical|high|medium|low"), "severity_reason": strParam("基于已验证影响的评级依据，不直接取最高等级")}
	specs := []struct {
		name, desc string
		required   []string
	}{
		{"search_finding_duplicates", "只读检索同任务候选，返回摘要与资产；等级不同也可能重复。支持分页，按需读取详情。", []string{"finding_id"}},
		{"get_finding_record", "读取独立漏洞完整原始证据和报告，返回探索节点编号以便追溯执行记录。", []string{"finding_id"}},
		{"merge_finding_records", "证据明确证明同一缺陷时归并；保留所有原始记录。不跨任务、不改变原评级，不可绕过人工否决。", []string{"task_id", "finding_ids", "title", "reason"}},
		{"suggest_finding_merge", "证据不足时提交疑似重复建议，待人工确认；不是自动合并。只允许两条同任务记录。", []string{"task_id", "finding_ids", "title", "reason"}},
		{"get_finding_case", "读取归并组和成员分页。先记录version，再读取成员的原报告、证据及流量；版本变化必须重新读取。", []string{"case_id"}},
		{"update_finding_case_report", "保存统一报告及评级理由，version必须来自实际读取。保留各条原报告，不新建漏洞。", []string{"case_id", "version", "title", "report", "severity", "severity_reason"}},
	}
	out := []actool.CoreTool{}
	for _, spec := range specs {
		spec := spec
		handler := func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var a findingCaseRequest
			if err := json.Unmarshal(in, &a); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			v, err := s.performFindingCaseTool(ctx, spec.name, a)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			raw, _ := json.Marshal(v)
			return actool.Text(string(raw)), nil
		}
		schemaProps := map[string]any{}
		for _, key := range spec.required {
			schemaProps[key] = props[key]
		}
		if spec.name == "search_finding_duplicates" || spec.name == "get_finding_case" {
			schemaProps["page"] = props["page"]
		}
		schema := objSchema(schemaProps, spec.required...)
		if strings.HasPrefix(spec.name, "get_") || strings.HasPrefix(spec.name, "search_") {
			out = append(out, roTool(spec.name, spec.desc, schema, handler))
		} else {
			out = append(out, wrTool(spec.name, spec.desc, schema, handler))
		}
	}
	out = append(out, s.toolCompleteFindingCaseReview())
	return out
}
func (s *Server) performFindingCaseTool(ctx context.Context, name string, a findingCaseRequest) (any, error) {
	if err := s.checkCaseReviewScope(ctx, name, a); err != nil {
		return nil, err
	}
	fid := parseProfileID(a.FindingID)
	cid := parseProfileID(a.CaseID)
	page := a.Page
	if page < 1 {
		page = 1
	}
	switch name {
	case "search_finding_duplicates":
		scope, err := s.historicalFindingReviewSelection(ctx)
		if err != nil {
			return nil, err
		}
		var scopes [][]int64
		if scope != nil {
			scopes = append(scopes, scope)
		}
		items, total, err := s.m.pg.FindingCaseCandidates(fid, page, 20, scopes...)
		return map[string]any{"items": items, "total": total, "page": page, "page_size": 20}, err
	case "get_finding_record":
		f, err := s.m.pg.GetFinding(fid)
		if err != nil {
			return nil, err
		}
		if f == nil {
			return nil, errors.New("漏洞不存在")
		}
		dto := s.caseFindingDTO(f)
		cid, err := s.m.pg.FindingCaseID(f.ID)
		if err != nil {
			return nil, err
		}
		if cid > 0 {
			dto.CaseID = i64s(cid)
		}
		if conv := intercept.ConvIDFromContext(ctx); conv > 0 {
			if _, err := s.m.pg.Exec(`UPDATE finding_case_review_runs SET reviewed_ids=CASE WHEN reviewed_ids @> jsonb_build_array($2::bigint) THEN reviewed_ids ELSE reviewed_ids || jsonb_build_array($2::bigint) END WHERE conversation_id=$1 AND finding_ids @> jsonb_build_array($2::bigint)`, conv, f.ID); err != nil {
				return nil, err
			}
		}
		return map[string]any{"finding": dto, "finding_node_id": f.NodeID}, nil
	case "merge_finding_records":
		id, err := s.m.pg.MergeFindingCase(ctx, parseProfileID(a.TaskID), a.ids(), a.Title, a.Reason, "reporter")
		return map[string]string{"case_id": i64s(id)}, err
	case "suggest_finding_merge":
		ids := a.ids()
		if len(ids) != 2 {
			return nil, errors.New("疑似重复建议需要两条记录")
		}
		id, err := s.m.pg.SuggestFindingCase(ctx, parseProfileID(a.TaskID), ids[0], ids[1], a.Title, a.Reason)
		return map[string]string{"suggestion_id": i64s(id)}, err
	case "get_finding_case":
		c, err := s.m.pg.GetFindingCase(cid)
		if err != nil {
			return nil, err
		}
		if c == nil {
			return nil, errors.New("漏洞组不存在")
		}
		fs, total, err := s.m.pg.FindingCaseMembers(cid, page, 20)
		members := []FindingDTO{}
		for _, f := range fs {
			members = append(members, s.caseFindingDTO(f))
		}
		return map[string]any{"case": c, "members": members, "total": total, "page": page, "page_size": 20}, err
	case "update_finding_case_report":
		if err := validateUnifiedFindingReport(a.Report); err != nil {
			return nil, err
		}
		err := s.m.pg.UpdateFindingCaseReport(ctx, cid, a.Version, a.Title, a.Report, a.Severity, a.SeverityReason)
		return map[string]bool{"ok": err == nil}, err
	}
	return nil, errors.New("未知归并工具")
}
func idParam(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}
func (s *Server) seedFindingCaseTools() {
	_, _ = s.m.pg.Exec(`UPDATE finding_case_review_runs SET state='failed',error='服务重启中断，请重新提交整理' WHERE state IN ('queued','running')`)
	a, err := s.m.pg.GetAgentByKey("reporter")
	if err != nil || a == nil {
		return
	}
	const flag = "finding_case_tools_v2_review"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	names := []string{}
	previous, _, _ := s.m.pg.GetSetting("finding_case_tools_v1")
	for _, t := range s.findingCaseTools() {
		schema, _ := json.Marshal(t.InputSchema())
		if err := s.m.pg.SeedTool(t.Name(), t.Description(), schema, json.RawMessage(`["reporter"]`)); err != nil {
			return
		}
		if previous != "true" || t.Name() == "complete_finding_case_review" {
			names = append(names, t.Name())
		}
	}
	if err := s.m.pg.AddAgentToToolBinding("reporter", names); err != nil {
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}
func (s *Server) reviewFindingCases(w http.ResponseWriter, r *http.Request) {
	var a findingCaseRequest
	if !decodeCaseRequest(w, r, &a) {
		return
	}
	ids := a.ids()
	if cid := parseProfileID(a.CaseID); cid > 0 {
		c, err := s.m.pg.GetFindingCase(cid)
		if err != nil || c == nil || !c.Active {
			writeErr(w, 400, "漏洞组不可用")
			return
		}
		if ctx := r.URL.Query().Get("context_task"); ctx != "" && (c.TaskID == nil || ctx != i64s(*c.TaskID)) {
			writeErr(w, 403, "继承漏洞组只读")
			return
		}
		fs, _, err := s.m.pg.FindingCaseMembers(cid, 1, 100000)
		if err != nil {
			caseHTTPError(w, err)
			return
		}
		ids = nil
		for _, f := range fs {
			ids = append(ids, f.ID)
		}
	}
	if len(ids) == 0 || (len(a.CaseID) == 0 && len(ids) > 200) {
		writeErr(w, 400, "请选择1至200条原始上报")
		return
	}
	reporter, err := s.m.pg.GetAgentByKey("reporter")
	if err != nil || reporter == nil || !reporter.Enabled || s.chatAgentRef() == nil {
		writeErr(w, 409, "报告 Agent 未启用或模型不可用")
		return
	}
	batches := map[int64][]int64{}
	for _, fid := range ids {
		f, err := s.m.pg.FindingCaseSummary(fid)
		if err != nil || f == nil || f.TaskID == nil {
			writeErr(w, 400, "所选漏洞来源任务不可用")
			return
		}
		batches[*f.TaskID] = append(batches[*f.TaskID], fid)
	}
	// Validate and snapshot every source before starting any batch.
	taskContexts := map[int64]triggeredRun{}
	for taskID := range batches {
		t, ok := s.m.Task(i64s(taskID))
		if !ok {
			writeErr(w, 409, "任务不可用")
			return
		}

		taskContexts[taskID] = triggeredRun{taskDesc: t.Description, taskGoal: t.Goal}
	}
	reservations, err := s.m.pg.CreateFindingCaseReviews(r.Context(), batches)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	runs := []map[string]any{}
	for _, reservation := range reservations {
		taskID, fids := reservation.TaskID, reservation.FindingIDs
		taskContext := taskContexts[taskID]
		raw, _ := json.Marshal(fids)
		msg := fmt.Sprintf("人工选择整理（只读原始记录）：本任务所选 finding_ids=%s。逐条读取已有报告，仅判断同一实际根因，明确则归并，不确定提交建议；已有组更新统一报告。禁止生成或覆盖原始报告、改评级状态、补绑证据，不归并未选记录，不探测目标。结束前调用 complete_finding_case_review 提交逐条判断并通过验收。", raw)
		item := triggeredRun{agentKey: "reporter", title: "漏洞整理 · task#" + i64s(taskID), message: msg, taskID: taskID, taskDesc: taskContext.taskDesc, taskGoal: taskContext.taskGoal, conversationID: reservation.ConversationID}
		cfg := s.readTriggerBehavior("reporter")
		s.queueMu.Lock()
		s.triggerCfg["reporter"] = cfg
		s.triggerQ["reporter"] = append(s.triggerQ["reporter"], item)
		s.pumpLocked("reporter")
		s.queueMu.Unlock()
		runs = append(runs, map[string]any{"conversation_id": reservation.ConversationID, "task_id": i64s(taskID)})
	}
	writeJSON(w, 202, map[string]any{"runs": runs})
}
func (s *Server) caseReviewRuns(w http.ResponseWriter, r *http.Request) {
	rows, err := s.m.pg.Query(`SELECT conversation_id,task_id,state,error FROM finding_case_review_runs ORDER BY conversation_id DESC LIMIT 50`)
	if err != nil {
		caseHTTPError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var conv int64
		var task sql.NullInt64
		var state, msg string
		if err := rows.Scan(&conv, &task, &state, &msg); err != nil {
			caseHTTPError(w, err)
			return
		}
		items = append(items, map[string]any{"conversation_id": conv, "task_id": i64s(task.Int64), "state": state, "error": msg})
	}
	if err := rows.Err(); err != nil {
		caseHTTPError(w, err)
		return
	}
	writeJSON(w, 200, items)
}

// Manual reviews cannot mutate a finding outside the explicit selection.
func (s *Server) checkCaseReviewScope(ctx context.Context, name string, a findingCaseRequest) error {
	conv := intercept.ConvIDFromContext(ctx)
	if conv == 0 {
		return nil
	}
	var raw, conclusion json.RawMessage
	err := s.m.pg.QueryRow(`SELECT finding_ids,conclusion FROM finding_case_review_runs WHERE conversation_id=$1`, conv).Scan(&raw, &conclusion)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	var ids []int64
	if err := json.Unmarshal(raw, &ids); err != nil {
		return err
	}
	if string(conclusion) != "{}" && (name == "merge_finding_records" || name == "suggest_finding_merge" || name == "update_finding_case_report") {
		return errors.New("整理判断已提交，不能在验收后继续修改")
	}
	allowed := map[int64]bool{}
	for _, id := range ids {
		allowed[id] = true
	}
	switch name {
	case "search_finding_duplicates":
		if !allowed[parseProfileID(a.FindingID)] {
			return errors.New("历史整理只能检索所选记录的候选")
		}
	case "update_finding_report", "bind_finding_traffic", "report_finding":
		return errors.New("历史整理禁止修改原始报告、上报或证据；只能写归并关系及统一报告")
	case "merge_finding_records", "suggest_finding_merge":
		checkIDs := a.ids()
		for _, id := range checkIDs {
			if !allowed[id] {
				return errors.New("人工整理只能归并所选记录")
			}
		}
	case "update_finding_case_report":
		fs, _, err := s.m.pg.FindingCaseMembers(parseProfileID(a.CaseID), 1, 100000)
		if err != nil {
			return err
		}
		found := false
		for _, f := range fs {
			if allowed[f.ID] {
				found = true
			}
		}
		if !found {
			return errors.New("该漏洞组不属于人工所选范围")
		}
	}
	return nil
}
