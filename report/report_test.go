package report

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func reportInput(english bool) Input {
	return Input{
		Title:       "Health check",
		GeneratedAt: time.Date(2026, 11, 3, 14, 0, 0, 0, time.UTC),
		AssetCounts: map[string]int{"ip": 1, "service": 2},
		Findings:    []*db.Node{{Payload: []byte(`{"severity":"high","summary":"原文 summary","evidence":{"poc":"GET / 原文"}}`)}},
		English:     english,
	}
}

func TestMarkdownChineseDefaultUnchanged(t *testing.T) {
	want := "# 渗透测试报告 — Health check\n\n- **任务目标**：（未指定）\n- **生成时间**：2026-11-03 14:00:00\n\n" +
		"## 摘要\n\n- 确认发现：**1** 个\n- 资产：ip 1、service 2\n\n## 发现\n\n" +
		"### 1. [HIGH] 未分类\n\n原文 summary\n\n**PoC / 证据：**\n\n```\nGET / 原文\n```\n\n"
	if got := Markdown(reportInput(false)); got != want {
		t.Fatalf("Chinese report changed:\n%s", got)
	}
}

func TestMarkdownEnglishKeepsContentVerbatim(t *testing.T) {
	got := Markdown(reportInput(true))
	for _, s := range []string{"# Penetration testing report — Health check", "- Assets: ip 1, service 2",
		"[HIGH] Unclassified", "原文 summary", "GET / 原文"} {
		if !strings.Contains(got, s) {
			t.Fatalf("missing %q in:\n%s", s, got)
		}
	}
	labelsOnly := strings.NewReplacer("原文 summary", "", "GET / 原文", "").Replace(got)
	if regexp.MustCompile(`\p{Han}`).MatchString(labelsOnly) {
		t.Fatalf("Chinese label in English report:\n%s", got)
	}
}
