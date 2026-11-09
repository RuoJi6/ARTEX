package server

import (
	"net/http"
	"strconv"

	"github.com/Autumn-27/artex/db"
)

// taskFindingsPage pages current and direct-source nodes in one sorted list.
func (s *Server) taskFindingsPage(w http.ResponseWriter, r *http.Request, task *Task) {
	q := r.URL.Query()
	page := findingPaginationParam(q.Get("page"), 1, 0)
	size := findingPaginationParam(q.Get("limit"), 20, 200)
	if page > int(^uint(0)>>1)/size {
		writeErr(w, 400, "page is too large")
		return
	}
	sources, err := task.Store.DirectSourceStores()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	type owner struct{ id, description string }
	owners := map[int64]owner{task.ExpID: {task.ID, task.Description}}
	explorations := []int64{task.ExpID}
	for _, source := range sources {
		explorations = append(explorations, source.Task.ExplorationID)
		owners[source.Task.ExplorationID] = owner{i64s(source.Task.TaskID), source.Task.Description}
	}
	severity := normFilter(q.Get("severity"))
	if severity != "" && severity != "critical" && severity != "high" && severity != "medium" && severity != "low" {
		writeErr(w, 400, "invalid severity")
		return
	}
	nodes, total, err := task.Store.FindingNodesPage(explorations, severity, q.Get("q"), q.Get("sort"), q.Get("order"), page, size)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	nodeIDs := make([]int64, 0, len(nodes))
	for _, row := range nodes {
		nodeIDs = append(nodeIDs, row.Node.ID)
	}
	metadata, err := s.m.pg.FindingMetaForNodes(nodeIDs)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var assetIDs []int64
	for _, row := range nodes {
		if item, ok := metadata[row.Node.ID]; ok {
			assetIDs = append(assetIDs, item.AssetIDs...)
		}
	}
	assets := s.resolveAssetIDs(assetIDs)
	items := make([]FindingDTO, 0, len(nodes))
	for _, row := range nodes {
		owner := owners[row.ExplorationID]
		if row.ExplorationID != task.ExpID {
			row.Node.SourceTaskID, _ = strconv.ParseInt(owner.id, 10, 64)
			row.Node.Inherited = true
		}
		items = append(items, findingDTOsForOwner(owner.id, owner.description, []*db.Node{row.Node}, metadata, assets)...)
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "page_size": size})
}
