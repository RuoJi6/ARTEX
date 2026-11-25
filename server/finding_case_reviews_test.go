package server

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/intercept"
)

func TestFindingCaseReviewTaskMessagePolicy(t *testing.T) {
	message := fmt.Sprintf(findingCaseReviewTaskMessage, `[101,102,103]`)
	for _, want := range []string{
		"finding_ids=[101,102,103]",
		"由 AI 直接判断是否属于同一实际根因",
		"相同端点/路由、处理器或后端组件、参数或缺失检查",
		"直接调用 merge_finding_records 完成归并",
		"不再提交待人工确认的建议",
		"保持 independent",
		"尽力更新统一报告",
		"统一报告暂缺或待更新不阻塞 complete_finding_case_review",
		"不归并本次范围外记录",
		"不探测目标",
		"仅 merged 或 independent",
	} {
		if !strings.Contains(message, want) {
			t.Errorf("task message missing policy: %s", want)
		}
	}
	for _, banned := range []string{"人工选择整理", "suggest_finding_merge", "不确定提交建议", "疑似成员"} {
		if strings.Contains(message, banned) {
			t.Fatalf("task message still references manual selection/suggestion: %s", banned)
		}
	}
	schema, err := json.Marshal((&Server{}).toolCompleteFindingCaseReview().InputSchema())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(schema), `"suggested"`) {
		t.Fatalf("completion schema must not allow suggested verdict: %s", schema)
	}
	if !strings.Contains(string(schema), `"independent"`) || !strings.Contains(string(schema), `"merged"`) {
		t.Fatalf("completion schema missing binary verdicts: %s", schema)
	}
	for _, tool := range (&Server{}).findingCaseTools() {
		if tool.Name() == "suggest_finding_merge" {
			t.Fatal("retired suggest_finding_merge still registered in findingCaseTools")
		}
	}
}

const completeFindingReviewReport = `# 同一权限缺陷
## 概述
同一对象权限检查缺失。
## 影响
已验证读取其他账号的订单。
## 前置条件
已存在的低权会话和订单编号。
## 复现步骤
对照自己的订单，再查看其他账号订单，响应证明同一检查缺失。
## 证据
原报告的保存响应及命令输出，未重新探测。
## PoC
完整命令在原始证据中，此测试使用隔离材料。
## 根因分析
同一订单 handler 未验证订单所有者。
## 修复建议
统一验证请求者与订单所有者，并回归对象权限检查。
`

func TestUnifiedFindingReportRejectsIncompleteAndTruncated(t *testing.T) {
	if err := validateUnifiedFindingReport(completeFindingReviewReport); err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{strings.Split(completeFindingReviewReport, "## 根因分析")[0], completeFindingReviewReport + "\n```bash\nunclosed", strings.Replace(completeFindingReviewReport, "统一验证请求者与订单所有者，并回归对象权限检查。", "", 1)} {
		if err := validateUnifiedFindingReport(s); err == nil {
			t.Fatal("incomplete report accepted")
		}
	}
	// Section labels appearing inside a script are not real report sections.
	if err := validateUnifiedFindingReport("## 概述\ntext\n```bash\n" + completeFindingReviewReport + "\n```"); err == nil {
		t.Fatal("script comments counted as sections")
	}
}

func TestFindingCaseReviewCompletionRequiresReadsNotFreshReport(t *testing.T) {
	s, task, ids := testCaseServer(t)
	runs, err := s.m.pg.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task: ids})
	if err != nil {
		t.Fatal(err)
	}
	conv := runs[0].ConversationID
	defer s.m.pg.Exec(`DELETE FROM conversations WHERE id=$1`, conv)
	if _, err := s.m.pg.Exec(`UPDATE finding_case_review_runs SET state='running' WHERE conversation_id=$1`, conv); err != nil {
		t.Fatal(err)
	}
	ctx := intercept.WithConvID(context.Background(), conv)
	a := findingReviewConclusion{Summary: "根据对象权限检查的具体证据判断"}
	for _, id := range ids {
		a.Decisions = append(a.Decisions, findingReviewDecision{FindingID: id, Verdict: "merged", Reason: "同一 handler", RootCauseEvidence: "各记录的 baseline/proof 指向同一对象所有者校验缺失"})
	}
	if err := s.saveFindingReviewConclusion(ctx, conv, a); err == nil {
		t.Fatal("unread findings accepted")
	}
	for _, id := range ids {
		if _, err := s.performFindingCaseTool(ctx, "get_finding_record", findingCaseRequest{FindingID: json.RawMessage(fmt.Sprint(id))}); err != nil {
			t.Fatal(err)
		}
	}
	cid, err := s.m.pg.MergeFindingCase(ctx, task, ids, "orders", "same concrete check", "reporter")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.saveFindingReviewConclusion(ctx, conv, a); err != nil {
		t.Fatal(err)
	}
	if err := s.validateFindingReviewCompletion(conv); err != nil {
		t.Fatal(err)
	}
	if err := s.checkCaseReviewScope(ctx, "update_finding_case_report", findingCaseRequest{CaseID: json.RawMessage(fmt.Sprint(cid))}); err == nil {
		t.Fatal("sealed review can still mutate")
	}
	if _, err := s.m.pg.Exec(`UPDATE findings SET evidence='new proof' WHERE id=$1`, ids[0]); err != nil {
		t.Fatal(err)
	}
	if err := s.validateFindingReviewCompletion(conv); err != nil {
		t.Fatalf("stale unified report should not block merged conclusion: %v", err)
	}
}

func TestFindingCaseReviewProtectsOriginalToolWrites(t *testing.T) {
	s, f, _ := trafficEvidenceServer(t)
	original, err := s.m.pg.GetFinding(f.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	runs, err := s.m.pg.CreateFindingCaseReviews(t.Context(), map[int64][]int64{*original.TaskID: {original.ID}})
	if err != nil {
		t.Fatal(err)
	}
	conv := runs[0].ConversationID
	defer s.m.pg.Exec(`DELETE FROM conversations WHERE id=$1`, conv)
	ctx := intercept.WithConvID(context.Background(), conv)
	workflowCall(t, ctx, s.toolUpdateFindingReport(), map[string]any{"finding_id": f.NodeID, "report": "OVERWRITE", "evidence_version": original.EvidenceVersion}, true)
	if err := s.agentFindingTrafficAccess(ctx, f.FindingID, true); err == nil {
		t.Fatal("historical review can change evidence")
	}
	after, _ := s.m.pg.GetFinding(original.ID)
	if after.Report != original.Report || after.EvidenceVersion != original.EvidenceVersion || after.Status != original.Status || after.Severity != original.Severity {
		t.Fatal("original changed")
	}
	// Normal reporting is still able to write its own standalone report.
	workflowCall(t, context.Background(), s.toolUpdateFindingReport(), map[string]any{"finding_id": f.NodeID, "report": "normal report", "evidence_version": original.EvidenceVersion}, false)
}

func TestFindingCaseReviewRejectsSuggestedVerdict(t *testing.T) {
	s, task, ids := testCaseServer(t)
	runs, err := s.m.pg.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task: ids[:2]})
	if err != nil {
		t.Fatal(err)
	}
	conv := runs[0].ConversationID
	defer s.m.pg.Exec(`DELETE FROM conversations WHERE id=$1`, conv)
	s.m.pg.Exec(`UPDATE finding_case_review_runs SET state='running' WHERE conversation_id=$1`, conv)
	ctx := intercept.WithConvID(context.Background(), conv)
	a := findingReviewConclusion{Summary: "尝试提交已废弃的 suggested 结论"}
	for _, id := range ids[:2] {
		s.performFindingCaseTool(ctx, "get_finding_record", findingCaseRequest{FindingID: json.RawMessage(fmt.Sprint(id))})
		a.Decisions = append(a.Decisions, findingReviewDecision{FindingID: id, Verdict: "suggested", Reason: "疑似重复", RootCauseEvidence: "缺少根因证据"})
	}
	if err := s.saveFindingReviewConclusion(ctx, conv, a); err == nil {
		t.Fatal("retired suggested verdict was accepted")
	}
	if _, err := s.performFindingCaseTool(ctx, "suggest_finding_merge", findingCaseRequest{TaskID: json.RawMessage(fmt.Sprint(task)), IDs: []json.RawMessage{json.RawMessage(fmt.Sprint(ids[0])), json.RawMessage(fmt.Sprint(ids[1]))}, Title: "orders", Reason: "uncertain"}); err == nil {
		t.Fatal("retired suggest_finding_merge tool was allowed")
	}
}

func TestFindingCaseReviewCandidatesStayWithinSelection(t *testing.T) {
	s, task, ids := testCaseServer(t)
	runs, err := s.m.pg.CreateFindingCaseReviews(t.Context(), map[int64][]int64{task: ids[:2]})
	if err != nil {
		t.Fatal(err)
	}
	conv := runs[0].ConversationID
	defer s.m.pg.Exec(`DELETE FROM conversations WHERE id=$1`, conv)
	ctx := intercept.WithConvID(context.Background(), conv)
	a := findingCaseRequest{FindingID: json.RawMessage(fmt.Sprint(ids[0]))}
	v, err := s.performFindingCaseTool(ctx, "search_finding_duplicates", a)
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["total"].(int) != 1 {
		t.Fatal("unselected candidates leaked", v)
	}
	v, err = s.performFindingCaseTool(context.Background(), "search_finding_duplicates", a)
	if err != nil || v.(map[string]any)["total"].(int) != 2 {
		t.Fatal("normal candidate search changed", v, err)
	}
}
