package agent

// cold-digest §6: graph_overview folding + the restore tools.
//
//	coldDigestsRecent — builds folded cards with model body plus deterministic
//	  work, key_results, unresolved and source_refs, newest-member first, capped.
//	expand_digest(id)  — level-1 restore: a digest's member compact list.

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// digestMemberEntry builds the compact per-member view expand_digest returns —
// same shape as recent_facts / recent_done_intents (§6.1 middle level). store is
// the digest's OWNING store (the current task, or a read-only source task §2).
func (t *ToolSet) digestMemberEntry(store *db.ExplorationStore, id int64) map[string]any {
	n, _ := store.GetNode(id)
	if n == nil {
		return map[string]any{"id": id, "missing": true}
	}
	m := compactNode(n)
	m["state"] = n.State
	var p map[string]any
	if json.Unmarshal(n.Payload, &p) == nil {
		if c, ok := p["confidence"].(string); ok && c != "" {
			m["confidence"] = c
		}
	}
	return m
}

type lineageDigestView struct {
	digests []*db.Node
	members map[int64][]int64
	nodes   map[int64]*db.Node
	parents map[int64][]int64
	yields  map[int64][]int64
	covered map[int64]int64
	hot     map[int64]bool
}

func (v *lineageDigestView) hidden(id int64) bool {
	_, covered := v.covered[id]
	return covered && !v.hot[id]
}

func loadLineageDigestView(store *db.ExplorationStore, digests []*db.Node, fullGraph bool) *lineageDigestView {
	view := &lineageDigestView{
		digests: digests, members: map[int64][]int64{}, nodes: map[int64]*db.Node{},
		parents: map[int64][]int64{}, yields: map[int64][]int64{},
		covered: map[int64]int64{}, hot: map[int64]bool{},
	}
	if len(digests) == 0 {
		return view
	}
	digestIDs := make([]int64, 0, len(digests))
	for _, digest := range digests {
		digestIDs = append(digestIDs, digest.ID)
	}
	membersByDigest, _ := store.DigestMembersFor(digestIDs)
	allMembers := map[int64]bool{}
	for _, digest := range digests {
		members := membersByDigest[digest.ID]
		view.members[digest.ID] = members
		for _, id := range members {
			allMembers[id] = true
			if _, exists := view.covered[id]; !exists {
				view.covered[id] = digest.ID
			}
		}
	}
	memberIDs := make([]int64, 0, len(allMembers))
	for id := range allMembers {
		memberIDs = append(memberIDs, id)
	}
	var edges []db.Edge
	if fullGraph {
		g, nodes, graphEdges, err := loadColdGraphParts(store)
		if err == nil {
			view.nodes = nodes
			view.hot = g.hotSet()
			edges = graphEdges
		}
	} else {
		nodes, _ := store.NodesByIDs(memberIDs)
		view.nodes = indexColdNodes(nodes)
		edges, _ = store.EdgesTouching(memberIDs)
	}
	for _, edge := range edges {
		switch edge.Rel {
		case db.RelDerivedFrom, db.RelSpawns:
			view.parents[edge.To] = append(view.parents[edge.To], edge.From)
		case db.RelYields:
			view.yields[edge.From] = append(view.yields[edge.From], edge.To)
		}
	}
	return view
}

func digestDecisionFields(view *lineageDigestView, digest *db.Node, detailed bool) map[string]any {
	memberIDs := view.members[digest.ID]
	intentIDs := []int64{}
	factIDs := []int64{}
	for _, id := range memberIDs {
		node := view.nodes[id]
		if node == nil {
			continue
		}
		switch node.Kind {
		case db.KindIntent:
			intentIDs = append(intentIDs, id)
		case db.KindFact:
			factIDs = append(factIDs, id)
		}
	}
	work := make([]map[string]any, 0, len(intentIDs))
	unresolved := []map[string]any{}
	for _, intentID := range intentIDs {
		node := view.nodes[intentID]
		entry := map[string]any{"intent_id": intentID, "state": node.State}
		if detailed {
			parentIDs := append([]int64{}, view.parents[intentID]...)
			resultIDs := append([]int64{}, view.yields[intentID]...)
			sort.Slice(parentIDs, func(i, j int) bool { return parentIDs[i] < parentIDs[j] })
			sort.Slice(resultIDs, func(i, j int) bool { return resultIDs[i] < resultIDs[j] })
			entry["goal"] = nodeSummary(node)
			entry["parent_ids"] = parentIDs
			entry["result_ids"] = resultIDs
		}
		work = append(work, entry)
		switch node.State {
		case "blocked", "exhausted", "stopped":
			reason := node.BlockedReason
			if reason == "" {
				reason = "工作状态为 " + node.State + "，未完成范围需按原始记录确认"
			}
			unresolved = append(unresolved, map[string]any{
				"intent_id": intentID, "state": node.State, "reason": reason,
			})
		}
	}
	keyResults := make([]map[string]any, 0, len(factIDs))
	for _, factID := range factIDs {
		node := view.nodes[factID]
		entry := map[string]any{
			"fact_id": factID, "state": node.State, "summary": nodeSummary(node),
			"confidence": nodeConfidence(node),
		}
		var raw map[string]any
		if json.Unmarshal(node.Payload, &raw) == nil {
			if conditions, ok := raw["conditions"].(string); ok && conditions != "" {
				entry["conditions"] = conditions
			}
		}
		keyResults = append(keyResults, entry)
	}
	refs := map[string][]int64{"intents": {}, "facts": {}, "findings": {}}
	for _, id := range memberIDs {
		node := view.nodes[id]
		if node == nil {
			continue
		}
		switch node.Kind {
		case db.KindIntent:
			refs["intents"] = append(refs["intents"], id)
		case db.KindFact:
			refs["facts"] = append(refs["facts"], id)
		case db.KindFinding:
			refs["findings"] = append(refs["findings"], id)
		}
	}
	for _, ids := range refs {
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	}
	return map[string]any{
		"work": work, "key_results": keyResults,
		"unresolved": unresolved, "source_refs": refs,
	}
}

// coldDigestsRecent returns active digest bodies and deterministic decision
// fields for graph_overview, ordered by the recency of their freshest member (max member id ≈
// latest cooled node — a digest near the live frontier is likelier relevant), and
// capped at `cap`. Overflow digest ids are returned separately (moreIDs) so they
// stay reachable via expand_digest even when not shown inline — cold_digests is the
// only exit for folded cold nodes. Shared by the current task overview and the
// read-only related-task overview (§2 cross-task reuse).
func coldDigestsRecent(store *db.ExplorationStore, cap int) (shown []map[string]any, moreIDs []int64) {
	ads, err := store.ActiveDigests()
	if err != nil || len(ads) == 0 {
		return nil, nil
	}
	return coldDigestsRecentView(loadLineageDigestView(store, ads, false), cap)
}

func coldDigestsRecentView(view *lineageDigestView, cap int) (shown []map[string]any, moreIDs []int64) {
	type dg struct {
		digest    *db.Node
		freshness int64
	}
	items := make([]dg, 0, len(view.digests))
	for _, d := range view.digests {
		ms := view.members[d.ID]
		var fresh int64
		if len(ms) > 0 {
			fresh = ms[len(ms)-1]
		}
		items = append(items, dg{digest: d, freshness: fresh})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].freshness > items[j].freshness })
	for i, it := range items {
		d := it.digest
		if i >= cap {
			moreIDs = append(moreIDs, d.ID)
			continue
		}
		var p struct {
			Body string `json:"body"`
		}
		_ = json.Unmarshal(d.Payload, &p)
		ms := view.members[d.ID]
		entry := map[string]any{"id": d.ID, "body": p.Body, "member_count": len(ms)}
		for key, value := range digestDecisionFields(view, d, false) {
			entry[key] = value
		}
		shown = append(shown, entry)
	}
	return shown, moreIDs
}

// hiddenMembersFor returns a predicate telling whether a member is hidden (folded
// into an active digest AND still cold) in the given store — so a source task's
// overview folds exactly the way that task folds itself (§2 cross-task: "当前任务
// 什么展示逻辑，关联任务就什么逻辑"). A revived (now hot) covered member is NOT
// hidden (§6 render-time revival check). Returns a never-hidden predicate when the
// store has no digests.
func hiddenMembersFor(store *db.ExplorationStore) func(int64) bool {
	ads, _ := store.ActiveDigests()
	return loadLineageDigestView(store, ads, true).hidden
}

// resolveDigest finds a digest node by id in the current task, else in a direct
// source task (read-only, §2). Returns the node, its owning store, and the source
// task id (0 = current task).
func (t *ToolSet) resolveDigest(id int64) (*db.Node, *db.ExplorationStore, int64) {
	if n, _ := t.ts.GetNode(id); n != nil && n.Kind == db.KindDigest {
		return n, t.ts, 0
	}
	srcs, _ := t.ts.DirectSourceStores()
	for _, s := range srcs {
		if n, _ := s.Store.GetNode(id); n != nil && n.Kind == db.KindDigest {
			return n, s.Store, s.Task.TaskID
		}
	}
	return nil, nil, 0
}

// expandDigest returns a digest's covered members as a compact list (§6.1). It is
// a distinct tool from node_detail because it returns a LIST of members, not one
// node's full detail.
func (t *ToolSet) expandDigest() actool.CoreTool {
	return t.writeExpTool("expand_digest",
		"展开一个 cold digest：返回它折叠的成员紧凑列表（id/summary/state/confidence），与概览 recent_facts/recent_done_intents 同形状。要某条完整细节/证据用 node_detail(member_id)。",
		map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id": map[string]any{"type": "integer", "description": "digest 节点 id（来自概览 cold_digests）"},
			},
			"required": []any{"id"},
		},
		func(ctx context.Context, raw json.RawMessage) (actool.Result, error) {
			var in struct {
				ID int64 `json:"id"`
			}
			_ = json.Unmarshal(raw, &in)
			n, store, srcTaskID := t.resolveDigest(in.ID)
			if n == nil {
				return jsonResult(map[string]any{"error": fmt.Sprintf("#%d 不是 digest 节点（本任务或直接关联任务里都没找到）", in.ID)})
			}
			var p struct {
				Body string `json:"body"`
			}
			_ = json.Unmarshal(n.Payload, &p)
			members, _ := store.DigestMembers(in.ID)
			list := make([]map[string]any, 0, len(members))
			for _, m := range members {
				entry := t.digestMemberEntry(store, m)
				if srcTaskID > 0 { // 关联任务的成员：只读，带继承标记（§2）
					entry["inherited"] = true
					entry["source_task_id"] = srcTaskID
				}
				list = append(list, entry)
			}
			out := map[string]any{
				"id":      in.ID,
				"state":   n.State, // active / superseded
				"body":    p.Body,
				"members": list,
			}
			if n.State == db.StateDigestActive {
				view := loadLineageDigestView(store, []*db.Node{n}, false)
				for key, value := range digestDecisionFields(view, n, true) {
					out[key] = value
				}
			}
			if srcTaskID > 0 {
				out["inherited"] = true
				out["source_task_id"] = srcTaskID
			}
			return jsonResult(out)
		})
}
