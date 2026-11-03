// Package report renders a deliverable Markdown report from the exploration
// graph: confirmed findings (with severity/evidence) (docs §15 P5).
package report

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Input bundles what the report needs.
type Input struct {
	Title       string
	Goal        string
	GeneratedAt time.Time
	AssetCounts map[string]int
	Findings    []*db.Node
	English     bool // instance output_language=en; Chinese remains the default
}

// labels holds the fixed report wording; user and finding content stays verbatim.
type labels struct {
	title, untitled, goal, noGoal, generated, summary, confirmed, assets, sep, findings, none, unclassified, poc string
}

var zhLabels = labels{"# 渗透测试报告 — %s\n\n", "未命名任务", "- **任务目标**：%s\n", "（未指定）",
	"- **生成时间**：%s\n\n", "## 摘要\n\n", "- 确认发现：**%d** 个\n", "- 资产：", "、",
	"## 发现\n\n", "_本次未确认漏洞。_\n\n", "未分类", "**PoC / 证据：**\n\n```\n%s\n```\n\n"}

var enLabels = labels{"# Penetration testing report — %s\n\n", "Untitled task", "- **Objective**: %s\n", "(not specified)",
	"- **Generated at**: %s\n\n", "## Summary\n\n", "- Confirmed findings: **%d**\n", "- Assets: ", ", ",
	"## Findings\n\n", "_No vulnerabilities were confirmed._\n\n", "Unclassified", "**PoC / evidence:**\n\n```\n%s\n```\n\n"}

type findingView struct {
	VulnClass string
	Name      string
	Severity  string
	Summary   string
	PoC       string
}

func parseFinding(n *db.Node) findingView {
	var p struct {
		VulnClass string `json:"vulnclass"`
		Name      string `json:"name"`
		Severity  string `json:"severity"`
		Summary   string `json:"summary"`
		Evidence  struct {
			PoC string `json:"poc"`
		} `json:"evidence"`
	}
	_ = json.Unmarshal(n.Payload, &p)
	return findingView{p.VulnClass, p.Name, p.Severity, p.Summary, p.Evidence.PoC}
}

var sevRank = map[string]int{"critical": 0, "high": 1, "medium": 2, "low": 3, "": 4}

// Markdown renders the report.
func Markdown(in Input) string {
	l := zhLabels
	if in.English {
		l = enLabels
	}
	var b strings.Builder
	fmt.Fprintf(&b, l.title, nz(in.Title, l.untitled))
	fmt.Fprintf(&b, l.goal, nz(in.Goal, l.noGoal))
	fmt.Fprintf(&b, l.generated, in.GeneratedAt.Format("2006-01-02 15:04:05"))

	// summary
	b.WriteString(l.summary)
	fmt.Fprintf(&b, l.confirmed, len(in.Findings))
	b.WriteString(l.assets)
	var types []string
	for t := range in.AssetCounts {
		types = append(types, t)
	}
	sort.Strings(types)
	for i, t := range types {
		if i > 0 {
			b.WriteString(l.sep)
		}
		fmt.Fprintf(&b, "%s %d", t, in.AssetCounts[t])
	}
	b.WriteString("\n\n")

	// findings
	b.WriteString(l.findings)
	if len(in.Findings) == 0 {
		b.WriteString(l.none)
	} else {
		fs := make([]findingView, 0, len(in.Findings))
		for _, n := range in.Findings {
			fs = append(fs, parseFinding(n))
		}
		sort.SliceStable(fs, func(i, j int) bool { return sevRank[fs[i].Severity] < sevRank[fs[j].Severity] })
		for i, f := range fs {
			fmt.Fprintf(&b, "### %d. [%s] %s\n\n", i+1, strings.ToUpper(nz(f.Severity, "info")), nz(f.Name, nz(f.VulnClass, l.unclassified)))
			fmt.Fprintf(&b, "%s\n\n", nz(f.Summary, ""))
			if f.PoC != "" {
				fmt.Fprintf(&b, l.poc, f.PoC)
			}
		}
	}

	return b.String()
}

func nz(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}
