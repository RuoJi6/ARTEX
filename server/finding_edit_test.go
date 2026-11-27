package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/report"
)

func TestReportExportsIncludeFindingRemark(t *testing.T) {
	now := time.Date(2026, 11, 27, 10, 0, 0, 0, time.UTC)
	f := &db.DBFinding{
		ID:        42,
		Name:      "后台越权导出",
		VulnClass: "IDOR",
		Severity:  db.SeverityHigh,
		Status:    db.FindingConfirmed,
		Summary:   "普通用户可导出管理员报表",
		Remark:    "已与业务确认，本周五前修复",
		Evidence:  "GET /api/export?id=1 HTTP/1.1",
		CreatedAt: now,
	}

	combined := report.FindingsMarkdown([]*db.DBFinding{f}, now)
	if !strings.Contains(combined, "**备注：**\n\n已与业务确认，本周五前修复") {
		t.Fatalf("combined markdown missing remark:\n%s", combined)
	}
	single := report.SingleFindingMarkdown(f, now)
	if !strings.Contains(single, "## 备注\n\n已与业务确认，本周五前修复") {
		t.Fatalf("single markdown missing remark:\n%s", single)
	}
	csvOut := string(report.FindingsCSV([]*db.DBFinding{f}))
	if !strings.Contains(csvOut, "备注") || !strings.Contains(csvOut, "已与业务确认，本周五前修复") {
		t.Fatalf("csv missing remark:\n%s", csvOut)
	}
}

func TestPatchFindingManualEditAndRemark(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("test postgres not configured")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	t.Cleanup(func() { pg.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	s := &Server{
		ctx: ctx,
		m:   &Manager{pg: pg, dir: t.TempDir(), tasks: map[string]*Task{}},
	}

	vc := fmt.Sprintf("__test_patch_finding_%d__", time.Now().UnixNano())
	fid, err := pg.AddFinding(0, 0, vc, "原始标题", db.SeverityMedium, "原始摘要", "原始证据", "worker", nil)
	if err != nil {
		t.Fatalf("AddFinding: %v", err)
	}
	t.Cleanup(func() { _, _ = pg.Exec(`DELETE FROM findings WHERE id=$1`, fid) })

	patch := func(id string, payload string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/api/exploration/findings/"+id, bytes.NewBufferString(payload))
		req.SetPathValue("id", id)
		rec := httptest.NewRecorder()
		s.patchFinding(rec, req)
		return rec
	}
	idStr := fmt.Sprintf("%d", fid)

	// Empty payload must return 400.
	if w := patch(idStr, `{}`); w.Code != http.StatusBadRequest {
		t.Fatalf("empty patch: want 400 got %d %s", w.Code, w.Body.String())
	}

	// Over-limit remark must return 400 and must NOT partially mutate name.
	tooLong := strings.Repeat("注", db.MaxFindingRemarkRunes+1)
	badBody, _ := json.Marshal(map[string]string{"name": "不应生效", "remark": tooLong})
	if w := patch(idStr, string(badBody)); w.Code != http.StatusBadRequest {
		t.Fatalf("over-limit remark: want 400 got %d %s", w.Code, w.Body.String())
	}
	before, _ := pg.GetFinding(fid)
	if before.Name != "原始标题" || before.Remark != "" {
		t.Fatalf("validation failure mutated row: %+v", before)
	}

	// Edit all fields at once.
	fullBody, _ := json.Marshal(map[string]string{
		"name":      "手工修改后的标题",
		"vulnclass": vc + "_edited",
		"severity":  db.SeverityCritical,
		"status":    db.FindingConfirmed,
		"summary":   "手工修改后的摘要",
		"evidence":  "  indented evidence line\nline 2",
		"report":    "## 手工报告\n\n细节说明",
		"remark":    "  需要复核支付接口权限  ",
	})
	w := patch(idStr, string(fullBody))
	if w.Code != http.StatusOK {
		t.Fatalf("full patch: want 200 got %d %s", w.Code, w.Body.String())
	}
	var dto FindingDTO
	if err := json.Unmarshal(w.Body.Bytes(), &dto); err != nil {
		t.Fatalf("decode dto: %v", err)
	}
	if dto.Name != "手工修改后的标题" || dto.VulnClass != vc+"_edited" || dto.Severity != db.SeverityCritical ||
		dto.Status != db.FindingConfirmed || dto.Summary != "手工修改后的摘要" ||
		dto.Evidence != "  indented evidence line\nline 2" || dto.Report != "## 手工报告\n\n细节说明" ||
		dto.Remark != "需要复核支付接口权限" {
		t.Fatalf("unexpected patched dto: %+v", dto)
	}

	// Clearing remark to empty string persists cleanly.
	w = patch(idStr, `{"remark":"   "}`)
	if w.Code != http.StatusOK {
		t.Fatalf("clear remark: want 200 got %d %s", w.Code, w.Body.String())
	}
	var cleared FindingDTO
	if err := json.Unmarshal(w.Body.Bytes(), &cleared); err != nil {
		t.Fatalf("decode cleared dto: %v", err)
	}
	if cleared.Remark != "" || cleared.Name != "手工修改后的标题" {
		t.Fatalf("unexpected cleared dto: %+v", cleared)
	}
}
