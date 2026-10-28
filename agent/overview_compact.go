package agent

// Read-only Planner presentation adapter. graph_overview retains the complete
// structured JSON; this view renders the same data without changing graph state.

import (
	"encoding/json"
	"fmt"
	"strings"
)

type overviewWriter struct {
	strings.Builder
	records []int
}

func (b *overviewWriter) record() {
	pos := b.Len()
	if len(b.records) == 0 || b.records[len(b.records)-1] != pos {
		b.records = append(b.records, pos)
	}
}

func plannerOverviewText(data map[string]any) string {
	if len(data) == 0 {
		return ""
	}
	var b overviewWriter
	b.record()
	if task, ok := data["task"].(map[string]any); ok {
		fmt.Fprintf(&b, "【Task】%s\n目标: %s\n", ovText(task["description"], 800), ovText(task["goal"], 1600))
	}
	b.record()
	fmt.Fprintf(&b, "【黑板统计】frontier_open=%s done_intents_total=%s facts=%s findings_total=%s\n",
		ovText(data["frontier_open"], 20), ovText(data["done_intents_total"], 20),
		ovText(data["facts"], 20), ovText(data["findings_total"], 20))
	if cov, ok := data["coverage"].(map[string]any); ok && len(cov) > 0 {
		b.record()
		fmt.Fprintf(&b, "【资产概况】hosts=%s tested=%s denominator=%s pct=%s status=%s\n",
			ovText(cov["host_count"], 20), ovText(cov["tested"], 20),
			ovText(cov["denominator"], 20), ovPct(cov["pct"]), ovText(cov["status"], 100))
		if types := ovText(cov["by_type"], 950); types != "" {
			fmt.Fprintf(&b, "资产类型覆盖: %s\n", types)
		}
		if note := ovText(cov["note"], 500); note != "" {
			fmt.Fprintf(&b, "覆盖统计说明: %s\n", note)
		}
	}

	ovRows(&b, "目标 goals", ovMaps(data["goals"]), "text", 600, 100)
	ovRows(&b, "人工提示 hints", ovMaps(data["hints"]), "text", 600, 50)
	ovRows(&b, "开放意图 open_intents", ovMaps(data["open_intents"]), "summary", 340, 30)
	ovRows(&b, "执行中 running_intents", ovMaps(data["running_intents"]), "summary", 340, 300)
	ovRows(&b, "近期发现 finding_list", ovMaps(data["finding_list"]), "summary", 340, 10)
	ovRows(&b, "近期事实 recent_facts", ovMaps(data["recent_facts"]), "summary", 340, 20)
	ovDigests(&b, ovMaps(data["cold_digests"]), data["cold_digests_more"], 11000, 1800)
	ovRows(&b, "近期完成/中断 recent_done_intents", ovMaps(data["recent_done_intents"]), "summary", 340, 12)

	sources := ovMaps(data["related_tasks"])
	if len(sources) > 0 {
		b.record()
		fmt.Fprintf(&b, "【直接关联任务（只读）共%d个】\n", len(sources))
		for _, src := range sources {
			task, _ := src["task"].(map[string]any)
			b.record()
			fmt.Fprintf(&b, "- 来源 Task #%s [%s] %s；目标=%s；facts=%s findings=%s\n",
				ovText(src["source_task_id"], 24), ovText(task["status"], 40),
				ovText(task["description"], 360), ovText(task["goal"], 600),
				ovText(src["facts"], 20), ovText(src["findings"], 20))
			ovRows(&b, "来源目标", ovMaps(src["goals"]), "text", 200, 8)
			ovRows(&b, "来源提示", ovMaps(src["hints"]), "text", 200, 6)
			ovRows(&b, "来源最近漏洞", ovMaps(src["recent_findings"]), "summary", 260, 6)
			ovRows(&b, "来源最近事实", ovMaps(src["recent_facts"]), "summary", 260, 12)
			ovRows(&b, "来源已结束意图", ovMaps(src["recent_intent_results"]), "summary", 260, 8)
			if scopes := ovMaps(src["asset_scope"]); len(scopes) > 0 {
				fmt.Fprintf(&b, "  来源资产范围（显示%d/%s）:", len(scopes), ovText(src["asset_scope_count"], 20))
				for _, scope := range scopes {
					value := scope["value"]
					if value == nil {
						value = scope["company_id"]
					}
					fmt.Fprintf(&b, " [%s:%s]", ovText(scope["kind"], 24), ovText(value, 120))
				}
				b.WriteByte('\n')
			}
			if cov, ok := src["asset_coverage"].(map[string]any); ok {
				fmt.Fprintf(&b, "  来源资产覆盖: tested=%s denominator=%s pct=%s\n",
					ovText(cov["tested"], 20), ovText(cov["denominator"], 20), ovPct(cov["pct"]))
			}
			ovDigests(&b, ovMaps(src["cold_digests"]), src["cold_digests_more"], 3200, 1000)
			if src["summary_truncated"] == true {
				b.WriteString("  来源快照有截断；详情可按节点 ID 调阅。\n")
			}
		}
	}
	b.record()
	b.WriteString("【原始记录】以上是 graph_overview 同源只读压缩视图，不是完整证据。完整结构化快照用 graph_overview，折叠历史用 expand_digest(id)，单节点证据用 node_detail(id)，事实用 list_facts；未出现的内容不等于未测试。\n")
	return limitPlannerOverview(strings.TrimSpace(b.String()), b.records)
}

func ovRows(b *overviewWriter, title string, rows []map[string]any, field string, textLimit, limit int) {
	if len(rows) == 0 {
		return
	}
	b.record()
	fmt.Fprintf(b, "【%s】(%d条)\n", title, len(rows))
	for i, item := range rows {
		if i >= limit {
			fmt.Fprintf(b, "  ...另有%d条未直接展示，按原始工具查阅。\n", len(rows)-i)
			break
		}
		b.record()
		fmt.Fprintf(b, "- #%s [%s] %s",
			ovText(item["id"], 24), ovText(item["state"], 24), ovText(item[field], textLimit))
		if v := ovIDs(item["parents"]); v != "" {
			fmt.Fprintf(b, " parents=[%s]", v)
		}
		if v := ovIDs(item["yields"]); v != "" {
			fmt.Fprintf(b, " yields=[%s]", v)
		}
		if v := ovIDs(item["asset_ids"]); v != "" {
			fmt.Fprintf(b, " asset_ids=[%s]", v)
		}
		for _, attr := range []string{"confidence", "from_intent", "source_task_id", "result_summary"} {
			if v := ovText(item[attr], 300); v != "" {
				fmt.Fprintf(b, " %s=%s", attr, v)
			}
		}
		if refs := item["traffic_refs"]; refs != nil {
			if encoded, err := json.Marshal(refs); err == nil {
				fmt.Fprintf(b, " traffic_refs=%s", encoded)
			}
		}
		b.WriteByte('\n')
	}
}

func ovDigests(b *overviewWriter, digests []map[string]any, more any, bodyBudget, perBody int) {
	if len(digests) == 0 && ovIDs(more) == "" {
		return
	}
	b.record()
	fmt.Fprintf(b, "【历史 Digest】显示%d段\n", len(digests))
	for _, d := range digests {
		b.record()
		id := ovText(d["id"], 24)
		fmt.Fprintf(b, "- Digest #%s（成员=%s）\n", id, ovText(d["member_count"], 20))
		original, _ := d["body"].(string)
		runes := []rune(original)
		limit := perBody
		if bodyBudget < limit {
			limit = bodyBudget
		}
		if limit < 0 {
			limit = 0
		}
		if len(runes) > 0 && limit == 0 {
			fmt.Fprintf(b, "  原始摘要未展示（预算已用尽）；完整正文: expand_digest(%s)。\n", id)
			runes = nil
		} else {
			truncated := len(runes) > limit
			if truncated {
				runes = runes[:limit]
			}
			if len(runes) > 0 {
				fmt.Fprintf(b, "  原始摘要: %s\n", string(runes))
			}
			if truncated {
				fmt.Fprintf(b, "  摘要已截断；完整正文: expand_digest(%s)。\n", id)
			}
		}
		bodyBudget -= len(runes)
		ovDigestDecisions(b, d)
	}
	if ids := ovIDs(more); ids != "" {
		b.record()
		fmt.Fprintf(b, "  其他未展示的 Digest ID: %s（expand_digest(id) 可找回）。\n", ids)
	}
}

func ovDigestDecisions(b *overviewWriter, digest map[string]any) {
	if work := ovMaps(digest["work"]); len(work) > 0 {
		parts := make([]string, 0, len(work))
		for _, item := range work {
			parts = append(parts, fmt.Sprintf("#%s/%s", ovText(item["intent_id"], 24), ovText(item["state"], 20)))
		}
		fmt.Fprintf(b, "  工作状态: %s\n", strings.Join(parts, " "))
	}
	for _, result := range ovMaps(digest["key_results"]) {
		fmt.Fprintf(b, "  - Fact #%s [%s/%s] %s",
			ovText(result["fact_id"], 24), ovText(result["state"], 20),
			ovText(result["confidence"], 20), ovText(result["summary"], 800))
		if conditions := ovText(result["conditions"], 600); conditions != "" {
			fmt.Fprintf(b, "；conditions=%s", conditions)
		}
		b.WriteByte('\n')
	}
	for _, item := range ovMaps(digest["unresolved"]) {
		fmt.Fprintf(b, "  未完成: #%s [%s] %s\n",
			ovText(item["intent_id"], 24), ovText(item["state"], 20), ovText(item["reason"], 600))
	}
	if ids := ovDigestRefIDs(digest["source_refs"], "findings"); ids != "" {
		fmt.Fprintf(b, "  关联发现: %s\n", ids)
	}
}

func ovDigestRefIDs(value any, kind string) string {
	switch refs := value.(type) {
	case map[string][]int64:
		return ovIDs(refs[kind])
	case map[string]any:
		return ovIDs(refs[kind])
	default:
		return ""
	}
}

const plannerOverviewMaxRunes = 60000

func limitPlannerOverview(s string, boundaries []int) string {
	if len([]rune(s)) <= plannerOverviewMaxRunes {
		return s
	}
	const footer = "\n【全局视图截断】后续完整记录未展示；调用 graph_overview 获取完整结构化快照，使用 expand_digest(id) 与 node_detail(id) 找回；未出现不等于未测试。"
	budget := plannerOverviewMaxRunes - len([]rune(footer))
	var b strings.Builder
	used := 0
	if len(boundaries) == 0 || boundaries[0] != 0 {
		boundaries = append([]int{0}, boundaries...)
	}
	for i, start := range boundaries {
		end := len(s)
		if i+1 < len(boundaries) {
			end = boundaries[i+1]
		}
		if start >= end || start >= len(s) {
			continue
		}
		if end > len(s) {
			end = len(s)
		}
		part := s[start:end]
		partRunes := len([]rune(part))
		if used+partRunes > budget {
			return strings.TrimRight(b.String(), "\r\n ") + footer
		}
		b.WriteString(part)
		used += partRunes
	}
	return strings.TrimSpace(b.String()) + footer
}

func ovMaps(v any) []map[string]any {
	if values, ok := v.([]map[string]any); ok {
		return values
	}
	items, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func ovPct(v any) string {
	switch p := v.(type) {
	case *float64:
		if p == nil {
			return ""
		}
		return fmt.Sprintf("%.1f%%", *p*100)
	case float64:
		return fmt.Sprintf("%.1f%%", p*100)
	default:
		return ovText(v, 24)
	}
}

func ovText(v any, limit int) string {
	if v == nil || limit <= 0 {
		return ""
	}
	s := strings.Join(strings.Fields(fmt.Sprint(v)), " ")
	r := []rune(s)
	if len(r) > limit {
		return string(r[:limit]) + "…(截断)"
	}
	return s
}

func ovIDs(v any) string {
	var parts []string
	switch ids := v.(type) {
	case []int64:
		for _, id := range ids {
			parts = append(parts, fmt.Sprint(id))
		}
	case []any:
		for _, id := range ids {
			parts = append(parts, fmt.Sprint(id))
		}
	}
	return strings.Join(parts, ",")
}
