package agent

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
)

const (
	workerContextIntentCap  = 12
	workerContextFactCap    = 12
	workerContextFindingCap = 10
	workerContextDigestCap  = 4
	workerContextRefCap     = 80
)

type workerContextRelevance struct {
	assets  map[int64]bool
	intents map[int64]bool
	nodes   map[int64]bool
}

func renderWorkerTaskContext(data map[string]any, intent *db.Node) string {
	intents := workerContextIntentRows(data)
	facts := workerContextRows(data, "recent_facts", "recent_facts")
	findings := workerContextRows(data, "finding_list", "recent_findings")
	relevance := workerContextRelevanceFor(intent, intents, facts, findings)

	var b overviewWriter
	b.WriteString("【本意图相关上下文（只读）】\n仅包含当前 Intent、同资产或直接血缘相关的历史，用于避免重复和衔接证据；不要扩大执行范围。\n")
	if hints := workerContextHints(data); len(hints) > 0 {
		if encoded, err := json.Marshal(hints); err == nil {
			fmt.Fprintf(&b, "【有效人工提示（完整保留）】%s\n", encoded)
		}
	}
	ovRows(&b, "相关意图", workerContextSelectedIntents(intents, relevance, intent.ID), "summary", 340, workerContextIntentCap)
	ovRows(&b, "相关事实", workerContextSelectedFacts(facts, relevance), "summary", 340, workerContextFactCap)
	ovRows(&b, "相关发现", workerContextSelectedFacts(findings, relevance), "summary", 340, workerContextFindingCap)

	digests := workerContextSelectedDigests(workerContextRows(data, "cold_digests", "cold_digests"), relevance)
	moreDigests := []int64{}
	if len(digests) > workerContextDigestCap {
		for _, digest := range digests[workerContextDigestCap:] {
			moreDigests = append(moreDigests, workerContextID(digest["id"]))
		}
		digests = digests[:workerContextDigestCap]
	}
	ovDigests(&b, digests, moreDigests, 4000, 1000)

	refs := make([]int64, 0, len(relevance.nodes))
	for id := range relevance.nodes {
		refs = append(refs, id)
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i] < refs[j] })
	if len(refs) > 0 {
		shown := refs
		if len(shown) > workerContextRefCap {
			shown = shown[:workerContextRefCap]
		}
		fmt.Fprintf(&b, "【相关节点索引】%s", ovIDs(shown))
		if omitted := len(refs) - len(shown); omitted > 0 {
			fmt.Fprintf(&b, "；另有%d个未列出", omitted)
		}
		b.WriteByte('\n')
	}
	b.WriteString("【按需回源】list_facts 查更多事实，node_detail(id) 查完整节点，expand_digest(id) 展开折叠历史，search_all_worker_traces 按关键词查执行记录；未出现的内容不等于未测试。\n")
	return strings.TrimSpace(b.String())
}

func workerContextRelevanceFor(intent *db.Node, intents, facts, findings []map[string]any) workerContextRelevance {
	r := workerContextRelevance{assets: map[int64]bool{}, intents: map[int64]bool{}, nodes: map[int64]bool{}}
	for _, id := range intentAssetIDs(intent) {
		r.assets[id] = true
	}
	r.intents[intent.ID] = true
	for _, row := range intents {
		if workerContextID(row["id"]) == intent.ID {
			workerContextAddAssets(r.assets, row["asset_ids"])
		}
	}
	for changed := true; changed; {
		changed = false
		for _, row := range intents {
			id := workerContextID(row["id"])
			linked := r.intents[id] || r.nodes[id] || workerContextAssetsOverlap(r.assets, row["asset_ids"])
			if !linked {
				linked = workerContextLinksOverlap(r, row)
			}
			if linked {
				if !r.intents[id] {
					r.intents[id] = true
					changed = true
				}
				if workerContextAddLinks(&r, row) {
					changed = true
				}
			}
		}
		for _, rows := range [][]map[string]any{facts, findings} {
			for _, row := range rows {
				id := workerContextID(row["id"])
				from := workerContextID(row["from_intent"])
				if !r.nodes[id] && !r.intents[from] {
					continue
				}
				if !r.nodes[id] {
					r.nodes[id] = true
					changed = true
				}
				if from > 0 && !r.intents[from] {
					r.intents[from] = true
					changed = true
				}
			}
		}
	}
	return r
}

func workerContextIntentRows(data map[string]any) []map[string]any {
	rows := workerContextRows(data, "open_intents", "recent_intent_results")
	rows = append(rows, ovMaps(data["running_intents"])...)
	rows = append(rows, ovMaps(data["recent_done_intents"])...)
	for _, source := range ovMaps(data["related_tasks"]) {
		rows = append(rows, ovMaps(source["running_intents"])...)
	}
	return workerContextUniqueRows(rows)
}

func workerContextRows(data map[string]any, local, source string) []map[string]any {
	rows := append([]map[string]any{}, ovMaps(data[local])...)
	for _, task := range ovMaps(data["related_tasks"]) {
		rows = append(rows, ovMaps(task[source])...)
	}
	return workerContextUniqueRows(rows)
}

func workerContextUniqueRows(rows []map[string]any) []map[string]any {
	seen := map[int64]bool{}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		id := workerContextID(row["id"])
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, row)
	}
	return out
}

func workerContextSelectedIntents(rows []map[string]any, r workerContextRelevance, current int64) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		id := workerContextID(row["id"])
		if id != current && r.intents[id] {
			out = append(out, row)
		}
	}
	return out
}

func workerContextSelectedFacts(rows []map[string]any, r workerContextRelevance) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		if r.nodes[workerContextID(row["id"])] || r.intents[workerContextID(row["from_intent"])] {
			out = append(out, row)
		}
	}
	return out
}

func workerContextSelectedDigests(rows []map[string]any, r workerContextRelevance) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		relevant := false
		for _, work := range ovMaps(row["work"]) {
			relevant = relevant || r.intents[workerContextID(work["intent_id"])]
		}
		for _, result := range ovMaps(row["key_results"]) {
			relevant = relevant || r.nodes[workerContextID(result["fact_id"])]
		}
		for _, kind := range []string{"facts", "findings", "intents"} {
			for _, id := range workerContextDigestRefIDs(row["source_refs"], kind) {
				relevant = relevant || r.nodes[id] || r.intents[id]
			}
		}
		if relevant {
			out = append(out, row)
		}
	}
	return out
}

func workerContextDigestRefIDs(value any, kind string) []int64 {
	switch refs := value.(type) {
	case map[string][]int64:
		return refs[kind]
	case map[string]any:
		return workerContextIDs(refs[kind])
	default:
		return nil
	}
}

func workerContextHints(data map[string]any) []map[string]any {
	out := append([]map[string]any{}, ovMaps(data["hints"])...)
	for _, source := range ovMaps(data["related_tasks"]) {
		for _, hint := range ovMaps(source["hints"]) {
			if hint["source_task_id"] == nil {
				clone := make(map[string]any, len(hint)+1)
				for key, value := range hint {
					clone[key] = value
				}
				clone["source_task_id"] = source["source_task_id"]
				hint = clone
			}
			out = append(out, hint)
		}
	}
	return out
}

func workerContextLinksOverlap(r workerContextRelevance, row map[string]any) bool {
	for _, field := range []string{"parents", "yields"} {
		for _, id := range workerContextIDs(row[field]) {
			if r.nodes[id] || r.intents[id] {
				return true
			}
		}
	}
	return false
}

func workerContextAddLinks(r *workerContextRelevance, row map[string]any) bool {
	changed := false
	for _, field := range []string{"parents", "yields"} {
		for _, id := range workerContextIDs(row[field]) {
			if id > 0 && !r.nodes[id] {
				r.nodes[id] = true
				changed = true
			}
		}
	}
	return changed
}

func workerContextAddAssets(set map[int64]bool, value any) {
	for _, id := range workerContextIDs(value) {
		set[id] = true
	}
}

func workerContextAssetsOverlap(set map[int64]bool, value any) bool {
	for _, id := range workerContextIDs(value) {
		if set[id] {
			return true
		}
	}
	return false
}

func workerContextIDs(value any) []int64 {
	out := []int64{}
	switch values := value.(type) {
	case []int64:
		out = append(out, values...)
	case []any:
		for _, value := range values {
			if id := workerContextID(value); id > 0 {
				out = append(out, id)
			}
		}
	case []string:
		for _, value := range values {
			if id := workerContextID(value); id > 0 {
				out = append(out, id)
			}
		}
	}
	return out
}

func workerContextID(value any) int64 {
	switch id := value.(type) {
	case int:
		return int64(id)
	case int64:
		return id
	case float64:
		return int64(id)
	case json.Number:
		parsed, _ := id.Int64()
		return parsed
	case string:
		parsed, _ := strconv.ParseInt(id, 10, 64)
		return parsed
	default:
		return 0
	}
}
